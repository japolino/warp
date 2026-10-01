// The depth audit: not "is this valid?" (that's lint) but "what doesn't connect
// to anything?". Items that do nothing, stats nothing changes or nothing reads,
// conditions nothing causes or cures, encounters the player can't read or
// escape. Deterministic — it reads the rules, never a model — so the builder can
// be held to it, and an author can see where their game is thin.

import { compile, identifiers } from "./expr.js";
import type { Effect, Ruleset } from "./ruleset.js";
import { isLoss, thresholds } from "./encounter-view.js";
import type { PartLabel } from "./reference.js";

export interface AuditGap {
  /** Stable id, e.g. "item-dead:scent_blocker" — the builder waives or fixes gaps by id. */
  id: string;
  /** gap = something is plainly unfinished; thin = it works, but could do much more. */
  severity: "gap" | "thin";
  part: PartLabel;
  text: string;
  /** What a good fix looks like. */
  fix: string;
}

export interface AuditReport {
  gaps: AuditGap[];
  /** Connections that exist, as plain facts ("Blocker Spray clears Scented"), for the builder's picture of the game. */
  links: string[];
  /** 0–100: how much of what's declared connects to something. */
  depth: number;
}

/** Keys whose string values are formulas (in the normalized ruleset). */
const FORMULA_KEYS = new Set(["when", "add", "target", "unlock", "requires", "amount", "maxExpr", "chance", "pay", "tip", "perDay", "perTurn", "per_day", "per_turn", "momentum", "gauge", "atk", "def", "mat", "mdf", "agi", "hp", "mp"]);

interface Seen {
  /** Stats any effect changes (incl. set). */
  changed: Set<string>;
  /** Identifiers any formula reads. */
  reads: Set<string>;
  /** Function calls in formulas: has('x') → "has:x". */
  calls: Set<string>;
  itemsGiven: Set<string>;
  itemsTaken: Set<string>;
  condAdded: Set<string>;
  condRemoved: Set<string>;
  flagsSet: Set<string>;
  encStarted: Set<string>;
  moves: Set<string>;
  unlocked: Set<string>;
  moneyUp: boolean;
  moneyDown: boolean;
}

function isEffect(o: unknown): o is Effect {
  return !!o && typeof o === "object" && "stats" in o && "removeConditions" in o && "addConditions" in o;
}

