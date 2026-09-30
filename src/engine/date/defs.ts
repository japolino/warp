// `dating:` in a ruleset. `dating: true` turns on the built-in topics, stages and
// outings; a map changes any of them.

import type { StatDef } from "../ruleset.js";
import { Ctx, isObj, list, titleCase, type Raw } from "../ruleset.js";
import { DEFAULT_CATEGORIES, DEFAULT_STAGES, DEFAULT_TOPICS, DEFAULT_VENUES } from "./content.js";
import { REACTIONS, type ActivityDef, type CategoryDef, type DatingDef, type Reaction, type StageDef, type TopicDef, type VenueDef, type VenueEventDef } from "./types.js";

export function disabledDating(): DatingDef {
  return {
    enabled: false, love: "love", fear: "fear", stages: DEFAULT_STAGES, hostileAt: 60, hostileLabel: "Hostile",
    categories: DEFAULT_CATEGORIES, topics: {}, topicOrder: [], venues: {}, people: {},
    minutesPerTopic: 5, fatiguePerTopic: 12, beats: 4, minutesPerBeat: 30, romance: true,
  };
}

function defaultRelStat(id: string, kind: "love" | "fear"): StatDef {
  const love = kind === "love";
  return {
    id, label: titleCase(id), kind: "meter", min: 0, max: 100, start: 0,
    good: love ? "high" : "low", perHour: 0, show: "text", narrator: 5,
    bands: love
      ? [{ at: 0, text: "Indifferent", tone: "neutral" }, { at: 20, text: "Fond", tone: "warn" }, { at: 50, text: "Smitten", tone: "good" }, { at: 80, text: "In love", tone: "good" }]
      : [{ at: 0, text: "At ease", tone: "good" }, { at: 30, text: "Wary", tone: "warn" }, { at: 60, text: "Afraid", tone: "bad" }],
  };
}

const REACTION_KEYS: Record<string, Reaction> = { loves: "love", love: "love", likes: "like", like: "like", neutral: "neutral", dislikes: "dislike", dislike: "dislike", hates: "hate", hate: "hate" };

function normTopic(id: string, raw: unknown, base: TopicDef | undefined, where: string, c: Ctx, cats: Set<string>, stageIds: string[]): TopicDef | null {
  const r: Raw = isObj(raw) ? raw : typeof raw === "string" ? { label: raw } : raw === true ? {} : {};
  if (!isObj(raw) && typeof raw !== "string" && raw !== true) { c.warn(where, "expected a topic (`label:`, `category:`) or `false` to remove it"); return null; }
  const category = typeof r.category === "string" ? r.category : base?.category ?? "small_talk";
  if (!cats.has(category)) c.warn(`${where} › category`, `"${category}" isn't a category (${[...cats].join(", ")})`);
  let stage = base?.stage ?? 0;
  if (r.stage !== undefined) {
    const i = typeof r.stage === "number" ? r.stage : stageIds.indexOf(String(r.stage));
    if (i < 0 || i >= stageIds.length) c.warn(`${where} › stage`, `"${r.stage}" isn't a stage (${stageIds.join(", ")})`);
    else stage = i;
  }
  const when = r.when !== undefined ? c.expr(r.when, `${where} › when`) : undefined;
  return {
    id,
    label: typeof r.label === "string" ? r.label : base?.label ?? titleCase(id),
    category,
    stage,
    romantic: r.romantic !== undefined ? r.romantic === true : base?.romantic ?? category === "romance",
    weight: Math.max(0, c.num(r.weight, `${where} › weight`, base?.weight ?? 1)),
    ...(typeof r.desc === "string" ? { desc: r.desc } : base?.desc ? { desc: base.desc } : {}),
    ...(typeof r.say === "string" ? { say: r.say } : base?.say ? { say: base.say } : {}),
    ...(when !== undefined ? { when: String(when) } : base?.when ? { when: base.when } : {}),
  };
}

