// The AI ruleset builder, in one pass (CORE-DESIGN §5.3 step 4): read the card (one helper call; Jev classifies
// when it is set) → Story or Adventure → three questions and up to three about the card → draft = that template
// themed for the card, its parts in parallel → checker repair (at most two rounds) → preview → install.
// Refine changes an installed ruleset by instruction: one call, then the same repair. Deep passes, checks and
// playtests are Warp Studio's.
//
// The model only ever rewrites words in a template part; Warp's own checker decides whether the result is valid and
// feeds its messages back for repair.

import type { GenerationResponseDTO } from "lumiverse-spindle-types";
import { DESIGN_GUIDE, PART_CONTENTS, PART_LABELS, partForIssue, REFERENCE, type PartLabel } from "../engine/reference.js";
import { isRulesetBookName, isRulesetEntryTitle, loadRuleset, type RulesetPart } from "../engine/loader.js";
import { lintRuleset } from "../engine/lint.js";
import type { Issue, Ruleset } from "../engine/ruleset.js";
import { initialState } from "../engine/state.js";
import { getTemplate, withCharacter } from "../engine/templates/index.js";
import { buildChoices, buildHud } from "../engine/view.js";
import type { BuilderAddition, BuilderAnswer, BuilderPart, BuilderQuestion, BuilderSession } from "../shared/protocol.js";
import { host, logError, send } from "./host.js";
import { BUILDER_SESSION_VERSION, restoreBuilderSession } from "./builder-session.js";
import { characterForChat, invalidateCharacter, knownRulesetBookIds } from "./source.js";
import { publishRulebook, rulesetEntries } from "./rulebook-install.js";
import { getSettings } from "./settings.js";
import { getDecider, JevDecider, LlmDecider } from "./deciders.js";
import { cardPrompt, cardQuestions, cardVerdict, coreQuestions, readCard, type CardClass, type Style } from "./card-read.js";

// ───────────────────────── sessions ─────────────────────────

const sessions = new Map<string, BuilderSession>();
const sessionChats = new WeakMap<BuilderSession, string>();
const retired = new WeakSet<BuilderSession>();
const controllers = new WeakMap<BuilderSession, AbortController>();
function sessionSignal(s: BuilderSession): AbortSignal {
  let controller = controllers.get(s);
  if (!controller) { controller = new AbortController(); controllers.set(s, controller); }
  return controller.signal;
}
function retire(s: BuilderSession) { retired.add(s); controllers.get(s)?.abort(new Error("Builder draft closed")); }
const key = (userId: string | undefined, characterId: string) => `${userId ?? "_"}:${characterId}`;
const path = (characterId: string) => `builder/${characterId}.json`;

async function save(s: BuilderSession, userId?: string) {
  if (retired.has(s)) return;
  s.schemaVersion = BUILDER_SESSION_VERSION;
  s.updatedAt = Date.now();
  sessions.set(key(userId, s.characterId), s);
  try { await host().userStorage.setJson(path(s.characterId), s, { userId }); } catch (e) { logError("builder save", e); }
}

function emit(s: BuilderSession | null, userId?: string, chatId?: string | null) {
  if (s && retired.has(s)) return;
  send({ type: "builder", session: s, chatId: chatId ?? (s ? sessionChats.get(s) : null) }, userId);
}

async function progress(s: BuilderSession, label: string | null, userId?: string) {
  s.busy = label;
  if (label) s.error = null;
  emit(s, userId);
  if (!label) await save(s, userId);
}

async function sessionFor(chatId: string, userId?: string): Promise<BuilderSession | null> {
  const characterId = await characterForChat(chatId, userId);
  if (!characterId) return null;
  const hit = sessions.get(key(userId, characterId));
  if (hit) { sessionChats.set(hit, chatId); return hit; }
  let stored: unknown;
  try { stored = await host().userStorage.getJson<unknown>(path(characterId), { fallback: null, userId }); }
  catch { return null; }
  if (stored == null) return null;
  const restored = restoreBuilderSession(stored, characterId);
  sessionChats.set(restored, chatId);
  if (restored.parts.length) buildPreview(restored);
  await save(restored, userId);
  return restored;
}

