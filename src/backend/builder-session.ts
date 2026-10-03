import type { BuilderAddition, BuilderAnswer, BuilderQuestion, BuilderSession } from "../shared/protocol.js";

export const BUILDER_SESSION_VERSION = 1;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown, fallback = "") => typeof v === "string" ? v : fallback;
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const answer = (v: unknown): v is BuilderAnswer => typeof v === "string" || (typeof v === "number" && Number.isFinite(v)) || (Array.isArray(v) && v.every(x => typeof x === "string"));
const answers = (v: unknown): Record<string, BuilderAnswer> => object(v) ? Object.fromEntries(Object.entries(v).filter((entry): entry is [string, BuilderAnswer] => answer(entry[1]))) : {};

function array<T>(v: unknown, valid: (x: unknown) => boolean, label: string): T[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every(valid)) throw new Error(`The saved draft has invalid ${label}. Its stored data has been kept.`);
  return structuredClone(v) as T[];
}

/** Restore authored data; previews and checker results must come from today's engine. */
export function restoreBuilderSession(raw: unknown, characterId: string): BuilderSession {
  if (!object(raw) || raw.characterId !== characterId) throw new Error("The saved draft doesn't match this character. Its stored data has been kept.");
  if (typeof raw.schemaVersion === "number" && raw.schemaVersion > BUILDER_SESSION_VERSION) throw new Error("This draft was saved by a newer Warp version. Update Warp to reopen it.");
  if (!["build", "refine", "deepen", "import"].includes(String(raw.mode)) || !["start", "questions", "review", "done"].includes(String(raw.step))) throw new Error("The saved draft has an unknown screen. Its stored data has been kept.");
  const parts = array<BuilderSession["parts"][number]>(raw.parts, p => object(p) && typeof p.label === "string" && typeof p.yaml === "string", "sections").map(p => ({...p, status: "ok" as const, issues: []}));
  const rounds = array<Record<string, unknown>>(raw.rounds, object, "question rounds").map(r => ({
    questions: array<BuilderQuestion>(r.questions, q => object(q) && typeof q.id === "string" && typeof q.text === "string" && ["single", "multi", "scale", "text"].includes(String(q.kind)), "questions").map(q => ({
      ...q, options: array<NonNullable<BuilderQuestion["options"]>[number]>(q.options, o => object(o) && typeof o.id === "string" && typeof o.label === "string", "question options"), ...(answer(q.default) ? {} : {default: undefined}),
    })),
    answers: answers(r.answers),
  }));
  const additions = array<BuilderAddition>(raw.additions, a => object(a) && typeof a.name === "string" && ["skill", "meter", "item", "place", "action", "rule", "person", "other"].includes(String(a.kind)), "additions").map(a => ({...a, note: string(a.note)}));
  const a = object(raw.analysis) ? raw.analysis : null;
  const sb = a && object(a.statusBlock) ? a.statusBlock : null;
  // Drafts saved before the designer moved out of Warp: its fields are dropped, and a "deepen" draft reopens as a refine.
  const { effort: _effort, log: _log, waived: _waived, depth: _depth, designPass: _designPass, ...kept } = raw;
  return {
    ...kept, schemaVersion: BUILDER_SESSION_VERSION,
    characterId, characterName: string(raw.characterName, "This character"), mode: (raw.mode === "deepen" ? "refine" : raw.mode) as BuilderSession["mode"], step: raw.step as BuilderSession["step"],
    connectionId: string(raw.connectionId), creative: raw.creative === true, base: string(raw.base),
    analysis: a ? {
      summary: string(a.summary), suggestedTemplate: string(a.suggestedTemplate), reason: string(a.reason), cardType: a.cardType === "scenario" ? "scenario" : "character",
      cast: Array.isArray(a.cast) ? a.cast.filter(object).map(c => ({name: string(c.name), relation: string(c.relation)})) : [], statusBlock: sb ? {found: sb.found === true, fields: strings(sb.fields)} : null,
    } : null,
    parts, rounds, additions, preview: null, busy: null,
    request: typeof raw.request === "string" ? raw.request : null, changeSummary: typeof raw.changeSummary === "string" ? raw.changeSummary : null, error: typeof raw.error === "string" ? raw.error : null,
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    plan: typeof raw.plan === "string" ? raw.plan : null,
  };
}
