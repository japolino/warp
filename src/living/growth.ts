import { revision } from "../shared/revision.js";
import { seededRng } from "../engine/dice.js";
import { attemptBands } from "./check-bands.js";
import { actorName, entityFor, present } from "./encounters.js";
import { participant, relationshipEvidence } from "./companions.js";
import type { MechanicalState, MechanicalOperation, MechanicalChange } from "./mechanics.js";
import type { EncounterBeat } from "./encounters.js";
import type { Decision, Evidence, Message } from "./world.js";

export const PRACTICE_MILESTONE = 3;
export interface LearningWitness { seed: string; tier: Decision["tier"]; result: Decision["result"]; roll: number; }
export interface PracticeCredit { context: string; kind: "challenge" | "instruction"; action?: string; source?: Evidence; }
export interface PracticeTrack {
  id: string; owner: string; name: string; skill: string; credits: PracticeCredit[]; familiar: boolean;
}
export interface PracticeLesson { owner: string; ability: string; teacher: string; source: Evidence; }
export type PracticeObservation = { kind: "practice"; value: PracticeLesson };
const norm = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase();
const text = (s: unknown) => typeof s === "string" && s.trim().length <= 160 ? s.trim() : "";

function subject(state: MechanicalState, actor: string, operation: MechanicalOperation) {
  if (operation.kind === "strike") return { skill: "strike", name: "Unarmed strikes" };
  if (operation.kind !== "ability") return;
  const a = state.abilities?.find(a => a.id === operation.ability && a.owner === actor && a.version === operation.version);
  return a ? { skill: `ability:${a.id}:${a.fingerprint}`, name: a.name } : undefined;
}
export function activePracticeTracks(state: MechanicalState): PracticeTrack[] {
  return (state.growth ?? []).filter(g => g.skill === "strike" || state.abilities?.some(a => a.owner === g.owner && g.skill === `ability:${a.id}:${a.fingerprint}`));
}
export function practiceBenefit(state: MechanicalState, actor: string, operation?: MechanicalOperation): string[] {
  if (!operation) return [];
  actor = actorName(state, actor); const skill = subject(state, actor, operation);
  return skill && state.growth?.some(g => g.owner === actor && g.skill === skill.skill && g.familiar) ? [`Practiced ${skill.name}`] : [];
}
export function validLearningWitness(witness: LearningWitness) {
  if (!witness || typeof witness.seed !== "string" || witness.seed.length > 160 || !["favorable", "uncertain", "outmatched"].includes(witness.tier)) throw Error("Invalid learning check");
  const roll = Math.floor(seededRng(witness.seed)() * 100) + 1, [clean, mixed] = attemptBands(witness.tier);
  if (witness.roll !== roll || witness.result !== (roll <= clean ? "clean" : roll <= mixed ? "mixed" : "setback")) throw Error("Learning check does not match the saved roll");
}
function credit(state: MechanicalState, actor: string, skill: { skill: string; name: string }, cause: PracticeCredit, changes?: MechanicalChange[], beats?: EncounterBeat[]) {
  const id = `practice-${revision([actor, skill.skill])}`, old = state.growth?.find(g => g.id === id);
  if (old?.familiar || old?.credits.some(c => c.context === cause.context)) return;
  const next: PracticeTrack = old ? structuredClone(old) : { id, owner: actor, ...skill, credits: [], familiar: false };
  next.credits.push(structuredClone(cause)); next.familiar = next.credits.length >= PRACTICE_MILESTONE;
  state.growth ??= [];
  if (old) state.growth[state.growth.indexOf(old)] = next; else state.growth.push(next);
  changes?.push({ kind: "growth", id, before: old ? structuredClone(old) : null, after: structuredClone(next) });
  if (next.familiar) beats?.push({ kind: "milestone", actor, name: `${next.name}: familiar`, basis: "warp" });
}

