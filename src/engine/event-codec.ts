import { objectOf, safeKey } from "./proposal.js";
import type { WarpEvent } from "./state.js";

const fields: Record<string, string> = {
  stat: "id:s", flag: "key:s v:v", item: "id:s d:n", rel: "who:s stat:s", person: "id:s name:s", move: "to:s", time: "min:n",
  cond: "id:s on:b", trig: "id:s v:b", turn: "", seed: "v:s", wear: "slot:s item:s?", dmg: "item:s d:n",
  enc: "id:s?", swing: "d:n", foe: "stat:s", round: "", codex: "id:s", feat: "id:s", perk: "id:s", calib: "who:s", forget: "who:s",
  secret: "id:s stage:n", clock: "id:s d:n", stage: "id:s n:n", gauge: "", rest: "days:n", omen: "id:s?", happen: "id:s", notice: "text:s", noticed: "",
  dg_enter: "run:o", dg_step: "x:n y:n", dg_clear: "key:s", dg_down: "pos:a", dg_party: "party:a", dg_xp: "d:n", dg_gold: "d:n",
  dg_bag: "item:s d:n", dg_loot: "item:s d:n", dg_battle: "battle:o?", dg_pending: "pending:o?", dg_log: "text:s", dg_told: "", dg_exit: "",
  dt_start: "session:o", dt_patch: "patch:o", dt_end: "", dt_pref: "who:s key:s v:n", dt_seen: "who:s topic:s reaction:s", dt_partner: "who:s on:b", dt_dated: "who:s enjoy:n",
  body: "part:s trait:s v:s?", tf: "id:s stage:n", bond: "a:s b:s d:n", news: "text:s", conceive: "carrier:s with:s", preg_stage: "n:n",
  birth: "id:s kin:o", kin_join: "id:s", due: "id:s", job: "job:o?", seen: "who:s what:s where:s", explored: "loc:s found:b", discovered: "id:s",
  practice: "id:s d:n", scene: "who:s here:b", use: "id:s n:n", save: "slot:s label:s", load: "slot:s", restart: "", end: "id:s told:b", end_told: "", unend: "",
};
const sources = new Set("cost check action drift trigger narrator manual start world".split(" "));
/** Bounded JSON guard excludes prototype keys and non-finite nested values. */
export function validJson(value: unknown, depth = 0, budget = { n: 200_000 }): boolean {
  if (--budget.n < 0 || depth > 30) return false;
  if (value === null || value === undefined || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 100_000;
  if (Array.isArray(value)) return value.every((v) => validJson(v, depth + 1, budget));
  if (typeof value !== "object") return false;
  return Object.entries(value).every(([k, v]) => safeKey(k) && validJson(v, depth + 1, budget));
}
function matches(v: unknown, type: string): boolean {
  if (type.endsWith("?") && v === null) return true;
  switch (type[0]) {
    case "s": return typeof v === "string";
    case "n": return typeof v === "number" && Number.isFinite(v);
    case "b": return typeof v === "boolean";
    case "a": return Array.isArray(v);
    case "o": return v !== null && typeof v === "object" && !Array.isArray(v);
    case "v": return v === null || ["string", "boolean", "number"].includes(typeof v);
    default: return false;
  }
}
function shape(value: unknown, spec: string): boolean {
  const o = objectOf(value);
  return spec.split(" ").filter(Boolean).every((field) => { const [k, t] = field.split(":"); return matches(o[k], t); });
}
export function validEvent(value: unknown): value is WarpEvent {
  const e = objectOf(value);
  if (typeof e.t !== "string" || !Object.hasOwn(fields, e.t) || typeof e.src !== "string" || !sources.has(e.src) || !validJson(e) || !shape(e, fields[e.t])) return false;
  for (const key of ["d", "set", "until", "due", "owed", "missed", "momentum"]) if (e[key] !== undefined && e[key] !== null && !matches(e[key], "n")) return false;
  for (const key of ["id", "who", "stat", "key", "part", "trait", "slot", "item", "a", "b", "to"]) if (typeof e[key] === "string" && !safeKey(e[key] as string)) return false;
  if (["stat", "rel", "foe", "gauge"].includes(e.t) && e.d === undefined && e.set === undefined) return false;
  if (e.t === "dt_start" && !shape(e.session, "who:s kind:s beat:n beats:n fatigue:n mood:n combo:n enjoy:n used:o offer:a closing:b started:n")) return false;
  if (e.t === "dg_enter" && !shape(e.run, "id:s seed:s depth:n pos:a seen:a cleared:a party:a xp:n gold:n bag:o loot:o log:a")) return false;
  if (e.t === "dg_battle" && e.battle !== null && !shape(e.battle, "kind:s at:s round:n fighters:a queue:a log:a active:s? over:s?")) return false;
  if (e.t === "birth" && !shape(e.kin, "name:s sex:s born:n parents:a body:o joined:b")) return false;
  return true;
}
