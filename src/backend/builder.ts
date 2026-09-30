// The AI ruleset builder: read the card → ask → draft section by section →
// check & repair → review (preview + balance) → install. Also "refine" for
// editing an existing ruleset by instruction.
//
// The model only ever writes YAML sections; Warp's own checker decides whether
// they're valid and feeds its messages back for repair.

import type { GenerationResponseDTO } from "lumiverse-spindle-types";
import { reviewBalance } from "../engine/balance.js";
import { isRulesetBookName, isRulesetEntryTitle, loadRuleset, type RulesetPart } from "../engine/loader.js";
import { lintRuleset } from "../engine/lint.js";
import { PART_CONTENTS, PART_LABELS, partForIssue, REFERENCE, type PartLabel } from "../engine/reference.js";
import type { Issue, Ruleset } from "../engine/ruleset.js";
import { initialState } from "../engine/state.js";
import { getTemplate, TEMPLATES, withCharacter } from "../engine/templates/index.js";
import { buildChoices, buildHud } from "../engine/view.js";
import type { BuilderAddition, BuilderAnswer, BuilderPart, BuilderQuestion, BuilderSession } from "../shared/protocol.js";
import { host, logError, send } from "./host.js";
import { characterForChat, invalidateCharacter, knownRulesetBookIds } from "./source.js";

// ───────────────────────── sessions ─────────────────────────

const sessions = new Map<string, BuilderSession>();
const key = (userId: string | undefined, characterId: string) => `${userId ?? "_"}:${characterId}`;
const path = (characterId: string) => `builder/${characterId}.json`;

async function save(s: BuilderSession, userId?: string) {
  s.updatedAt = Date.now();
  sessions.set(key(userId, s.characterId), s);
  try { await host().userStorage.setJson(path(s.characterId), s, { userId }); } catch (e) { logError("builder save", e); }
}

function emit(s: BuilderSession | null, userId?: string) {
  send({ type: "builder", session: s }, userId);
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
  if (hit) return hit;
  try {
    const stored = await host().userStorage.getJson<BuilderSession | null>(path(characterId), { fallback: null, userId });
    if (stored) { stored.busy = null; sessions.set(key(userId, characterId), stored); return stored; }
  } catch { /* none */ }
  return null;
}

// ───────────────────────── model calls ─────────────────────────

