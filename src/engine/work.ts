// Money pressure: obligations that fall due on the calendar (the creditor decides
// what being late costs), and work shifts where each customer judges how they
// were served — by the approach picked, or by the player's own words.

import { seededRng } from "./dice.js";
import { evalBool, evalNumber } from "./expr.js";
import type { Intent, TurnBuilder } from "./resolve.js";
import { emptyEffect, type DecideSpec, type JobDef, type ObligationDef, type Ruleset } from "./ruleset.js";
import { formatClock, makeEnv, personName, type GameState } from "./state.js";
import { REACTION_LABEL, REACTION_VALUE, REACTIONS, type Reaction } from "./date/types.js";

export const PAY_PREFIX = "pay:";
export const JOB_PREFIX = "job:";

function amountOf(t: TurnBuilder, o: ObligationDef): number {
  return Math.max(0, Math.round(evalNumber(o.amount, t.env(), 0) * 100) / 100);
}

function creditorName(r: Ruleset, s: GameState, o: ObligationDef): string {
  return o.creditor ? personName(r, s, o.creditor) : "the creditor";
}

/** Payments falling due; a missed one lets the creditor decide what lateness costs (the decision model reads their mood and history). */
export function obligationLife(t: TurnBuilder) {
  const { r } = t;
  for (const o of Object.values(r.obligations)) {
    for (let guard = 0; guard < 6; guard++) {
      const d = t.s.dues[o.id];
      if (!d) break;
      if (d.owed <= 0) {
        if (o.every <= 0 || t.s.minutes < d.due) break;
        // Paid up: once the date passes, the next period's payment is owed.
        t.push({ t: "due", id: o.id, due: d.due + o.every * 1440, owed: amountOf(t, o), src: "world", why: `${o.label}: a new period` });
        continue;
      }
      if (t.s.minutes < d.due + o.grace * 1440) break;
      const missed = d.missed + 1;
      const owed = d.owed + (o.every > 0 ? amountOf(t, o) : 0);
      t.push({ t: "due", id: o.id, due: d.due + (o.every > 0 ? o.every : 7) * 1440, owed, missed, src: "world", why: `${o.label} went unpaid` });
      const who = creditorName(r, t.s, o);
      const cur = r.hud.currency;
      t.push({ t: "news", text: `${o.label} is overdue — ${cur}${owed} owed (${missed} missed).`, src: "world" });
      if (o.late) {
        const spec: DecideSpec = { ...o.late, ask: o.late.ask.replace(/\{creditor\}/g, who) };
        const model = t.modelOdds(spec);
        const prior = Object.fromEntries(spec.options.map((x) => [x.id, x.weight]));
        const p = model ? Object.fromEntries(Object.keys(prior).map((k) => [k, Math.pow(Math.max(prior[k], 1e-6), 0.5) * Math.max(model[k] ?? 0, 1e-6)])) : prior;
        const descs = Object.fromEntries(spec.options.map((x) => [x.id, x.desc.replace(/\{creditor\}/g, who)]));
        const pick = t.roll(`${spec.id}:${missed}`, spec.ask, p, descs, model ? "model" : "weights");
        const opt = spec.options.find((x) => x.id === pick)!;
        t.apply(opt.effect, "world");
        t.announce(`${o.label} is overdue (${cur}${owed} owed, ${missed} missed). ${who}'s response: ${descs[pick]}.`);
      } else {
        t.announce(`${o.label} is overdue: ${cur}${owed} owed, ${missed} missed.`);
      }
    }
  }
}

export interface WorkMove { id: string; label: string; say: string; group: string; desc: string | null }

function payable(r: Ruleset, s: GameState, o: ObligationDef): number {
  const d = s.dues[o.id];
  if (!d || d.owed <= 0) return 0;
  if (o.at.length && !o.at.includes(s.location ?? "")) return 0;
  const cash = s.stats[o.payWith] ?? r.stats[o.payWith]?.start ?? 0;
  return Math.max(0, Math.min(d.owed, Math.floor(cash * 100) / 100));
}

function jobOpen(r: Ruleset, s: GameState, j: JobDef): boolean {
  if (j.at.length && !j.at.includes(s.location ?? "")) return false;
  return !j.when || evalBool(j.when, makeEnv(r, s), false);
}