/** One real, committed opposed use; repeated duels with the same identity teach once. */
export function learnFromChallenge(state: MechanicalState, before: MechanicalState, actor: string, operation: MechanicalOperation, action: string, witness: LearningWitness, changes: MechanicalChange[], beats: EncounterBeat[]) {
  validLearningWitness(witness);
  actor = actorName(before, actor); const skill = subject(before, actor, operation);
  if (!skill || !["ability", "strike"].includes(operation.kind)) return;
  if (!("outcome" in operation) || operation.outcome !== witness.result) throw Error("Learning outcome differs from the executed attempt");
  const target = "target" in operation && operation.target ? actorName(before, operation.target) : "", entity = target ? entityFor(before, target) : undefined;
  if ((!entity && target !== "you") || target === actor || !present(before, target)) return;
  credit(state, actor, skill, { context: `entity:${target === "you" ? "you" : entity!.id}`, kind: "challenge", action }, changes, beats);
}

/** Source-backed completed instruction, not a player's intention or a static profile. */
export function readPractice(row: Record<string, unknown>, state: MechanicalState, source: Evidence, messages: Message[]): PracticeObservation | undefined {
  if (source.message.startsWith("warp-source:") || Object.keys(row).some(k => !["kind", "owner", "ability", "teacher", "unsupported", "message", "quote", "source", "sourceRevision", "viewRevision"].includes(k))) return;
  if (row.unsupported !== undefined && (!Array.isArray(row.unsupported) || row.unsupported.length)) return;
  const owner = participant(state, text(row.owner)), teacher = participant(state, text(row.teacher));
  const ability = state.abilities?.find(a => a.owner === owner && (a.id === row.ability || norm(a.name) === norm(text(row.ability))));
  if (!ability || !teacher || teacher === owner || teacher !== "you" && !entityFor(state, teacher) || !present(state, owner)) return;
  const evidence = relationshipEvidence(state, owner, teacher, source, messages);
  if (!evidence || !norm(evidence.quote).includes(norm(ability.name))) return;
  const observation: PracticeObservation = { kind: "practice", value: { owner, teacher, ability: ability.id, source: evidence } };
  const key = `ability:${ability.id}:${ability.fingerprint}`, existing = state.growth?.find(g => g.owner === owner && g.skill === key);
  if (existing?.familiar || existing?.credits.some(c => c.context === `entity:${teacher === "you" ? "you" : entityFor(state, teacher)!.id}`)) return;
  return observation;
}
export function observePractice(state: MechanicalState, lesson: PracticeLesson) {
  const a = state.abilities?.find(a => a.id === lesson.ability && a.owner === lesson.owner), teacher = entityFor(state, lesson.teacher);
  if (a && (teacher || lesson.teacher === "you")) credit(state, lesson.owner, { skill: `ability:${a.id}:${a.fingerprint}`, name: a.name }, { context: `entity:${lesson.teacher === "you" ? "you" : teacher!.id}`, kind: "instruction", source: lesson.source });
}
export function growthNotes(before: MechanicalState, after: MechanicalState): string[] {
  return (after.growth ?? []).filter(g => g.familiar && g.owner === "you" && !before.growth?.some(old => old.id === g.id && old.familiar)).map(g => `${g.name}: familiar`);
}

export const GROWTH_INSTRUCTIONS = `Warp records familiarity locally from executed opposed strikes/known abilities and completed instruction. Do not invent XP, levels, stat pools, progression costs, extra practice rows for action receipts, or new powers. Repeated use against the same entity teaches at most once per technique; repeating one teacher's lesson cannot farm more credit. Three distinct eligible opportunities earn one bounded familiarity benefit for that exact technique. Familiarity alone never lifts an outmatched base tier. Code supplies this Warp rule; it never changes source costs, effects, immunity, consent or prerequisites. Ordinary conversation, affection, cancelled/rejected actions and uncontested routine casts earn no challenge credit. Announce only a newly earned milestone, never routine point totals unless asked. Read-only practice queries can include opportunities/milestoneAt from saved state; answering them grants nothing. Omitted progress is not erased.
For an actual completed lesson in an ALREADY KNOWN ability only, mechanicalObservations may include {kind:"practice",owner:"student's exact identity",ability:"saved ability id or name",teacher:"known actual instructor",unsupported:[],message,quote}. Cite actual narrator completion naming both participants and the technique. Declare missing participants first. An offer to teach, watching someone without instruction, a question, a player attempt or a profile is not completed practice. No extra model call or setup is needed. Keep unresolved tuition, timing, prerequisites or learning rules in unsupported; such a lesson grants no automatic familiarity. Do not invent a published game's levels. A new/changed power still needs its own source-backed ability definition.`;