function normVenue(id: string, raw: unknown, base: VenueDef | undefined, where: string, c: Ctx): VenueDef | null {
  if (!isObj(raw) && raw !== true && typeof raw !== "string") { c.warn(where, "expected a venue (`name:`, `activities:`) or `false` to remove it"); return null; }
  const r: Raw = isObj(raw) ? raw : typeof raw === "string" ? { name: raw } : {};
  const activities: ActivityDef[] = [];
  for (const [aid, a] of Object.entries(isObj(r.activities) ? r.activities : {})) {
    const ar: Raw = isObj(a) ? a : typeof a === "string" ? { label: a } : {};
    activities.push({
      id: aid,
      label: typeof ar.label === "string" ? ar.label : titleCase(aid),
      tags: list(ar.tags).map((t) => t.toLowerCase()),
      romantic: ar.romantic === true,
      ...(typeof ar.say === "string" ? { say: ar.say } : {}),
    });
  }
  const events: VenueEventDef[] = [];
  for (const [eid, e] of Object.entries(isObj(r.events) ? r.events : {})) {
    const er: Raw = isObj(e) ? e : typeof e === "string" ? { text: e } : {};
    if (typeof er.text !== "string") { c.warn(`${where} › events › ${eid}`, "needs `text:`"); continue; }
    events.push({ id: eid, text: er.text, weight: Math.max(0, c.num(er.weight, `${where} › events › ${eid} › weight`, 1)), enjoy: c.num(er.enjoy, `${where} › events › ${eid} › enjoy`, 0) });
  }
  const when = r.when !== undefined ? c.expr(r.when, `${where} › when`) : undefined;
  const v: VenueDef = {
    id,
    name: typeof r.name === "string" ? r.name : base?.name ?? titleCase(id),
    cost: Math.max(0, c.num(r.cost, `${where} › cost`, base?.cost ?? 0)),
    romantic: r.romantic !== undefined ? r.romantic === true : base?.romantic ?? false,
    activities: activities.length ? activities : base?.activities ?? [],
    events: events.length ? events : base?.events ?? [],
    ...(typeof r.desc === "string" ? { desc: r.desc } : base?.desc ? { desc: base.desc } : {}),
    ...(typeof r.at === "string" ? { at: r.at } : base?.at ? { at: base.at } : {}),
    ...(when !== undefined ? { when: String(when) } : base?.when ? { when: base.when } : {}),
  };
  if (v.activities.length < 2) c.warn(where, "needs at least two `activities:` to make an outing of it");
  return v;
}

/**
 * Normalise `dating:`. Adds the love and fear relationship stats when the ruleset
 * doesn't declare them, so `dating: true` works on any ruleset.
 */