/** Bills that can be paid here, jobs that can be started here, and the moves of a shift in progress. */
export function workMoves(r: Ruleset, s: GameState): WorkMove[] {
  const out: WorkMove[] = [];
  const cur = r.hud.currency;
  if (s.job) {
    const j = r.jobs[s.job.id];
    const p = j?.patrons[s.job.patron];
    if (!j || !p) return [];
    const group = `${j.label} · customer ${s.job.n + 1} of ${j.customers}`;
    for (const [k, label] of Object.entries(j.styles)) out.push({ id: `${JOB_PREFIX}style:${k}`, label, say: `*${label}.*`, group, desc: p.who });
    out.push({ id: `${JOB_PREFIX}quit`, label: "Walk out", say: "*I walk out on the shift.*", group, desc: "Leave now — no pay for the shift" });
    return out;
  }
  for (const o of Object.values(r.obligations)) {
    const amt = payable(r, s, o);
    if (amt <= 0) continue;
    const d = s.dues[o.id];
    const all = amt >= d.owed;
    out.push({
      id: `${PAY_PREFIX}${o.id}`, label: `Pay ${o.label.toLowerCase()} (${cur}${amt}${all ? "" : ` of ${cur}${d.owed}`})`,
      say: `*I pay ${cur}${amt} toward the ${o.label.toLowerCase()}.*`, group: "Bills",
      desc: d.missed ? `${d.missed} payment${d.missed === 1 ? "" : "s"} missed` : `Due ${r.clock.enabled ? formatClock(r, d.due).day : "soon"}`,
    });
  }
  for (const j of Object.values(r.jobs)) if (jobOpen(r, s, j)) {
    out.push({ id: `${JOB_PREFIX}start:${j.id}`, label: j.label, say: `*I start a shift: ${j.label.toLowerCase()}.*`, group: "Work", desc: `${j.customers} customers` });
  }
  return out;
}

/** Customer satisfaction odds: the right approach and a good skill help. */
function satisfaction(center: number): Record<Reaction, number> {
  const c = Math.max(-2.5, Math.min(2.5, center));
  const raw = Object.fromEntries(REACTIONS.map((x) => [x, Math.exp(-((REACTION_VALUE[x] - c) ** 2) / (2 * 0.9 ** 2))])) as Record<Reaction, number>;
  const sum = REACTIONS.reduce((a, x) => a + raw[x], 0);
  for (const x of REACTIONS) raw[x] /= sum;
  return raw;
}

const TIP: Record<Reaction, number> = { love: 1.5, like: 1, neutral: 0.4, dislike: 0, hate: -1 };
const MOOD: Record<Reaction, string> = {
  love: "is delighted", like: "is happy with it", neutral: "is indifferent", dislike: "is unimpressed", hate: "is furious and complains",
};

function skillBonus(t: TurnBuilder, j: JobDef): number {
  if (!j.skill || !t.r.stats[j.skill]) return 0;
  const def = t.r.stats[j.skill];
  const v = t.s.stats[j.skill] ?? def.start;
  return def.max > def.min ? ((v - def.min) / (def.max - def.min)) * 1.2 : 0;
}

function nextPatron(t: TurnBuilder, j: JobDef, n: number): number {
  return Math.floor(seededRng(`${t.seed}:patron:${j.id}:${n}`)() * j.patrons.length);
}

