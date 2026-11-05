import { ROOT, nextPath, rawPathsOf } from "./story-path.js";
export { pathOf, pathsOf, rawPathOf, rawPathsOf } from "./story-path.js";
import { hasLingering, isLingering } from "./lingering.js";
import { activePracticeTracks } from "./growth.js";
import { revision } from "../shared/revision.js";
import { seededRng } from "../engine/dice.js";
import { attemptBands } from "./check-bands.js";
import { mechanicalPacket, type MechanicalState } from "./mechanics.js";
import { learnKnowledge, knowledgeDependencyHolds, type KnowledgeAccess } from "./knowledge.js";
import { actorName } from "./encounters.js";
import { storyContent, storyRevision, sourceRevisionMatches, sourceContains, recordPathMatches } from "./story-text.js";

export type Kind = "fact" | "possession" | "knowledge" | "commitment" | "situation" | "motive" | "ability";
export interface Evidence { message: string; quote: string; sourceRevision?: string; }
export interface Fact extends Evidence {
  id: string; kind: Kind; subject: string; text: string;
  holder?: string; status: "open" | "done";
  access?: KnowledgeAccess;
}
export interface World { place: string; present: string[]; facts: Fact[]; mechanics?: MechanicalState; }
export interface Message { id: string; content: string; is_user: boolean; name?: string; swipe_id?: number; metadata?: { [key: string]: unknown }; }
export interface Event { op: "put" | "remove" | "transfer"; fact?: Fact; id: string; from?: string; to?: string; evidence: Evidence; }
export interface Record {
  version: 1; path: string; text: string; events: Event[];
  scene?: { place: string; present: string[]; message?: string; quote?: string; sourceRevision?: string }; notes: string[];
  decision?: Decision;
  notice?: string;
  reads?: string[];
  readSummary?: ReturnType<typeof import("./scene-read.js").sceneReadSummary>;
}
export interface Decision { tier: "favorable" | "uncertain" | "outmatched"; result: "clean" | "mixed" | "setback"; intent: string; stakes: string; reasons: string[]; roll?: number; }
export const emptyWorld = (): World => ({ place: "", present: [], facts: [] });
export const text = (v: unknown, limit = 240): string => {
  if (typeof v !== "string") return "";
  const clean = v.trim().replace(/\s+/g, " ");
  if (clean.length <= limit) return clean;
  const boundary = clean.lastIndexOf(" ", limit);
  return clean.slice(0, boundary > limit * 0.65 ? boundary : limit).trimEnd();
};
const obj = (v: unknown): v is { [key: string]: unknown } => !!v && typeof v === "object" && !Array.isArray(v);
const kinds = new Set<Kind>(["fact", "possession", "knowledge", "commitment", "situation", "motive", "ability"]);


function evidence(v: unknown, messages: Message[]): Evidence | null {
  if (!obj(v)) return null;
  const message = text(v.message, 160), quote = text(v.quote, 400);
  const source = messages.find(m => m.id === message);
  if (!source || quote.length < 4 || !sourceContains(source.content, quote)) return null;
  return { message, quote, sourceRevision: storyRevision(source.content) };
}