function readFormula(v: string, seen: Seen) {
  try { compile(v); } catch { return; }
  for (const id of identifiers(v)) seen.reads.add(id);
  for (const m of v.matchAll(/\b(has|count|cond|flag|at|present|where|wearing|met|rel|worn|secret|front|codex|feat|perk|deepest|stage|partner|dates|transformed|saved|happened|owed|missed|days_until|arc|bond|seen_by)\(\s*'([^']+)'/g)) seen.calls.add(`${m[1]}:${m[2]}`);
}

function walk(o: unknown, seen: Seen, money: string | undefined, key = "") {
  if (typeof o === "string") { if (FORMULA_KEYS.has(key)) readFormula(o, seen); return; }
  if (!o || typeof o !== "object") return;
  // Lists hold ids and words (orders, tags, exits) — only objects inside them carry formulas.
  if (Array.isArray(o)) { for (const x of o) if (x && typeof x === "object") walk(x, seen, money); return; }
  if (isEffect(o)) {
    for (const v of [...Object.values(o.stats), ...Object.values(o.set), ...Object.values(o.foe), ...Object.values(o.damage), ...Object.values(o.front), ...Object.values(o.transform), ...Object.values(o.arc)]) if (typeof v === "string") readFormula(v, seen);
    for (const [k, v] of [...Object.entries(o.stats), ...Object.entries(o.set)]) {
      seen.changed.add(k);
      if (k === money) {
        const n = typeof v === "number" ? v : /^\s*-/.test(String(v)) ? -1 : 1;
        if (n > 0) seen.moneyUp = true; else if (n < 0) seen.moneyDown = true;
      }
    }
    for (const [k, v] of Object.entries(o.items)) (v > 0 ? seen.itemsGiven : seen.itemsTaken).add(k);
    for (const k of Object.keys(o.addConditions)) seen.condAdded.add(k);
    for (const k of o.removeConditions) seen.condRemoved.add(k);
    for (const k of Object.keys(o.flags)) seen.flagsSet.add(k);
    if (o.startEncounter) seen.encStarted.add(o.startEncounter);
    if (o.move) seen.moves.add(o.move);
    for (const u of o.unlock) seen.unlocked.add(u);
  }
  for (const [k, v] of Object.entries(o)) walk(v, seen, money, k);
}

export function auditRuleset(r: Ruleset): AuditReport {
  const money = r.statOrder.find((id) => r.stats[id].kind === "money");
  const seen: Seen = {
    changed: new Set(), reads: new Set(), calls: new Set(), itemsGiven: new Set(), itemsTaken: new Set(),
    condAdded: new Set(), condRemoved: new Set(), flagsSet: new Set(), encStarted: new Set(), moves: new Set(), unlocked: new Set(),
    moneyUp: false, moneyDown: false,
  };
  walk(r, seen, money);
  // Items given at the start, by shops, by dungeon chests.
  for (const id of Object.keys(r.startItems)) seen.itemsGiven.add(id);
  for (const d of Object.values(r.dungeons)) for (const l of d.loot ?? []) seen.itemsGiven.add(l.item);
  for (const o of Object.values(r.obligations)) { void o; seen.moneyDown = true; }
  for (const j of Object.values(r.jobs)) { void j; seen.moneyUp = true; }

  const gaps: AuditGap[] = [];
  const links: string[] = [];
  const gap = (g: AuditGap) => gaps.push(g);
  const readsStat = (id: string) => seen.reads.has(id) || r.hud.bars.includes(id) && false;

  // ── items ──
  for (const it of Object.values(r.items)) {
    const referenced = seen.calls.has(`has:${it.id}`) || seen.calls.has(`count:${it.id}`) || seen.calls.has(`wearing:${it.id}`) || seen.itemsTaken.has(it.id);
    const gift = it.tags.includes("gift") && r.dating.enabled;
    const bonus = Object.keys(it.bonus).length > 0;
    if (it.use) links.push(`${it.name}: ${it.use.label}`);
    if (bonus) links.push(`${it.name} helps ${Object.keys(it.bonus).map((s) => r.stats[s]?.label ?? s).join(", ")} checks`);
    if (!it.use && !bonus && !referenced && !gift && !it.slot) {
      gap({ id: `item-dead:${it.id}`, severity: "gap", part: "world", text: `${it.name} does nothing: no use, no bonus, and nothing needs it.`, fix: `Give it a use: (what using it does, in this game's stats and conditions${it.desc ? ` — its description says: "${it.desc}"` : ""}), a bonus: to the checks it would help, or an action/encounter move that needs it.` });
    } else if (it.slot && !bonus && !it.traits.length && it.warmth === 0 && it.reveal === 0 && !referenced) {
      gap({ id: `item-flat:${it.id}`, severity: "thin", part: "world", text: `${it.name} is clothing with no effect (no warmth, traits or bonus).`, fix: "Give it warmth, a trait something checks, or a bonus: (sturdy boots → athletics)." });
    }
    if ((referenced || it.use) && !seen.itemsGiven.has(it.id) && !it.slot) {
      gap({ id: `item-unobtainable:${it.id}`, severity: "gap", part: "world", text: `${it.name} matters, but nothing gives it to the player.`, fix: "Add it to start.items, a shop or job reward (give:), dungeon loot, or an action that finds it." });
    }
  }

  // ── stats ──
  for (const id of r.statOrder) {
    const def = r.stats[id];
    if (def.kind === "hidden") continue;
    const grows = (def.kind === "skill" || def.kind === "attribute") && r.growth.enabled && def.growth > 0;
    const changes = seen.changed.has(id) || def.perHour !== 0 || def.narrator > 0 || grows;
    const read = readsStat(id);
    if (!changes) gap({ id: `stat-static:${id}`, severity: "gap", part: "stats", text: `${def.label} never changes: no action, event or drift moves it.`, fix: `Have actions, foe moves, triggers or time move ${def.label}${def.kind === "meter" ? " (per_hour drift, costs, consequences)" : ""}.` });
    if ((def.kind === "skill" || def.kind === "attribute") && !read) {
      gap({ id: `skill-unused:${id}`, severity: "gap", part: "actions", text: `${def.label} is a ${def.kind} no check uses.`, fix: `Make some action or encounter checks read ${id} (e.g. chance: "30 + ${id} / 2"), so it matters and grows.` });
    } else if (def.kind === "meter" && !read && id !== money) {
      gap({ id: `stat-unread:${id}`, severity: "thin", part: "rules", text: `${def.label} is shown but has no consequence.`, fix: `Let something read it: a trigger at a threshold, a check penalty ("- ${id} / 4"), an ending, an encounter's end_when, or an action's when.` });
    }
  }
  // Money the story itself may change moves both ways.
  if (money && r.stats[money].narrator > 0) { seen.moneyUp = true; seen.moneyDown = true; }
  if (money) {
    if (!seen.moneyUp) gap({ id: "money-no-income", severity: "gap", part: "actions", text: `There's ${r.stats[money].label} but no way to earn it.`, fix: "Add jobs, paid actions, rewards or loot that raise it." });
    if (!seen.moneyDown) gap({ id: "money-no-spending", severity: "gap", part: "actions", text: `${r.stats[money].label} piles up with nothing to spend it on.`, fix: "Add costs: shops (give an item for money), rent/bills (obligations), bribes, travel fares." });
  }

  // ── conditions ──
  for (const c of Object.values(r.conditions)) {
    const added = seen.condAdded.has(c.id) || c.narrator;
    const read = seen.calls.has(`cond:${c.id}`);
    if (!added) gap({ id: `cond-never:${c.id}`, severity: "gap", part: "rules", text: `Nothing ever causes ${c.label}.`, fix: `Add it from an action, a foe move, a trigger or an event (add_condition: [${c.id}]).` });
    else {
      const cured = seen.condRemoved.has(c.id);
      if (!cured) gap({ id: `cond-uncured:${c.id}`, severity: "thin", part: "world", text: `Nothing cures ${c.label} (unless it has a duration).`, fix: `Add something that removes it — an item's use:, resting somewhere, a trigger (remove_condition: [${c.id}]), or give it a duration.` });
      else for (const it of Object.values(r.items)) if (it.use && [it.use.effects, ...Object.values(it.use.outcomes)].some((e) => e?.removeConditions.includes(c.id))) links.push(`${it.name} clears ${c.label}`);
    }
    if (added && !read) gap({ id: `cond-unread:${c.id}`, severity: "thin", part: "rules", text: `${c.label} only colours the narration: no check, trigger or encounter reacts to it.`, fix: `Let checks, triggers or encounters read cond('${c.id}') — a penalty, a danger, a door it opens.` });
  }

  // ── flags ──
  for (const f of Object.values(r.flags)) {
    const set = seen.flagsSet.has(f.id) || f.narrator;
    const read = seen.calls.has(`flag:${f.id}`) || seen.reads.has(f.id);
    if (set && !read) gap({ id: `flag-unread:${f.id}`, severity: "thin", part: "rules", text: `The flag ${f.id} is set but nothing checks it.`, fix: `Use flag('${f.id}') in an action's when, a trigger or a codex unlock.` });
    if (!set && read && !f.start) gap({ id: `flag-unset:${f.id}`, severity: "gap", part: "rules", text: `The flag ${f.id} is checked but nothing ever sets it.`, fix: `Set it from an action or trigger (flags: { ${f.id}: true }).` });
  }

  // ── people and places ──
  for (const p of Object.values(r.people)) {
    if (!p.schedule.length) gap({ id: `person-nowhere:${p.id}`, severity: "thin", part: "people", text: `${p.name} has no schedule, so they're only ever where the story says.`, fix: `Give ${p.name} a schedule (where they are by time and day) so the player can find them.` });
  }
  const startLoc = r.startLocation;
  const reachable = new Set<string>(startLoc ? [startLoc] : []);
  for (let grew = true; grew;) {
    grew = false;
    for (const l of Object.values(r.locations)) if (reachable.has(l.id)) for (const x of l.exits) if (!reachable.has(x) && r.locations[x]) { reachable.add(x); grew = true; }
    for (const m of seen.moves) if (!reachable.has(m) && r.locations[m]) { reachable.add(m); grew = true; }
  }
  for (const l of Object.values(r.locations)) {
    if (startLoc && !reachable.has(l.id)) gap({ id: `place-unreachable:${l.id}`, severity: "gap", part: "world", text: `${l.name} can't be reached from the start.`, fix: `Connect it with exits: (or a move: effect) from a place the player can get to.` });
    const things = Object.values(r.actions).some((a) => a.at.includes(l.id)) || Object.values(r.people).some((p) => p.schedule.some((s) => s.at === l.id))
      || seen.calls.has(`at:${l.id}`) || Object.values(r.dungeons).some((d) => d.at.includes(l.id))
      || Object.values(r.jobs).some((j) => j.at.includes(l.id)) || Object.values(r.dating.venues).some((v) => v.at === l.id);
    if (!things) gap({ id: `place-empty:${l.id}`, severity: "thin", part: "actions", text: `There's nothing to do at ${l.name} and nobody there.`, fix: `Add an action at: [${l.id}], schedule someone there, or put a job, shop or dungeon entrance there.` });
  }

  // ── encounters ──
  for (const e of Object.values(r.encounters)) {
    const th = thresholds(e);
    const winRoutes = new Set<string>();
    for (const t of th) if (t.foe && !isLoss(e, t.outcome)) winRoutes.add(`${t.outcome}:${t.stat}`);
    if (e.momentum) winRoutes.add("momentum");
    let escape = false;
    for (const a of Object.values(e.actions)) for (const fx of [a.effects, ...Object.values(a.outcomes)]) {
      if (fx?.end && !isLoss(e, fx.end)) { winRoutes.add(`end:${fx.end}`); if (!th.some((t) => t.outcome === fx.end)) escape = true; }
    }
    const progressMoves = Object.values(e.actions).filter((a) => [a.effects, ...Object.values(a.outcomes)].some((fx) => fx && (Object.keys(fx.foe).length || fx.end || fx.momentum !== undefined)));
    if (!e.goal && !winRoutes.size) gap({ id: `enc-no-goal:${e.id}`, severity: "gap", part: "encounters", text: `${e.name}: the player can't tell how to win it — no simple end_when on the foe, no move that ends it.`, fix: `Add end_when like "foe.nerve <= 0" with moves that lower it, or moves with end: <outcome>; or write goal: in words.` });
    if (!escape && !e.momentum) gap({ id: `enc-no-escape:${e.id}`, severity: "thin", part: "encounters", text: `${e.name} has no way out but winning or losing.`, fix: "Add an escape route: a move whose success ends it (end: escaped) at a cost — running, hiding, bargaining." });
    if (progressMoves.length < 2) gap({ id: `enc-one-route:${e.id}`, severity: "thin", part: "encounters", text: `${e.name} has ${progressMoves.length ? "only one move" : "no move"} that makes progress.`, fix: "Give it two or three routes with different stats and trade-offs (talk, trick, force, flee), so choices mean something." });
    for (const t of th.filter((x) => !x.foe)) {
      const def = r.stats[t.stat];
      if (def && t.op.startsWith(">") && def.max < t.value) gap({ id: `enc-unreachable:${e.id}:${t.stat}`, severity: "gap", part: "encounters", text: `${e.name} ends at ${def.label} ${t.op} ${t.value}, but ${def.label} can't go above ${def.max}.`, fix: "Lower the threshold or raise the stat's max." });
    }
    const reads = new Set<string>();
    for (const a of Object.values(e.actions)) {
      if (a.check) for (const x of [...identifiers(String(a.check.add ?? "")), ...identifiers(String(a.check.target ?? ""))]) reads.add(x);
      if (a.when && /has\(/.test(a.when)) reads.add("__item");
    }
    const itemsMatter = reads.has("__item") || Object.values(r.items).some((it) => it.use && ([it.use.effects, ...Object.values(it.use.outcomes)].some((fx) => fx && (Object.keys(fx.foe).length || Object.keys(fx.stats).some((s) => reads.has(s)) || fx.removeConditions.length))) || Object.keys(it.bonus).some((s) => reads.has(s)));
    if (!itemsMatter && Object.keys(r.items).length) gap({ id: `enc-no-items:${e.id}`, severity: "thin", part: "encounters", text: `No item matters in ${e.name}.`, fix: "Let an item help: a use: that changes what its checks read (or the foe), a bonus: to those checks, or a move that needs an item." });
    if (!e.fromStory && !seen.encStarted.has(e.id)) gap({ id: `enc-never:${e.id}`, severity: "gap", part: "encounters", text: `Nothing starts ${e.name} (from_story is off and no action starts it).`, fix: `Start it from an action, trigger or random event (start_encounter: ${e.id}), or allow the story to start it.` });
    if (!e.foeMoves) gap({ id: `enc-passive:${e.id}`, severity: "thin", part: "encounters", text: `${e.name}'s other side never acts.`, fix: "Add foe_moves with weights and effects, so standing still has a cost." });
  }

  // ── codex ──
  for (const c of Object.values(r.codex)) {
    if (!c.unlock && !seen.unlocked.has(c.id)) gap({ id: `codex-locked:${c.id}`, severity: "thin", part: "journal", text: `Codex entry "${c.title}" can never be found.`, fix: "Give it an unlock: formula, or unlock it from an action or event." });
  }

  const declared = Object.keys(r.items).length + r.statOrder.length + Object.keys(r.conditions).length + Object.keys(r.flags).length + Object.keys(r.locations).length + Object.keys(r.encounters).length * 3 + 1;
  const weight = gaps.reduce((n, g) => n + (g.severity === "gap" ? 1 : 0.4), 0);
  const depth = Math.max(0, Math.min(100, Math.round(100 * (1 - weight / declared))));
  return { gaps, links, depth };
}