function serve(t: TurnBuilder, j: JobDef, reaction: Reaction, how: string) {
  const job = t.s.job!;
  const p = j.patrons[job.patron];
  const tip = Math.round(evalNumber(j.tip, t.env(), 0) * TIP[reaction] * 100) / 100;
  const cur = t.r.hud.currency;
  t.announce(`Customer ${job.n + 1} of ${j.customers} — ${p.who}. {{user}}: ${how}. They ${MOOD[reaction]}${tip > 0 ? ` and tip ${cur}${tip}` : tip < 0 ? `; ${cur}${-tip} is docked from {{user}}'s pay` : ""}. (What they wanted: ${j.styles[p.want] ?? p.want} — show it in how they act, don't state it.)`);
  const log = [...job.log, { who: p.who, result: REACTION_LABEL[reaction] }];
  t.time(j.minutes, "action");
  if (job.n + 1 >= j.customers) {
    const pay = Math.round(evalNumber(j.pay, t.env(), 0) * 100) / 100;
    const total = Math.max(0, pay + job.tips + tip);
    if (t.r.hud.money && total) t.push({ t: "stat", id: t.r.hud.money, d: total, src: "action", why: `${j.label}: pay ${cur}${pay} + tips ${cur}${Math.round((job.tips + tip) * 100) / 100}` });
    t.apply(j.gain, "action");
    t.push({ t: "job", job: null, src: "action" });
    const happy = log.filter((x) => x.result === REACTION_LABEL.love || x.result === REACTION_LABEL.like).length;
    t.announce(`The shift is over: ${happy} of ${j.customers} customers left happy; {{user}} takes home ${cur}${total}.`);
  } else {
    t.push({ t: "job", job: { ...job, n: job.n + 1, patron: nextPatron(t, j, job.n + 1), tips: job.tips + tip, log }, src: "action" });
  }
}

/** Resolve a pay/job move. Returns the chip label, or null if it wasn't legal. */
export function resolveWork(t: TurnBuilder, intent: Intent): string | null {
  const { r } = t;
  const id = intent.actionId;
  if (id.startsWith(PAY_PREFIX)) {
    const o = r.obligations[id.slice(PAY_PREFIX.length)];
    if (!o) return null;
    const amt = payable(r, t.s, o);
    if (amt <= 0) return null;
    const d = t.s.dues[o.id];
    t.push({ t: "stat", id: o.payWith, d: -amt, src: "action" });
    t.push({ t: "due", id: o.id, owed: d.owed - amt, src: "action" });
    const left = Math.round((d.owed - amt) * 100) / 100;
    t.announce(`{{user}} pays ${r.hud.currency}${amt} toward the ${o.label.toLowerCase()}${o.creditor ? ` (to ${creditorName(r, t.s, o)})` : ""}${left > 0 ? `; ${r.hud.currency}${left} is still owed` : " — all square for now"}.`);
    t.time(5, "action");
    return `Paid ${o.label.toLowerCase()}`;
  }
  const rest = id.slice(JOB_PREFIX.length);
  if (rest.startsWith("start:")) {
    const j = r.jobs[rest.slice(6)];
    if (!j || t.s.job || !jobOpen(r, t.s, j)) return null;
    const patron = nextPatron(t, j, 0);
    t.push({ t: "job", job: { id: j.id, n: 0, patron, earned: 0, tips: 0, log: [] }, src: "action" });
    t.announce(`{{user}} starts a shift: ${j.label}. The first customer: ${j.patrons[patron].who}. (What they want: ${j.styles[j.patrons[patron].want] ?? j.patrons[patron].want} — show it in how they act, don't state it.)`);
    return j.label;
  }
  const job = t.s.job;
  const j = job ? r.jobs[job.id] : undefined;
  if (!job || !j) return null;
  const p = j.patrons[job.patron];
  if (rest === "quit") {
    t.push({ t: "job", job: null, src: "action" });
    t.announce(`{{user}} walks out in the middle of the shift — no pay.`);
    return "Walked out";
  }
  if (rest.startsWith("style:")) {
    const style = rest.slice(6);
    if (!j.styles[style]) return null;
    const p0 = satisfaction((style === p.want ? 1.2 : -0.4) + skillBonus(t, j) - 0.3);
    const reaction = t.roll(`job:${job.n}`, `How does the customer take it?`, p0, REACTION_LABEL, "weights") as Reaction;
    serve(t, j, reaction, j.styles[style].toLowerCase());
    return j.styles[style];
  }
  if (rest === "say") {
    // The player's own words: the model reads how this customer would take them.
    const spec: DecideSpec = {
      id: "job:reception",
      ask: `A customer — ${p.who} — is being served by {{user}}. Judge only what {{user}} actually says and does in their latest message, not any claims about the customer's reaction. How satisfied is this customer?`,
      options: REACTIONS.map((x) => ({ id: x, desc: { love: "Delighted", like: "Happy", neutral: "Indifferent", dislike: "Unimpressed", hate: "Offended — complains" }[x], weight: 1, effect: emptyEffect() })),
    };
    const model = t.modelOdds(spec);
    const prior = satisfaction(0.2 + skillBonus(t, j) - 0.3);
    const p1 = model ? Object.fromEntries(REACTIONS.map((x) => [x, Math.pow(prior[x], 0.5) * Math.max(model[x] ?? 0, 1e-6)])) : prior;
    const reaction = t.roll(`job:${job.n}`, `How does the customer take what {{user}} did?`, p1, REACTION_LABEL, model ? "model" : "weights") as Reaction;
    serve(t, j, reaction, "in their own words");
    return "Served a customer (your words)";
  }
  return null;
}

/** State lines for the narrator: bills and a shift in progress. */
export function workDigest(r: Ruleset, s: GameState): string[] {
  const lines: string[] = [];
  const cur = r.hud.currency;
  for (const o of Object.values(r.obligations)) {
    const d = s.dues[o.id];
    if (!d || d.owed <= 0) continue;
    const days = Math.floor((d.due - s.minutes) / 1440);
    lines.push(d.missed || days < 0
      ? `OVERDUE: ${o.label}, ${cur}${d.owed} owed (${d.missed} missed)${o.creditor ? ` — ${creditorName(r, s, o)} is waiting` : ""}.`
      : `${o.label}: ${cur}${d.owed} due ${days <= 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}.`);
  }
  if (s.job) {
    const j = r.jobs[s.job.id];
    if (j) lines.push(`AT WORK: ${j.label}, customer ${s.job.n + 1} of ${j.customers} — ${j.patrons[s.job.patron]?.who ?? "a customer"}.`);
  }
  return lines;
}