async function llm(s: BuilderSession, system: string, user: string, userId: string | undefined, maxTokens = 3000): Promise<string> {
  const res = (await host().generate.quiet({
    type: "quiet",
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    connection_id: s.connectionId || undefined,
    parameters: { temperature: s.creative ? 0.8 : 0.4, max_tokens: maxTokens },
    userId,
    signal: AbortSignal.timeout(180_000),
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
function extractYaml(text: string): string {
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

// ───────────────────────── questions ─────────────────────────

const SYSTEMS: { id: string; label: string }[] = [
  { id: "needs", label: "Needs & condition (fatigue, stress…)" },
  { id: "relationships", label: "Relationships" },
  { id: "money", label: "Money & work" },
  { id: "skills", label: "Skills that grow" },
  { id: "clothing", label: "Clothing, weather & temperature" },
  { id: "schedules", label: "NPC schedules & places" },
  { id: "encounters", label: "Encounters / combat" },
  { id: "crime", label: "Crime & consequences" },
  { id: "journal", label: "Codex & feats" },
  { id: "perks", label: "Levels & perks" },
];

function coreQuestions(defaultSystems: string[]): BuilderQuestion[] {
  return [
    { id: "tone", core: true, kind: "single", text: "What tone should the game have?", default: "dramatic",
      options: ["cozy", "dramatic", "dark", "chaotic", "romantic", "gritty"].map((t) => ({ id: t, label: t[0].toUpperCase() + t.slice(1) })) },
    { id: "systems", core: true, kind: "multi", text: "Which systems do you want?", default: defaultSystems, options: SYSTEMS },
    { id: "difficulty", core: true, kind: "scale", text: "How hard should checks be?", default: 3,
      options: [{ id: "1", label: "Forgiving" }, { id: "3", label: "Fair" }, { id: "5", label: "Punishing" }] },
    { id: "relationship_depth", core: true, kind: "single", text: "How deep should relationship tracking go?", default: "simple",
      options: [
        { id: "simple", label: "Simple — affection & trust" },
        { id: "deep", label: "Deep — love, lust, trust, dominance" },
        { id: "custom", label: "Custom — I'll describe it below" },
      ] },
  ];
}

function normQuestions(raw: unknown, prefix: string): BuilderQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: BuilderQuestion[] = [];
  raw.slice(0, 5).forEach((q, i) => {
    if (!q || typeof q !== "object") return;
    const r = q as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text : typeof r.question === "string" ? r.question : "";
    if (!text) return;
    const kind = (["single", "multi", "scale", "text"] as const).find((k) => k === r.kind) ?? (Array.isArray(r.options) ? "single" : "text");
    const options = Array.isArray(r.options)
      ? r.options.slice(0, 8).map((o, j) => (typeof o === "string" ? { id: `o${j}`, label: o } : { id: String((o as Record<string, unknown>).id ?? `o${j}`), label: String((o as Record<string, unknown>).label ?? (o as Record<string, unknown>).text ?? `Option ${j + 1}`) }))
      : undefined;
    out.push({ id: `${prefix}${i}`, text, kind, ...(options?.length ? { options } : {}), ...(typeof r.why === "string" ? { why: r.why } : {}) });
  });
  return out;
}

function answerText(q: BuilderQuestion, a: BuilderAnswer | undefined): string {
  if (a === undefined || a === "" || (Array.isArray(a) && !a.length)) return "(no answer)";
  const label = (id: string) => q.options?.find((o) => o.id === id)?.label ?? id;
  if (Array.isArray(a)) return a.map(label).join(", ");
  if (q.kind === "scale") return `${a} of 5 (1 = forgiving, 5 = punishing)`;
  return typeof a === "string" ? label(a) : String(a);
}

function brief(s: BuilderSession): string {
  const qa = s.rounds.flatMap((r) => r.questions.map((q) => `- ${q.text} → ${answerText(q, r.answers[q.id] ?? q.default)}`));
  const adds = s.additions.filter((a) => a.name.trim()).map((a) => `- ${a.kind}: ${a.name}${a.note ? ` — ${a.note}` : ""}`);
  return [
    `Character: ${s.characterName}`,
    s.analysis ? `Card summary: ${s.analysis.summary}` : "",
    s.analysis?.statusBlock?.found ? `The card currently makes the model print a status block with: ${s.analysis.statusBlock.fields.join(", ")}. Cover these as proper stats; the narrator should no longer print status blocks.` : "",
    s.analysis?.cardType === "scenario" ? `This is a scenario/narrator card: "${s.characterName}" is the setting, NOT a person — never add it to people.` : "",
    s.analysis?.cast?.length ? `Main cast — add each to relationships.people with a start: block that matches how they feel about {{user}} at the beginning (use the relationship stats' scales; strong feelings mean strong numbers):\n${s.analysis.cast.map((c) => `- ${c.name}: ${c.relation}`).join("\n")}` : "",
    qa.length ? `The player's answers:\n${qa.join("\n")}` : "",
    adds.length ? `The player's own additions (build each in — the stat/item/place/etc., what changes it, and which actions check it):\n${adds.join("\n")}` : "",
    s.creative
      ? "Style: be inventive — add fitting systems, places and actions beyond the starting point where they serve the card."
      : "Style: stay close to the starting point — rename, retune, trim and extend it to fit the card, rather than inventing whole new systems.",
  ].filter(Boolean).join("\n\n");
}

function chosenSystems(s: BuilderSession): Set<string> {
  const q = s.rounds[0]?.questions.find((x) => x.id === "systems");
  const a = s.rounds[0]?.answers.systems ?? q?.default;
  return new Set(Array.isArray(a) ? a : SYSTEMS.map((x) => x.id));
}

// ───────────────────────── drafting & checking ─────────────────────────

function merged(parts: BuilderPart[]): RulesetPart[] {
  return parts.map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: i }));
}

function check(parts: BuilderPart[]): { ruleset: Ruleset | null; issues: Issue[] } {
  const { ruleset, issues } = loadRuleset(merged(parts));
  const all = ruleset ? [...issues, ...lintRuleset(ruleset)] : issues;
  for (const p of parts) {
    p.issues = all.filter((i) => partForIssue(i.where) === p.label);
    p.status = p.issues.some((i) => i.level === "error") ? "error" : p.issues.length ? "warn" : "ok";
  }
  return { ruleset, issues: all };
}

/** Ids the other sections can refer to, so parallel drafts line up. */
function contextOf(parts: BuilderPart[]): string {
  const { ruleset: r } = loadRuleset(merged(parts.filter((p) => p.yaml.trim())));
  if (!r) return "";
  const list = (label: string, ids: string[]) => (ids.length ? `${label}: ${ids.join(", ")}` : "");
  return [
    list("Stats", r.statOrder.map((id) => `${id} (${r.stats[id].kind}${r.stats[id].kind === "meter" ? ` ${r.stats[id].min}–${r.stats[id].max}` : ""})`)),
    list("Relationship stats", r.relStatOrder),
    list("People", Object.keys(r.people)),
    list("Locations", Object.keys(r.locations)),
    list("Items", Object.keys(r.items).map((id) => (r.items[id].slot ? `${id} [${r.items[id].slot}]` : id))),
    list("Wardrobe slots", r.wardrobe.enabled ? r.wardrobe.slots.map((x) => x.id) : []),
    list("Conditions", Object.keys(r.conditions)),
    list("Flags", Object.keys(r.flags)),
    list("Encounters", Object.keys(r.encounters)),
    list("Codex", Object.keys(r.codex)),
  ].filter(Boolean).join("\n");
}

const SYSTEM_PROMPT = `You write sections of a Warp ruleset: YAML that a game engine runs underneath a roleplay chat.
Output ONLY the YAML for the requested section — no prose, no explanations. Use only the formats below.
Use snake_case ids. Keep numbers readable (meters 0–100). Quote any formula that contains a comma.
Write in-world text (bands, hints, descriptions) in a voice that suits the card. Refer to the player as {{user}}.

${REFERENCE}`;

async function draftPart(s: BuilderSession, label: PartLabel, base: string | null, context: string, userId?: string, note?: string, current?: string): Promise<string> {
  const user = [
    brief(s),
    `Write the "${label}" section. It may contain only: ${PART_CONTENTS[label]}.`,
    base ? `Starting point for this section (adapt it):\n${base}` : "There's no starting point for this section — write it from scratch.",
    current ? `The current version of this section:\n${current}` : "",
    context ? `Ids defined in the other sections (reuse them exactly; don't redefine them here):\n${context}` : "",
    note ? `The player asked for this change: ${note}` : "",
  ].filter(Boolean).join("\n\n");
  return extractYaml(await llm(s, SYSTEM_PROMPT, user, userId, 3500));
}

async function repair(s: BuilderSession, parts: BuilderPart[], userId?: string, includeWarnings = true) {
  for (let round = 0; round < 2; round++) {
    check(parts);
    const broken = parts.filter((p) => p.status === "error" || (includeWarnings && round === 0 && p.status === "warn"));
    if (!broken.length) return;
    await progress(s, `Fixing ${broken.map((p) => p.label).join(", ")}…`, userId);
    const context = contextOf(parts);
    await Promise.all(broken.map(async (p) => {
      const msgs = p.issues.map((i) => `- ${i.where}: ${i.message}`).join("\n");
      const user = `This "${p.label}" section has problems reported by the checker. Return the corrected YAML for the whole section.\n\nProblems:\n${msgs}\n\nSection:\n${p.yaml}\n\nIds in the other sections:\n${context}`;
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
    people: Object.keys(r.people).length,
    places: Object.keys(r.locations).length,
    items: Object.keys(r.items).length,
    actions: Object.keys(r.actions).length,
    encounters: Object.keys(r.encounters).length,
    rules: r.triggers.length,
    codex: Object.keys(r.codex).length,
    feats: Object.keys(r.feats).length,
    perks: Object.keys(r.perks).length,
  };
  const phrase = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${n === 1 ? k.replace(/s$/, "").replace(/^people$/, "person").replace(/^codex$/, "codex entry") : k}`).join(", ");
  const extras = [
    r.weather.enabled ? "weather & temperature" : "",
    r.wardrobe.enabled ? "a wardrobe" : "",
    r.clock.startDate ? "a calendar" : "",
  ].filter(Boolean);
  s.preview = {
    summary: `${r.name}: ${phrase}${extras.length ? `, plus ${extras.join(", ")}` : ""}.`,
    counts,
    hud: buildHud(r, st),
    choices: buildChoices(r, st, { lines: [], veils: [] }),
    warnings: reviewBalance(r).map((w) => ({ id: w.id, part: w.part, text: w.text })),
  };
}

// ───────────────────────── steps ─────────────────────────

export async function builderOpen(chatId: string, mode: "build" | "refine", userId?: string) {
  const characterId = await characterForChat(chatId, userId);
  if (!characterId) throw new Error("Open a chat with a character first.");
  const existing = await sessionFor(chatId, userId);
  if (existing && existing.mode === mode && existing.step !== "done") { emit(existing, userId); return; }
  const card = await cardText(characterId, userId);
  const s: BuilderSession = {
    characterId, characterName: card.name, mode, step: "start",
    connectionId: existing?.connectionId ?? "", creative: existing?.creative ?? false,
    base: "", analysis: null, rounds: [], additions: [], parts: [], preview: null,
    request: null, changeSummary: null, busy: null, error: null, updatedAt: Date.now(),
  };
  if (mode === "refine") {
    s.parts = await currentParts(characterId, userId);
    if (!s.parts.length) throw new Error("This character has no ruleset to refine yet.");
    s.step = "review";
    buildPreview(s);
  }
  await save(s, userId);
  emit(s, userId);
}

export async function builderStart(chatId: string, opts: { connectionId: string; creative: boolean; base?: string }, userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s) throw new Error("No builder open.");
  s.connectionId = opts.connectionId;
  s.creative = opts.creative;
  await progress(s, "Reading the card…", userId);
  try {
    const card = await cardText(s.characterId, userId);
    const templates = TEMPLATES.map((t) => `- ${t.id}: ${t.blurb}`).join("\n");
    const system = `You help set up a game ruleset for a roleplay character card. Reply with JSON only.`;
    const user = `${card.text}\n\nAvailable starting templates:\n${templates}\n- blank: nothing, build from scratch\n\nSystems the player can pick from: ${SYSTEMS.map((x) => x.id).join(", ")}.\n\nReply with JSON:
{"summary": "2–3 sentences: who this is, the setting, the likely kind of story",
 "suggestedTemplate": "<template id>",
 "reason": "one sentence: why that template fits",
 "systems": ["<system ids that fit this card>"],
 "statusBlock": {"found": <does the card tell the model to print a status/stat block?>, "fields": ["<fields it tracks>"]},
 "cardType": "character" if the card IS one character, "scenario" if it is a narrator / world / multi-character card (its name is a setting or premise, not a person),
 "cast": [ the main named characters in the story (for a character card, the character first) with how each feels about the player at the start, e.g. {"name": "Aina", "relation": "secretly adores {{user}} but hides it behind insults"} ],
 "followUps": [ up to 5 questions specific to THIS card, e.g. {"text": "Aina gets jealous easily. Track jealousy as its own meter?", "kind": "single", "options": ["Yes", "No"], "why": "The description mentions jealousy"} — kinds: single, multi, text ]}`;
    const out = parseJson(await llm(s, system, user, userId, 1500)) ?? {};
    const suggested = typeof out.suggestedTemplate === "string" && (getTemplate(out.suggestedTemplate) || out.suggestedTemplate === "blank") ? out.suggestedTemplate : "universal";
    const sb = out.statusBlock as { found?: unknown; fields?: unknown } | undefined;
    s.analysis = {
      summary: typeof out.summary === "string" ? out.summary : `${card.name}.`,
      suggestedTemplate: suggested,
      reason: typeof out.reason === "string" ? out.reason : "",
      statusBlock: sb && sb.found === true ? { found: true, fields: Array.isArray(sb.fields) ? sb.fields.map(String).slice(0, 12) : [] } : null,
      cardType: out.cardType === "scenario" ? "scenario" : "character",
      cast: Array.isArray(out.cast) ? out.cast.slice(0, 12).map((c) => ({ name: String((c as Record<string, unknown>)?.name ?? ""), relation: String((c as Record<string, unknown>)?.relation ?? "") })).filter((c) => c.name) : [],
    };
    s.base = opts.base || suggested;
    const defaults = Array.isArray(out.systems) ? out.systems.map(String).filter((x) => SYSTEMS.some((y) => y.id === x)) : ["needs", "relationships", "money", "skills"];
    s.rounds = [{ questions: [...coreQuestions(defaults), ...normQuestions(out.followUps, "f1_")], answers: {} }];
    s.step = "questions";
  } catch (e) {
    s.error = `Couldn't read the card: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}

export async function builderAnswer(chatId: string, answers: Record<string, BuilderAnswer>, additions: BuilderAddition[], more: boolean, userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.rounds.length) throw new Error("No questions to answer.");
  // Earlier rounds stay editable, so file each answer under the round that asked it.
  for (const r of s.rounds) for (const q of r.questions) if (q.id in answers) r.answers[q.id] = answers[q.id];
  s.additions = additions.filter((a) => a.name.trim());
  if (more && s.rounds.length < 3) {
    await progress(s, "Thinking of more questions…", userId);
    try {
      const card = await cardText(s.characterId, userId);
      const user = `${card.text}\n\n${brief(s)}\n\nAsk up to 4 more short questions that would change how the game ruleset is built — things still unclear or worth customising for this card. Don't repeat earlier questions. Reply with JSON: {"followUps": [{"text": "...", "kind": "single|multi|text", "options": ["..."], "why": "..."}]}`;
      const out = parseJson(await llm(s, "You help set up a game ruleset for a roleplay character card. Reply with JSON only.", user, userId, 1000)) ?? {};
      const qs = normQuestions(out.followUps, `f${s.rounds.length + 1}_`).slice(0, 4);
      if (qs.length) s.rounds.push({ questions: qs, answers: {} });
      else s.error = "No more questions — you can build it now.";
    } catch (e) {
      s.error = `Couldn't get more questions: ${e instanceof Error ? e.message : String(e)}`;
    }
    await progress(s, null, userId);
    return;
  }
  await draftAll(s, userId);
}

async function draftAll(s: BuilderSession, userId?: string) {
  const t = getTemplate(s.base);
  const systems = chosenSystems(s);
  const want = (label: PartLabel) => {
    if (label === "encounters") return systems.has("encounters");
    if (label === "journal") return systems.has("journal") || systems.has("perks");
    return true;
  };
  const baseOf = (label: string) => {
    const y = t?.parts.find((p) => p.label === label)?.yaml ?? null;
    return y && label === "people" && s.analysis?.cardType !== "scenario" ? withCharacter(y, s.characterName) : y;
  };
  const labels = PART_LABELS.filter(want);
  s.parts = labels.map((label) => ({ label, yaml: "", status: "ok", issues: [] }));
  const byLabel = (l: string) => s.parts.find((p) => p.label === l)!;
  try {
    // Foundations first (in parallel), then everything that refers to them.
    const phaseA: PartLabel[] = ["core", "stats", "world"];
    await progress(s, "Drafting the foundations: core, stats, world…", userId);
    await Promise.all(phaseA.map(async (l) => { byLabel(l).yaml = await draftPart(s, l, baseOf(l), "", userId); }));
    const phaseB = labels.filter((l) => !phaseA.includes(l));
    await progress(s, `Drafting ${phaseB.join(", ")}…`, userId);
    const ctx = contextOf(s.parts);
    await Promise.all(phaseB.map(async (l) => { byLabel(l).yaml = await draftPart(s, l, baseOf(l), ctx, userId); }));
    await repair(s, s.parts, userId);
    buildPreview(s);
    s.step = "review";
  } catch (e) {
    s.error = `Drafting failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}

export async function builderRedo(chatId: string, label: string, note: string | undefined, userId?: string) {
  const s = await sessionFor(chatId, userId);
  const part = s?.parts.find((p) => p.label === label);
  if (!s || !part) throw new Error("Nothing to redo.");
  await progress(s, `Rewriting ${label}…`, userId);
  try {
    const ctx = contextOf(s.parts.filter((p) => p !== part));
    const t = getTemplate(s.base);
    part.yaml = await draftPart(s, label as PartLabel, t?.parts.find((p) => p.label === label)?.yaml ?? null, ctx, userId, note || "Write a fresh, better version.", part.yaml);
    part.changed = true;
    await repair(s, s.parts, userId);
    buildPreview(s);
  } catch (e) {
    s.error = `Couldn't rewrite ${label}: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}

export async function builderFix(chatId: string, warningId: string, userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s) throw new Error("No builder open.");
  const { ruleset } = check(s.parts);
  const w = ruleset ? reviewBalance(ruleset).find((x) => x.id === warningId) : undefined;
  if (!w) { buildPreview(s); emit(s, userId); return; }
  await builderRedo(chatId, w.part, w.fix, userId);
}

export async function builderRefine(chatId: string, request: string, userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.parts.length) throw new Error("Nothing to refine.");
  s.request = request;
  await progress(s, "Working out what to change…", userId);
  try {
    const all = s.parts.map((p) => `### ${p.label}\n${p.yaml}`).join("\n\n");
    const user = `${brief(s)}\n\nThe current ruleset, section by section:\n\n${all}\n\nThe player wants: ${request}\n\nChange only what's needed. Reply with JSON: {"summary": "one or two sentences on what you changed", "parts": {"<section label>": "<the whole new YAML for that section>"}} — include only sections you changed. Section labels: ${s.parts.map((p) => p.label).join(", ")}${s.parts.length < PART_LABELS.length ? ` (you may also add: ${PART_LABELS.filter((l) => !s.parts.some((p) => p.label === l)).join(", ")})` : ""}.`;
    const out = parseJson(await llm(s, SYSTEM_PROMPT, user, userId, 6000)) ?? {};
    const changed = (out.parts && typeof out.parts === "object" ? out.parts : {}) as Record<string, unknown>;
    for (const p of s.parts) p.changed = false;
    for (const [label, yaml] of Object.entries(changed)) {
      if (typeof yaml !== "string" || !(PART_LABELS as readonly string[]).includes(label)) continue;
      const existing = s.parts.find((p) => p.label === label);
      if (existing) { existing.yaml = extractYaml(yaml); existing.changed = true; }
      else s.parts.push({ label, yaml: extractYaml(yaml), status: "ok", issues: [], changed: true });
    }
    s.changeSummary = typeof out.summary === "string" ? out.summary : Object.keys(changed).length ? `Changed: ${Object.keys(changed).join(", ")}.` : "The model didn't change anything — try rephrasing.";
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
  else if (s.step === "questions") {
    if (s.rounds.length > 1) s.rounds.pop();
    else s.step = "start";
  }
  s.error = null;
  await save(s, userId);
  emit(s, userId);
}

export async function builderClose(chatId: string, userId?: string) {
  const characterId = await characterForChat(chatId, userId);
  if (!characterId) return;
  sessions.delete(key(userId, characterId));
  try { await host().userStorage.delete(path(characterId), userId); } catch { /* fine */ }
  emit(null, userId);
}

export async function builderCurrent(chatId: string | null, userId?: string) {
  emit(chatId ? await sessionFor(chatId, userId) : null, userId);
}

// ───────────────────────── lorebook I/O ─────────────────────────

interface RulesetEntry { id: string; bookId: string; label: string; content: string }

function labelOf(comment: string): string {
  return comment.replace(/^\s*(?:\[[^\]]*\]\s*)?warp[-_ ]?ruleset\s*[·:\-–—|]?\s*/i, "").trim().toLowerCase() || "core";
}

async function rulesetEntries(characterId: string, userId?: string): Promise<{ entries: RulesetEntry[]; rulesetBook: string | null; bookIds: string[] }> {
  const c = await host().characters.get(characterId, userId);
  const entries: RulesetEntry[] = [];
  let rulesetBook: string | null = null;
  for (const bookId of c?.world_book_ids ?? []) {
    const book = await host().world_books.get(bookId, userId);
    if (!book) continue;
    const whole = isRulesetBookName(book.name);
    if (whole && !rulesetBook) rulesetBook = bookId;
    for (let offset = 0; offset < 2000; offset += 200) {
      const page = await host().world_books.entries.list(bookId, { limit: 200, offset, userId });
      for (const e of page.data) if (whole || isRulesetEntryTitle(e.comment)) entries.push({ id: e.id, bookId, label: labelOf(e.comment ?? ""), content: e.content });
      if (page.data.length < 200) break;
    }
  }
  return { entries, rulesetBook, bookIds: c?.world_book_ids ?? [] };
}

async function currentParts(characterId: string, userId?: string): Promise<BuilderPart[]> {
  const { entries } = await rulesetEntries(characterId, userId);
  const parts: BuilderPart[] = entries.map((e) => ({ label: e.label, yaml: e.content, status: "ok", issues: [] }));
  check(parts);
  return parts;
}

export async function builderInstall(chatId: string, userId?: string) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.parts.length) throw new Error("Nothing to install.");
  const { ruleset } = check(s.parts);
  if (!ruleset) throw new Error("The ruleset still has errors — fix or redo the sections marked in red first.");
  await progress(s, "Saving to the lorebook…", userId);
  try {
    const { entries, rulesetBook, bookIds } = await rulesetEntries(s.characterId, userId);
    let bookId = rulesetBook;
    if (!bookId) {
      const book = await host().world_books.create({ name: "warp-ruleset", description: `Warp game rules for ${s.characterName}. Warp reads these entries directly; they are never sent to the model.` }, userId);
      bookId = book.id;
      await host().characters.update(s.characterId, { world_book_ids: [...bookIds, book.id] }, userId);
      knownRulesetBookIds.add(book.id);
    }
    const used = new Set<string>();
    let order = 10;
    for (const p of s.parts) {
      const hit = entries.find((e) => e.label === p.label && !used.has(e.id));
      if (hit) {
        used.add(hit.id);
        await host().world_books.entries.update(hit.id, { content: p.yaml, disabled: true, order_value: order }, userId);
      } else {
        await host().world_books.entries.create(bookId, { comment: `warp-ruleset · ${p.label}`, content: p.yaml, key: [], disabled: true, constant: false, order_value: order }, userId);
      }
      order += 10;
    }
    // Old sections the new ruleset doesn't have would still merge in — empty them (the confirm dialog said this replaces the ruleset).
    for (const e of entries) {
      if (used.has(e.id)) continue;
      await host().world_books.entries.update(e.id, { content: `# Replaced by the Warp builder on ${new Date().toISOString().slice(0, 10)}.\n`, disabled: true }, userId);
    }
    invalidateCharacter(s.characterId);
    s.step = "done";
  } catch (e) {
    s.error = `Couldn't save: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}

export { SYSTEMS };