export function normDating(raw: unknown, c: Ctx, rel: { stats: Record<string, StatDef>; order: string[] }, people: Set<string>): DatingDef {
  const def = disabledDating();
  if (raw === undefined || raw === false || raw === null) return def;
  if (raw !== true && !isObj(raw)) { c.warn("Dating", "should be `true` or a map"); return def; }
  const r: Raw = isObj(raw) ? raw : {};
  def.enabled = true;
  def.romance = r.romance !== false;

  for (const k of ["love", "fear"] as const) {
    const id = typeof r[k] === "string" ? String(r[k]) : k;
    def[k] = id;
    if (!rel.stats[id]) {
      rel.stats[id] = defaultRelStat(id, k);
      rel.order.push(id);
    }
  }

  // Categories and stages
  if (isObj(r.categories)) {
    const cats: CategoryDef[] = [];
    for (const [id, cr] of Object.entries(r.categories)) {
      const x: Raw = isObj(cr) ? cr : typeof cr === "string" ? { label: cr } : {};
      cats.push({ id, label: typeof x.label === "string" ? x.label : titleCase(id), icon: typeof x.icon === "string" ? x.icon : "💬" });
    }
    if (cats.length) def.categories = r.builtin_topics === false ? cats : [...DEFAULT_CATEGORIES.filter((d) => !cats.some((x) => x.id === d.id)), ...cats];
  }
  if (isObj(r.stages)) {
    const stages: StageDef[] = [];
    for (const [id, sr] of Object.entries(r.stages)) {
      const x: Raw = isObj(sr) ? sr : { at: sr };
      stages.push({ id, label: typeof x.label === "string" ? x.label : titleCase(id), at: c.num(x.at, `Dating › stages › ${id}`, 0), partner: x.partner === true });
    }
    stages.sort((a, b) => a.at - b.at);
    if (stages.length >= 2) def.stages = stages;
    else c.warn("Dating › stages", "needs at least two stages — using the built-in ladder");
  }
  const hostile: Raw = isObj(r.hostile) ? r.hostile : r.hostile !== undefined ? { at: r.hostile } : {};
  def.hostileAt = Math.max(1, Math.min(100, c.num(hostile.at, "Dating › hostile", def.hostileAt)));
  if (typeof hostile.label === "string") def.hostileLabel = hostile.label;

  // Topics: the built-ins, then the ruleset's (a `false` removes one).
  const cats = new Set(def.categories.map((x) => x.id));
  const stageIds = def.stages.map((s) => s.id);
  const topics: Record<string, TopicDef> = r.builtin_topics === false ? {} : { ...DEFAULT_TOPICS };
  for (const [id, t] of Object.entries(isObj(r.topics) ? r.topics : {})) {
    if (t === false) { delete topics[id]; continue; }
    const n = normTopic(id, t, topics[id], `Dating › topics › ${id}`, c, cats, stageIds);
    if (n) topics[id] = n;
  }
  for (const t of Object.values(topics)) if (t.stage >= def.stages.length) t.stage = def.stages.length - 1;
  def.topics = topics;
  def.topicOrder = Object.keys(topics);
  if (!def.topicOrder.length) c.warn("Dating", "has no topics — add some under `topics:`");

  const venues: Record<string, VenueDef> = r.builtin_venues === false ? {} : { ...DEFAULT_VENUES };
  for (const [id, v] of Object.entries(isObj(r.venues) ? r.venues : {})) {
    if (v === false) { delete venues[id]; continue; }
    const n = normVenue(id, v, venues[id], `Dating › venues › ${id}`, c);
    if (n) venues[id] = n;
  }
  def.venues = venues;

  // Authored tastes: `robin: { loves: [music], likes: [food, tag:nature], hates: [tease] }` or `robin: { music: love }`.
  for (const [pid, pr] of Object.entries(isObj(r.people) ? r.people : {})) {
    const w = `Dating › people › ${pid}`;
    if (!people.has(pid)) c.warn(w, `"${pid}" isn't a declared person`);
    if (!isObj(pr)) { c.warn(w, "expected tastes like `loves: [music]`"); continue; }
    const tastes: Record<string, Reaction> = {};
    for (const [k, v] of Object.entries(pr)) {
      const as = REACTION_KEYS[k];
      if (as) { for (const key of list(v)) tastes[key] = as; continue; }
      const val = REACTION_KEYS[String(v)];
      if (val) tastes[k] = val;
      else c.warn(`${w} › ${k}`, `use one of ${REACTIONS.join(", ")}`);
    }
    def.people[pid] = tastes;
  }

  if (r.with !== undefined) { const x = c.expr(r.with, "Dating › with"); if (x !== undefined) def.with = String(x); }
  const pace: Raw = isObj(r.pace) ? r.pace : r;
  def.minutesPerTopic = Math.max(0, c.num(pace.minutes_per_topic, "Dating › minutes_per_topic", def.minutesPerTopic));
  def.fatiguePerTopic = Math.max(1, c.num(pace.fatigue_per_topic, "Dating › fatigue_per_topic", def.fatiguePerTopic));
  def.beats = Math.max(1, Math.min(10, Math.round(c.num(pace.beats, "Dating › beats", def.beats))));
  def.minutesPerBeat = Math.max(0, c.num(pace.minutes_per_beat, "Dating › minutes_per_beat", def.minutesPerBeat));
  return def;
}