/** Validate each proposed change against its quoted source and existing ownership. */
export function readChanges(raw: unknown, before: World, messages: Message[], playerName?: string): { events: Event[]; scene?: Record["scene"]; notes: string[] } {
  if (!obj(raw)) return { events: [], notes: [] };
  const events: Event[] = [], notes: string[] = [];
  let world = structuredClone(before);
  const sourceMessages = new Map(messages.map(m => [m.id, m]));
  const playerNames = new Set(["you", "player", "me", "i", "{{user}}", ...(playerName ? [playerName.toLowerCase()] : []), ...messages.filter(m => m.is_user && m.name).map(m => m.name!.toLowerCase())]);
  const person = (v: unknown) => {
    const s = text(v, 80); if (playerNames.has(s.toLowerCase())) return "you";
    try { return world.mechanics ? actorName(world.mechanics, s) : s; } catch { return ""; }
  };
  for (const v of (Array.isArray(raw.changes) ? raw.changes : []).slice(0, 16)) {
    if (!obj(v)) continue;
    const e = evidence(v, messages); let id = text(v.id, 100);
    if (!e || !id && v.op !== "learn") continue;
    const previous = world.facts.find(f => f.id === id);
    let event: Event;
    if (v.op === "learn") {
      const fact = learnKnowledge(v, e, world, messages, person(v.subject), person(v.from), [...playerNames]);
      if (!fact) continue;
      id = fact.id; event = { op: "put", id, fact, evidence: e };
    } else if (v.op === "resolve") {
      if (!previous || !["commitment", "situation"].includes(previous.kind) || previous.status === "done") continue;
      const source = sourceMessages.get(e.message)!;
      if (source.is_user && !/^\(OOC correction:/i.test(source.content)) continue;
      event = { op: "put", id, fact: { ...previous, ...e, status: "done" }, evidence: e };
    } else if (v.op === "remove") {
      if (!previous) continue;
      event = { op: "remove", id, evidence: e };
    } else if (v.op === "transfer") {
      const to = person(v.to), from = person(v.from);
      if (!previous || previous.kind !== "possession" || previous.holder !== from || !to || from === to) continue;
      const source = sourceMessages.get(e.message)!;
      if (source.is_user && !/^\(OOC correction:/i.test(source.content)) continue;
      event = { op: "transfer", id, from, to, evidence: e };
    } else if (v.op === "put") {
      const kind = text(v.kind) as Kind, subject = person(v.subject), description = text(v.text);
      if (!kinds.has(kind) || !subject || !description) continue;
      if (kind === "knowledge") continue; // New access uses learn; historical put records still replay.
      // Player agreements require evidence in the player's own words.
      if (kind === "commitment" && subject === "you" && !sourceMessages.get(e.message)?.is_user
        && (!previous || previous.text !== description || (previous.status === "done" && v.status !== "done"))) continue;
      if (kind === "motive" && subject === "you") continue;
      const holder = kind === "possession" ? person(v.holder) : "";
      // An existing possession can change hands only through a validated transfer.
      if (previous?.kind === "possession" && (kind !== "possession" || previous.holder !== holder)) continue;
      const fact: Fact = { id, kind, subject, text: description, ...e, status: v.status === "done" ? "done" : "open", ...(holder ? { holder } : {}) };
      if (kind === "possession" && !holder) continue;
      if (kind === "situation" && fact.status === "open" && !previous && world.facts.filter(f => f.kind === "situation" && f.status === "open").length >= 3) continue;
      event = { op: "put", id, fact, evidence: e };
    } else continue;
    events.push(event);
    world = applyEvents(world, [event]);
    // Notes are derived from validated changes, never arbitrary model text.
    if (previous && event.op === "transfer") notes.push(`${previous.text}: now with ${event.to}`);
    else if (event.fact && event.fact.text !== previous?.text && ["commitment", "knowledge", "ability"].includes(event.fact.kind)) notes.push(event.fact.text);
  }
  let scene: Record["scene"];
  const sceneSource = obj(raw.scene) ? evidence(raw.scene, messages) : null;
  if (obj(raw.scene) && sceneSource) {
    scene = { place: text(raw.scene.place, 100) || before.place, present: Array.isArray(raw.scene.present) ? [...new Set(raw.scene.present.map(person).filter(p => p && p !== "you"))].slice(0, 8) : before.present, ...sceneSource };
  }
  return { events, ...(scene ? { scene } : {}), notes: notes.slice(0, 2) };
}

function replayEvents(facts: Map<string, Fact>, events: Event[]) {
  for (const e of events) {
    if (e.op === "put" && e.fact && knowledgeDependencyHolds(e.fact, facts.values())) facts.set(e.id, e.fact);
    if (e.op === "remove") facts.delete(e.id);
    if (e.op === "transfer") {
      const old = facts.get(e.id);
      if (old?.kind === "possession" && e.to && (!e.from || e.from === old.holder)) facts.set(e.id, { ...old, holder: e.to, ...e.evidence });
    }
  }
}

export function applyEvents(before: World, events: Event[]): World {
  const facts = new Map(before.facts.map(f => [f.id, f]));
  replayEvents(facts, events);
  return { ...before, facts: [...facts.values()] };
}

/** Preserve facts still supported by active prose; stale decisions never re-roll during replay. */
export function foldWorld(messages: (Message & { record?: Record })[]): World {
  let world = emptyWorld();
  const facts = new Map<string, Fact>();
  const sourceById = new Map(messages.map(m => [m.id, m]));
  const sourceIndex = new Map(messages.map((m, i) => [m.id, i]));
  const rawPaths = rawPathsOf(messages);
  const quoted = (e: Evidence, ownIndex: number): Evidence | null => {
    const named = sourceById.get(e.message);
    const matches = (m: Message) => sourceRevisionMatches(m, e.sourceRevision) && sourceContains(m.content, e.quote);
    if (named && matches(named) && sourceIndex.get(named.id)! <= ownIndex) return e;
    // Forks may assign new ids. Rebind only a unique quote in the preceding path.
    if (named) return null;
    const candidates = messages.slice(0, ownIndex + 1).filter(matches);
    return candidates.length === 1 ? { ...e, message: candidates[0].id } : null;
  };
  let path = ROOT;
  for (const [index, m] of messages.entries()) {
    const r = m.record;
    if (r?.version === 1 && sourceRevisionMatches(m, r.text)) {
      const matchingPath = recordPathMatches(m, r.path, path, index ? rawPaths.get(messages[index - 1].id)! : ROOT);
      const events = matchingPath ? r.events : r.events.flatMap(e => {
        const source = quoted(e.evidence, index);
        if (!source || (e.op === "transfer" && !e.from)) return [];
        return [{ ...e, evidence: source, ...(e.fact ? { fact: { ...e.fact, ...source } } : {}) }];
      });
      replayEvents(facts, events);
      if (r.scene && (matchingPath || (r.scene.message && r.scene.quote && quoted({ message: r.scene.message, quote: r.scene.quote, sourceRevision: r.scene.sourceRevision }, index)))) world = { ...world, place: r.scene.place, present: r.scene.present };
    }
    path = nextPath(path, m);
  }
  return { ...world, facts: [...facts.values()] };
}

/** A classifier supplies circumstances. It never supplies the random outcome. */
export function resolveAttempt(raw: unknown, seed: string): Decision | null {
  if (!obj(raw) || raw.risky !== true || raw.contested !== true) return null;
  const intent = text(raw.intent), stakes = text(raw.stakes);
  const reasons = Array.isArray(raw.reasons) ? raw.reasons.map(x => text(x, 180)).filter(Boolean).slice(0, 3) : [];
  if (!intent || !stakes || !reasons.length) return null;
  const tier = raw.tier === "favorable" || raw.tier === "outmatched" ? raw.tier : "uncertain";
  const [clean, mixed] = attemptBands(tier);
  const roll = Math.floor(seededRng(seed)() * 100) + 1;
  return { tier, result: roll <= clean ? "clean" : roll <= mixed ? "mixed" : "setback", roll, intent, stakes, reasons };
}

export function worldPacket(world: World, focus = ""): string {
  const ignored = new Set(["the", "and", "you", "your", "that", "this", "with", "for", "what", "have", "from", "about"]);
  const words = new Set((focus.toLocaleLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []).filter(w => !ignored.has(w)));
  const people = new Set(world.present.map(p => p.toLocaleLowerCase()));
  const score = (f: Fact) => (f.status === "open" ? 10 : 0) + (f.kind === "commitment" || f.kind === "situation" ? 10 : 0)
    + (people.has(f.subject.toLocaleLowerCase()) ? 6 : 0) + (f.text.toLocaleLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []).filter(w => words.has(w)).length * 4
    + ((`${f.id} ${f.subject}`.toLocaleLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []).some(w => words.has(w)) ? 25 : 0);
  const selected = world.facts.map((fact, index) => ({ fact, index, score: score(fact) })).sort((a, b) => b.score - a.score || b.index - a.index).slice(0, 80).map(x => x.fact);
  return JSON.stringify({ place: world.place || undefined, present: world.present, established: selected.filter(f => f.kind !== "motive").map(({ id, kind, subject, text, holder, status, access }) => ({ id, kind, subject, text, holder, status, ...(access ? { access } : {}) })), possibleMotives: selected.filter(f => f.kind === "motive").map(f => ({ id: f.id, subject: f.subject, text: f.text })),
    ...(selected.some(f => f.access) ? { knowledgeBoundary: "Knowledge records identify actual learners and the proposition they learned. Other facts are narrator context, not shared information. Unrecorded access is unknown. Do not reveal secrets or let someone act on privileged information without an established way to learn it. Hearing an allegation does not make it true; old knowledge need not match a newer fact." } : {}),
    ...(world.mechanics && (world.mechanics.resources.length || world.mechanics.items.length) ? { assetBoundary: "Counted resources and items change only through a saved mechanical receipt. An offer, promise or completed task does not itself transfer payment. Hold an offered reward available for the player's acceptance and resolution. Do not invent or recite new balances from prose. Missing preparation is uncertainty in the record, not a fictional refusal, fee or extra chore." } : {}),
    ...(world.mechanics?.agreements?.length ? { agreementBoundary: "Accepted agreement requirements are separate and all must be fulfilled. Preserve their terms; an attempted task is not proof of completion. After completion the NPC may offer or refuse the promised reward. Hold an offered reward available for the player's acceptance; do not narrate a completed item or money handover without a reward receipt. Describe offers naturally; leave wallet arithmetic and current balances to the inline display unless asked. Paid rewards stay paid. Never automatically spend the player's promised payment. Do not introduce a setup menu, relationship score or new quest to manage an agreement." } : {}),
    ...(world.mechanics && (hasLingering(world.mechanics) || world.mechanics.abilities?.some(a => a.effects.some(isLingering))) ? { lingeringBoundary: "Periodic effects advance after supported actions of the affected owner, beginning with their next action. A question, inspection, model wait, denied action or permission withdrawal advances nothing. Honor saved pulse damage/healing, counts and threshold triggers once. Action timing is a Warp approximation, not a new fictional requirement to move, work or concentrate. Do not make people say recovery requires taking a step or performing an action; describe gradual recovery naturally without explaining bookkeeping. A cure can remove a pending pulse; refreshing cannot evade an old due pulse. Do not narrate offscreen pulses, automatic death, free recovery, consent or feelings from these rules. Buildup retains its remainder and refreshes one condition; it never creates extra attacks or model-authored arithmetic. Use human names, show a relevant imminent consequence before the next choice and answer saved counts on request. Omitted records are not erased." } : {}),
    ...(world.mechanics && activePracticeTracks(world.mechanics).length > 0 ? { growthBoundary: "Earned familiarity is Warp practice, scoped to the exact recorded technique/version. It improves existing uncertainty once alongside conditions, never creates a new power, changes source numbers or bypasses hard constraints, feelings or consent. Do not invent XP or forced training. Only newly earned milestones are announced; routine progress totals stay offscreen unless asked. A query may include opportunities/milestoneAt from saved state, not source-defined XP. Answer with human technique names and plain progress, never internal IDs or control tags. Omitted progress is not erased. Milestones arise from varied completed opportunities; routine repetition does not farm them." } : {}),
    ...(world.mechanics?.companions?.length || world.mechanics?.costLinks?.length ? { companionBoundary: "Companion relationships do not grant control, consent, extra actions or shared knowledge. Recall/dismissal never resets injuries, balances, identity, cooldowns or death. Lifetime counts only sourced controller actions. Shared links redirect established ability effort costs one-for-one; they do not duplicate resources or transmit damage/healing. No automatic following, resurrection or recovery. Unknown restrictions stay unresolved." } : {}),
    ...(world.mechanics?.places?.length ? { explorationBoundary: "Known places, routes, local changes, clues and remaining supplies persist across visits. This packet contains relevant nearby/requested spatial knowledge, not the entire map; omitted places are not erased. This is the player's discovered map, not shared NPC knowledge. Unvisited places are known only through their established sources, not an omniscient map. A route's unknown status does not prove access. Do not reconnect rooms, relock an opened exit, repair a broken object or refill a cache simply because the player returns. Counted gathering and travel through recorded routes use saved receipts; do not grant supplies, move the player or repeat costs contrary to that turn's receipt. A question, map inspection or unaccepted trip does not move anyone or advance time. New unestablished space may be explored naturally; do not invent a setup requirement. A successful departure does not automatically bring other people along." } : {}),
    ...(world.mechanics ? { mechanics: mechanicalPacket(world.mechanics, focus) } : {}) });
}