// ───────────────────────── model calls ─────────────────────────

async function llm(s: BuilderSession, system: string, user: string, userId: string | undefined, maxTokens = 3000): Promise<string> {
  const res = (await host().generate.quiet({
    type: "quiet",
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    connection_id: s.connectionId || undefined,
    parameters: { temperature: 0.5, max_tokens: maxTokens },
    userId,
    signal: AbortSignal.any([sessionSignal(s), AbortSignal.timeout(180_000)]),
  })) as GenerationResponseDTO | string;
  return typeof res === "string" ? res : res?.content ?? "";
}

function parseJson(text: string): Record<string, unknown> | null {
  const t = text.replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/** The model's YAML: the fenced block if there is one, else the text minus chatter before the first key. */
export function extractYaml(text: string): string {
  const fenced = /```(?:ya?ml)?\s*\n([\s\S]*?)```/i.exec(text);
  let y = fenced ? fenced[1] : text;
  const lines = y.split("\n");
  const first = lines.findIndex((l) => /^[A-Za-z_][\w-]*:/.test(l) || /^#/.test(l));
  if (first > 0) y = lines.slice(first).join("\n");
  return y.trim() + "\n";
}

// ───────────────────────── the card ─────────────────────────

async function cardText(characterId: string, userId?: string): Promise<{ name: string; text: string; hasRuleset: boolean }> {
  const c = await host().characters.get(characterId, userId);
  if (!c) throw new Error("Character not found");
  const clip = (v: string, n: number) => (v.length > n ? `${v.slice(0, n)}…` : v);
  const parts = [
    `Name: ${c.name}`,
    c.description && `Description:\n${clip(c.description, 4000)}`,
    c.personality && `Personality:\n${clip(c.personality, 1500)}`,
    c.scenario && `Scenario:\n${clip(c.scenario, 1500)}`,
    c.first_mes && `Greeting:\n${clip(c.first_mes, 2500)}`,
    c.creator_notes && `Creator notes:\n${clip(c.creator_notes, 1000)}`,
  ].filter(Boolean) as string[];
  let hasRuleset = false;
  const lore: string[] = [];
  for (const bookId of c.world_book_ids ?? []) {
    const book = await host().world_books.get(bookId, userId);
    if (!book) continue;
    if (isRulesetBookName(book.name)) { hasRuleset = true; continue; }
    const page = await host().world_books.entries.list(bookId, { limit: 60, userId });
    for (const e of page.data) {
      if (isRulesetEntryTitle(e.comment)) { hasRuleset = true; continue; }
      if (lore.length < 40) lore.push(`- ${e.comment || e.key.join(", ") || "entry"}: ${clip(e.content.replace(/\s+/g, " "), 220)}`);
    }
  }
  if (lore.length) parts.push(`Lorebook (excerpts):\n${lore.join("\n")}`);
  return { name: c.name, text: parts.join("\n\n"), hasRuleset };
}

/** Jev when it is set and usable, else null (the helper then classifies inside its card-read call). */
async function classifier(userId?: string): Promise<JevDecider | null> {
  try {
    const settings = await getSettings(userId);
    if (settings.decider !== "jev") return null;
    const d = await getDecider(settings, userId);
    return d instanceof JevDecider ? d : null;
  } catch (e) {
    logError("builder classifier", e);
    return null;
  }
}

// ───────────────────────── answers ─────────────────────────

function answerOf(s: BuilderSession, id: string): BuilderAnswer | undefined {
  for (const r of s.rounds) for (const q of r.questions) if (q.id === id) return r.answers[id] ?? q.default;
  return undefined;
}

/** The style to draft: the player's switch, else what the read suggested, else Adventure. */
function styleOf(s: BuilderSession): Style {
  const a = answerOf(s, "style") ?? s.base;
  return a === "story" ? "story" : "adventure";
}

function answerText(q: BuilderQuestion, a: BuilderAnswer | undefined): string {
  if (a === undefined || a === "" || (Array.isArray(a) && !a.length)) return "(no answer)";
  const label = (id: string) => q.options?.find((o) => o.id === id)?.label ?? id;
  if (Array.isArray(a)) return a.map(label).join(", ");
  if (q.kind === "scale") return `${a} of 5 (1 = forgiving, 5 = punishing)`;
  return typeof a === "string" ? label(a) : String(a);
}

/** What every themed part is written against: the card, the read, the answers and the player's own additions. */
function brief(s: BuilderSession): string {
  const a = s.analysis;
  const style = styleOf(s);
  const qa = s.rounds.flatMap((r) => r.questions.filter((q) => q.id !== "style" && !(q.id === "difficulty" && style === "story")).map((q) => `- ${q.text} → ${answerText(q, r.answers[q.id] ?? q.default)}`));
  const adds = s.additions.filter((x) => x.name.trim()).map((x) => `- ${x.kind}: ${x.name}${x.note ? ` (${x.note})` : ""}`);
  return [
    `Character card: ${s.characterName}`,
    a ? `What the card is: ${a.summary}` : "",
    `Template: ${style === "story" ? "Story (no dice: no check:, no conflict:)" : "Adventure (d20 checks at risky moments, contests)"}.`,
    a?.cardType === "scenario" ? `This is a scenario/narrator card: "${s.characterName}" is the setting, NOT a person: never add it to people.` : "",
    a?.statusBlock?.found ? `The card makes the model print a status block (${a.statusBlock.fields.join(", ") || "stats"}). Warp tracks it now: the narration notes must tell the narrator not to print status blocks.` : "",
    a?.romance ? "Romance is a main theme: the people part tracks attraction." : "",
    a?.cast?.length ? `Main cast and how each starts out toward {{user}}:\n${a.cast.map((c) => `- ${c.name}: ${c.relation}${c.age ? ` (age ${c.age})` : ""}${c.appearance ? `; looks: ${c.appearance}` : ""}${c.outfit ? `; wears: ${c.outfit}` : ""}`).join("\n")}` : "",
    qa.length ? `The player's answers:\n${qa.join("\n")}` : "",
    adds.length ? `The player's own additions (fit each in, inside the format and this part's contents):\n${adds.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

// ───────────────────────── the template, adjusted before theming ─────────────────────────

const ATTRACTION = "    attraction: { start: 0, narrator: 6, good: none, bands: { 0: No spark, 15: Curious, 35: Drawn, 60: Wanting, 85: Consumed } }\n";

/** Add attraction (a romance) as the last relationship stat, replacing the template's commented example. */
export function withAttraction(yaml: string): string {
  if (/^ {4}attraction:/m.test(yaml)) return yaml;
  const y = yaml.replace(/^ {2}# For a romance[^\n]*\n {2}# attraction:[^\n]*\n/m, "");
  const m = /^ {2}people:/m.exec(y);
  return m ? y.slice(0, m.index) + ATTRACTION + y.slice(m.index) : y;
}

/** Difficulty 1–5 moves every target by 2 per step (3 = the template's 8 / 12 / 16 / 20). */
export function withDifficulty(yaml: string, level: number): string {
  const shift = (Math.max(1, Math.min(5, Math.round(level))) - 3) * 2;
  if (!shift) return yaml;
  return yaml.replace(/dc: \{ easy: (\d+), fair: (\d+), hard: (\d+), extreme: (\d+) \}/, (_, ...n: string[]) => {
    const [e, f, h, x] = n.slice(0, 4).map((v) => Number(v) + shift);
    return `dc: { easy: ${e}, fair: ${f}, hard: ${h}, extreme: ${x} }`;
  });
}

/** Relationship pace: slow burn = the template's caps; steady and quick raise each cap per reply. */
export function withPace(yaml: string, pace: string): string {
  const add = pace === "fast" ? 4 : pace === "steady" ? 2 : 0;
  if (!add) return yaml;
  // Every relationship cap (block or inline form); comments stay as written.
  return yaml.split("\n").map((l) => (/^\s*#/.test(l) ? l : l.replace(/\bnarrator: (\d+)/g, (_, n: string) => `narrator: ${Number(n) + add}`))).join("\n");
}

/** The chosen template's parts, adjusted for the card and the answers before the model themes them. */
function baseParts(s: BuilderSession): { label: string; yaml: string }[] {
  const t = getTemplate(styleOf(s))!;
  const level = Number(answerOf(s, "difficulty") ?? 3);
  const pace = String(answerOf(s, "pace") ?? "slow");
  return t.parts.map((p) => {
    let y = p.yaml;
    if (p.label === "people") {
      if (s.analysis?.romance) y = withAttraction(y);
      y = withPace(y, pace);
      if (s.analysis?.cardType !== "scenario") y = withCharacter(y, s.characterName);
    }
    if (p.label === "stats") y = withDifficulty(y, Number.isFinite(level) ? level : 3);
    return { label: p.label, yaml: y };
  });
}

/** What the model may change in each part (CORE-DESIGN §3.3). */
const PART_JOBS: Record<PartLabel, string> = {
  core: "Give the game a name: for this card and a one-line description:. Rewrite narration.notes in the card's tone, keeping their rules. Adventure: set hud.currency to fit the setting (gold, credits, ¥…). Keep style:, clock.start: greeting and start.place: greeting.",
  stats: "Fit the meters and attributes to the setting: label:, desc:, band texts and say:/say_down: lines in the card's voice (an attribute may get a fitting label, e.g. Body → Grit). Keep every id, kind, max and the checks numbers as given.",
  people: "Fit the relationship stats to the card: label: (e.g. trust shown as Loyalty), band texts, say:/say_down: lines and voice: lines in the card's voice; keep the ids, starts and narrator caps as given. Under people:, fill in the main cast: snake_case id, name, desc, age only if the card states it (adults only), appearance and outfit only if the card states them, and start: feelings that match how each feels about {{user}} at the beginning.",
  world: "Fit the conditions to the setting (label, desc). Add at most 3 items the card makes important, each doing something (a use: or a bonus:). Keep the condition ids.",
  actions: "Rewrite each action's label and say: line in the card's voice. Keep the ids, times and effects.",
  story: "Rewrite the live-choice guide and every tag's desc: in the card's tone; keep the tag ids, checks and effects. Add 0–2 secrets for people who hide something (person:, tell: exists, a cue:, then 2 stages opened by band: on that person's relationship stats, using the band names listed below). Add 0–2 goals under goals.list only if the card promises them (text, stakes, done_when or judge). Keep the triggers.",
  conflict: "Fit the contest kinds to the card: label (e.g. a duel, a debate), and the won/lost/escaped hints. Keep the kind ids, stats, escape stats and costs.",
};

const SYSTEM_PROMPT = `You fit one part of a Warp ruleset template to a roleplay character card. Warp is a game engine under the chat: it keeps score of time, place, people and risky moments.
Output ONLY the YAML for the requested part: no prose, no explanations. Keep the part's structure and every id (stats, relationship stats, people, tags, actions, conditions, contest kinds).
Change words (labels, band texts, say/say_down/voice lines, descriptions, hints, guides, notes) and add only what the job asks for. Never add a key or a system the format doesn't list.
Write in-world text in a voice that suits the card. Refer to the player as {{user}}. Quote any formula that contains a comma.

${DESIGN_GUIDE}

${REFERENCE}`;

// ───────────────────────── drafting & checking ─────────────────────────

function merged(parts: BuilderPart[]): RulesetPart[] {
  return parts.map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: i }));
}

/** The part an issue belongs to; an issue about a part the draft doesn't have goes to the part that holds its key, else the first. */
function ownerOf(parts: BuilderPart[], where: string): BuilderPart | undefined {
  const label = partForIssue(where);
  const hit = parts.find((p) => p.label === label);
  if (hit) return hit;
  const key = where.replace(/^warp-ruleset\s*·\s*/i, "").split(/[›,]/)[0].trim().toLowerCase().replace(/\s+/g, "_");
  return parts.find((p) => new RegExp(`^${key}:`, "m").test(p.yaml)) ?? parts[0];
}

function check(parts: BuilderPart[]): { ruleset: Ruleset | null; issues: Issue[] } {
  const { ruleset, issues } = loadRuleset(merged(parts));
  const all = ruleset ? [...issues, ...lintRuleset(ruleset)] : issues;
  for (const p of parts) p.issues = [];
  for (const i of all) ownerOf(parts, i.where)?.issues.push(i);
  for (const p of parts) p.status = p.issues.some((i) => i.level === "error") ? "error" : p.issues.length ? "warn" : "ok";
  return { ruleset, issues: all };
}

/** Ids the other parts can refer to, so parallel drafts line up (with relationship band names, for secrets). */
function contextOf(parts: BuilderPart[]): string {
  const { ruleset: r } = loadRuleset(merged(parts.filter((p) => p.yaml.trim())));
  if (!r) return "";
  const list = (label: string, ids: string[]) => (ids.length ? `${label}: ${ids.join(", ")}` : "");
  return [
    list("Stats", r.statOrder.map((id) => `${id} (${r.stats[id].kind}${r.stats[id].label !== id ? `, shown as ${r.stats[id].label}` : ""})`)),
    list("Relationship stats", r.relStatOrder.map((id) => `${id} (bands: ${r.relStats[id].bands.map((b) => b.text).join(", ")})`)),
    list("People", Object.values(r.people).map((p) => `${p.id} (${p.name})`)),
    list("Items", Object.keys(r.items)),
    list("Conditions", Object.keys(r.conditions)),
    list("Flags", Object.keys(r.flags)),
  ].filter(Boolean).join("\n");
}

async function themePart(s: BuilderSession, label: string, base: string, context: string, userId?: string, note?: string, current?: string): Promise<string> {
  const known = (PART_LABELS as readonly string[]).includes(label) ? label as PartLabel : null;
  const user = [
    brief(s),
    `Theme the "${label}" part for this card.${known ? ` It may contain only: ${PART_CONTENTS[known]}.` : ""}`,
    known ? `The job: ${PART_JOBS[known]}` : "",
    `The template part (the starting point):\n${base}`,
    current ? `The current version of this part:\n${current}` : "",
    context ? `Ids in the other parts (reuse them exactly; don't define them here):\n${context}` : "",
    note ? `The player asked for this change: ${note}` : "",
  ].filter(Boolean).join("\n\n");
  return extractYaml(await llm(s, SYSTEM_PROMPT, user, userId, 3500));
}

/** Checker repair: at most two rounds, only the parts with problems (warnings too in the first round). */
async function repair(s: BuilderSession, parts: BuilderPart[], userId?: string, includeWarnings = true) {
  for (let round = 0; round < 2; round++) {
    check(parts);
    const broken = parts.filter((p) => p.status === "error" || (includeWarnings && round === 0 && p.status === "warn"));
    if (!broken.length) return;
    await progress(s, `Fixing ${broken.map((p) => p.label).join(", ")}…`, userId);
    const context = contextOf(parts);
    await Promise.all(broken.map(async (p) => {
      const msgs = p.issues.map((i) => `- ${i.where}: ${i.message}`).join("\n");
      const user = `This "${p.label}" part has problems reported by the checker. Return the corrected YAML for the whole part.\n\nProblems:\n${msgs}\n\nPart:\n${p.yaml}\n\nIds in the other parts:\n${context}`;
      try { p.yaml = extractYaml(await llm(s, SYSTEM_PROMPT, user, userId, 3500)); } catch (e) { logError("builder repair", e); }
    }));
  }
  check(parts);
}

function buildPreview(s: BuilderSession) {
  const { ruleset: r } = check(s.parts);
  if (!r) { s.preview = null; return; }
  const st = initialState(r);
  const counts: Record<string, number> = {
    meters: r.statOrder.filter((id) => r.stats[id].kind === "meter").length,
    skills: r.statOrder.filter((id) => ["skill", "attribute"].includes(r.stats[id].kind)).length,
    feelings: r.relStatOrder.length,
    people: Object.keys(r.people).length,
    items: Object.keys(r.items).length,
    actions: Object.keys(r.actions).length,
    choices: Object.keys(r.liveChoices.tags).length,
    contests: r.style === "adventure" ? Object.keys(r.conflict.kinds).length : 0,
    goals: Object.keys(r.goals.list).length,
    secrets: Object.keys(r.secrets).length,
    rules: r.triggers.length,
  };
  const word = (k: string, n: number) => (n === 1 ? ({ people: "person", feelings: "feeling", choices: "kind of choice" } as Record<string, string>)[k] ?? k.replace(/s$/, "") : k === "choices" ? "kinds of choice" : k);
  const phrase = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${word(k, n)}`).join(", ");
  s.preview = {
    summary: `${r.name} (${r.style === "story" ? "Story, no dice" : "Adventure, dice"}): ${phrase}.`,
    counts,
    hud: buildHud(r, st),
    choices: buildChoices(r, st, { lines: [], veils: [] }),
  };
}

// ───────────────────────── steps ─────────────────────────

export async function builderOpen(chatId: string, mode: "build" | "refine", userId?: string) {
  const characterId = await characterForChat(chatId, userId);
  if (!characterId) throw new Error("Open a chat with a character first.");
  const existing = await sessionFor(chatId, userId);
  if (existing && existing.mode === mode && existing.step !== "done") { emit(existing, userId); return; }
  if (existing) retire(existing);
  const card = await cardText(characterId, userId);
  const s: BuilderSession = {
    characterId, characterName: card.name, mode, step: "start",
    connectionId: existing?.connectionId ?? "",
    base: "", analysis: null, rounds: [], additions: [], parts: [], preview: null,
    request: null, changeSummary: null, busy: null, error: null, updatedAt: Date.now(),
  };
  sessionChats.set(s, chatId);
  if (mode === "refine") {
    s.parts = await currentParts(characterId, userId);
    if (!s.parts.length) throw new Error("This character has no ruleset to refine yet.");
    s.step = "review";
    buildPreview(s);
  }
  await save(s, userId);
  emit(s, userId);
}

/** Read the card: one helper call writes the summary, cast and follow-ups; Jev (when set) classifies in parallel. */
export async function builderStart(chatId: string, opts: { connectionId: string; base?: string }, userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s) throw new Error("No builder open.");
  s.connectionId = opts.connectionId;
  await progress(s, "Reading the card…", userId);
  try {
    const card = await cardText(s.characterId, userId);
    const jev = await classifier(userId);
    const prompt = cardPrompt(card.text, !jev);
    const ask = (d: JevDecider | LlmDecider) => d.ask({ card: card.text }, cardQuestions(), { timeoutMs: 15_000, signal: sessionSignal(s) }).then(cardVerdict);
    const [out, cls] = await Promise.all([
      llm(s, prompt.system, prompt.user, userId, 1500).then((t) => parseJson(t) ?? {}),
      jev ? ask(jev).catch(async (e): Promise<CardClass> => {
        // Jev failed: the same questions go to the helper (one more call, only now).
        logError("builder Jev classification", e);
        return ask(new LlmDecider(await getSettings(userId), userId));
      }) : Promise.resolve(null),
    ]);
    const read = readCard(out, cls, card.name);
    const picked: Style | null = opts.base === "story" || opts.base === "adventure" ? opts.base : null;
    s.analysis = {
      summary: read.summary,
      suggestedTemplate: read.style,
      reason: read.reason,
      statusBlock: read.statusBlock ? { found: true, fields: read.statusFields } : null,
      cardType: read.cardType,
      cast: read.cast,
      romance: read.romance,
    };
    s.base = picked ?? read.style;
    s.rounds = [{ questions: [...coreQuestions(s.base as Style, picked ? "" : read.reason), ...read.followUps], answers: {} }];
    s.step = "questions";
  } catch (e) {
    s.error = `Couldn't read the card: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}

export async function builderAnswer(chatId: string, answers: Record<string, BuilderAnswer>, additions: BuilderAddition[], userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.rounds.length) throw new Error("No questions to answer.");
  for (const r of s.rounds) for (const q of r.questions) if (q.id in answers) r.answers[q.id] = answers[q.id];
  s.additions = additions.filter((a) => a.name.trim()).slice(0, 8);
  s.base = styleOf(s);
  await draftAll(s, userId);
}

/** The chosen template themed for the card: the foundations in parallel, then the parts that refer to them. */
async function draftAll(s: BuilderSession, userId?: string) {
  const base = baseParts(s);
  s.parts = base.map((p) => ({ label: p.label, yaml: p.yaml, status: "ok", issues: [] }));
  const byLabel = (l: string) => s.parts.find((p) => p.label === l)!;
  const baseOf = (l: string) => base.find((p) => p.label === l)!.yaml;
  try {
    const first = s.parts.filter((p) => ["core", "stats", "people"].includes(p.label)).map((p) => p.label);
    await progress(s, `Theming ${first.join(", ")}…`, userId);
    await Promise.all(first.map(async (l) => { byLabel(l).yaml = await themePart(s, l, baseOf(l), "", userId); }));
    const rest = s.parts.filter((p) => !first.includes(p.label)).map((p) => p.label);
    if (rest.length) {
      await progress(s, `Theming ${rest.join(", ")}…`, userId);
      // A foundation that came back broken is read from the template for now (the repair fixes it later), so the
      // other parts still see the right ids and band names.
      const readable = (p: BuilderPart) => !loadRuleset([{ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: 0 }]).issues.some((i) => i.level === "error");
      const ctx = contextOf(s.parts.map((p) => (readable(p) ? p : { ...p, yaml: baseOf(p.label) })));
      await Promise.all(rest.map(async (l) => { byLabel(l).yaml = await themePart(s, l, baseOf(l), ctx, userId); }));
    }
    await repair(s, s.parts, userId);
    buildPreview(s);
    s.step = "review";
  } catch (e) {
    s.error = `Drafting failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}

/** Rewrite one part (with an optional note), then the same repair. */
export async function builderRedo(chatId: string, label: string, note: string | undefined, userId?: string) {
  const s = await sessionFor(chatId, userId);
  const part = s?.parts.find((p) => p.label === label);
  if (!s || !part) throw new Error("Nothing to redo.");
  await progress(s, `Rewriting ${label}…`, userId);
  try {
    const ctx = contextOf(s.parts.filter((p) => p !== part));
    const base = s.mode === "build" ? baseParts(s).find((p) => p.label === label)?.yaml ?? part.yaml : part.yaml;
    part.yaml = await themePart(s, label, base, ctx, userId, note || "Write a fresh, better version.", part.yaml);
    part.changed = true;
    await repair(s, s.parts, userId);
    buildPreview(s);
  } catch (e) {
    s.error = `Couldn't rewrite ${label}: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}

/** Refine: one call that returns the changed parts, then the checker repair. */
export async function builderRefine(chatId: string, request: string, userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.parts.length) throw new Error("Nothing to refine.");
  s.request = request;
  await progress(s, "Working out what to change…", userId);
  try {
    const all = s.parts.map((p) => `### ${p.label}\n${p.yaml}`).join("\n\n");
    const missing = PART_LABELS.filter((l) => !s.parts.some((p) => p.label === l));
    const user = `${s.analysis ? `${brief(s)}\n\n` : ""}The current ruleset, part by part:\n\n${all}\n\nThe player wants: ${request}\n\nChange only what's needed, inside the format. Reply with JSON: {"summary": "one or two sentences on what you changed", "parts": {"<part label>": "<the whole new YAML for that part>"}}. Include only the parts you changed. Part labels: ${s.parts.map((p) => p.label).join(", ")}${missing.length ? ` (you may also add: ${missing.join(", ")})` : ""}.`;
    const out = parseJson(await llm(s, SYSTEM_PROMPT, user, userId, 6000)) ?? {};
    const changed = (out.parts && typeof out.parts === "object" ? out.parts : {}) as Record<string, unknown>;
    for (const p of s.parts) p.changed = false;
    for (const [label, yaml] of Object.entries(changed)) {
      if (typeof yaml !== "string" || !(PART_LABELS as readonly string[]).includes(label)) continue;
      const existing = s.parts.find((p) => p.label === label);
      if (existing) { existing.yaml = extractYaml(yaml); existing.changed = true; }
      else s.parts.push({ label, yaml: extractYaml(yaml), status: "ok", issues: [], changed: true });
    }
    s.changeSummary = typeof out.summary === "string" ? out.summary : Object.keys(changed).length ? `Changed: ${Object.keys(changed).join(", ")}.` : "The model didn't change anything. Try rephrasing.";
    await repair(s, s.parts, userId);
    buildPreview(s);
  } catch (e) {
    s.error = `Couldn't refine: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}

export async function builderBack(chatId: string, userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s) return;
  if (s.step === "review" && s.mode === "build") s.step = "questions";
  else if (s.step === "questions") s.step = "start";
  s.error = null;
  await save(s, userId);
  emit(s, userId);
}

export async function builderClose(chatId: string, userId?: string) {
  const characterId = await characterForChat(chatId, userId);
  if (!characterId) return;
  const previous = sessions.get(key(userId, characterId));
  if (previous) retire(previous);
  sessions.delete(key(userId, characterId));
  try { await host().userStorage.delete(path(characterId), userId); } catch { /* fine */ }
  emit(null, userId, chatId);
}

export async function builderCurrent(chatId: string | null, userId?: string) {
  emit(chatId ? await sessionFor(chatId, userId) : null, userId, chatId);
}

// ───────────────────────── the installed ruleset ─────────────────────────

export async function currentParts(characterId: string, userId?: string): Promise<BuilderPart[]> {
  const { entries } = await rulesetEntries(characterId, userId);
  const parts: BuilderPart[] = entries.map((e) => ({ label: e.label, yaml: e.content, status: "ok", issues: [] }));
  check(parts);
  return parts;
}

export async function builderInstall(chatId: string, userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.parts.length) throw new Error("Nothing to install.");
  const { ruleset, issues } = check(s.parts);
  if (!ruleset || issues.some((i) => i.level === "error")) {
    s.error = "Fix or redo the parts marked in red before installing.";
    await progress(s, null, userId);
    return;
  }
  await progress(s, "Saving to the lorebook…", userId);
  try {
    const bookId = await publishRulebook(s.characterId, s.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: (i + 1) * 10 })), userId);
    knownRulesetBookIds.add(bookId);
    invalidateCharacter(s.characterId);
    s.step = "done";
  } catch (e) {
    s.error = `Couldn't save: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}
