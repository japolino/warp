// The builder as an agent: instead of writing each section once and stopping
// when it parses, the model works with tools — read and write sections, run the
// checker, run the depth audit, preview the start, simulate encounters — and it
// can't call `finish` while there are errors or audit gaps it hasn't fixed or
// knowingly waived. Doing more isn't an exhortation; it's the only way to finish.
//
// Models that call tools natively use them; others reply with a JSON tool call.

import type { LlmMessageDTO, ToolSchemaDTO } from "lumiverse-spindle-types";
import { auditRuleset, type AuditGap } from "../engine/audit.js";
import { loadRuleset } from "../engine/loader.js";
import { DESIGN_GUIDE, PART_CONTENTS, PART_LABELS, REFERENCE, type PartLabel } from "../engine/reference.js";
import type { Issue, Ruleset } from "../engine/ruleset.js";
import { describeSim, simulateEncounter } from "../engine/simulate.js";
import { initialState } from "../engine/state.js";
import { buildChoices, buildHud } from "../engine/view.js";
import type { BuilderPart, BuilderSession } from "../shared/protocol.js";

export interface AgentCall { content: string; calls: { name: string; args: Record<string, unknown> }[] }
export interface AgentHooks {
  /** One model call with the tools offered. */
  llm(messages: LlmMessageDTO[], tools: ToolSchemaDTO[]): Promise<AgentCall>;
  /** Show what's happening (and keep a line in the session's log). */
  progress(label: string, log?: string): Promise<void>;
}

export const TOOLS: ToolSchemaDTO[] = [
  { name: "read_section", description: "Read one ruleset section's YAML.", parameters: { type: "object", properties: { label: { type: "string", enum: [...PART_LABELS] } }, required: ["label"] } },
  { name: "write_section", description: "Replace one section with new YAML (the whole section). Returns checker problems in it and how the audit changed.", parameters: { type: "object", properties: { label: { type: "string", enum: [...PART_LABELS] }, yaml: { type: "string" } }, required: ["label", "yaml"] } },
  { name: "check", description: "Run the format checker over the whole ruleset: errors and warnings.", parameters: { type: "object", properties: {} } },
  { name: "audit", description: "Run the depth audit: what doesn't connect to anything yet (items that do nothing, stats nothing reads, encounters with one route…), with a fix for each.", parameters: { type: "object", properties: {} } },
  { name: "read_reference", description: "Read the format reference and design guidance for one topic (e.g. items, encounters, stats, people, places, money, dating, dungeons, story).", parameters: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } },
  { name: "preview", description: "What the player sees at the start (or at a place and hour): HUD bars, conditions and the choices offered.", parameters: { type: "object", properties: { location: { type: "string" }, hour: { type: "number" } } } },
  { name: "simulate_encounter", description: "Playtest an encounter by the rules: many seeds per strategy (always one move, random mix) → outcomes, length, rounds that change nothing, and notes.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "waive", description: "Leave an audit gap as it is, on purpose, with the reason (e.g. the phone is flavour). Use sparingly — a waived gap is a promise the player won't miss it.", parameters: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] } },
  { name: "finish", description: "Done. Refused while there are checker errors or audit gaps not fixed or waived.", parameters: { type: "object", properties: { summary: { type: "string", description: "What you built or changed, for the player, in 2–4 sentences." } }, required: ["summary"] } },
];

export const AGENT_SYSTEM = `You are the lead designer of a Warp ruleset: the YAML game engine that runs under a roleplay chat.
Your job is not to produce valid YAML quickly — it's to make a game worth playing, using what the engine can do.
Work with the tools: read sections, write whole sections, run check, run audit, simulate encounters, preview the start.
Every audit gap is something the player will notice; fix it, or waive it only when it is truly deliberate (with the reason).
Prefer connecting what exists over adding more: an item that changes what an encounter's checks read beats a new item nobody needs.
Keep the card's tone, names and setting. Refer to the player as {{user}}. Adults only in anything romantic or sexual.
Call tools one or a few at a time. If you can't call tools natively, reply with JSON only: {"tool": "<name>", "args": {...}} (or a list of them).
When nothing is left, call finish with a short summary.

${DESIGN_GUIDE}

${REFERENCE}`;

/** The ruleset from the session's sections: checker issues and (when it loads) the audit. */
export function evaluate(parts: BuilderPart[]): { ruleset: Ruleset | null; issues: Issue[]; gaps: AuditGap[]; depth: number } {
  const { ruleset, issues } = loadRuleset(parts.filter((p) => p.yaml.trim()).map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: i })));
  if (!ruleset) return { ruleset, issues, gaps: [], depth: 0 };
  const a = auditRuleset(ruleset);
  return { ruleset, issues, gaps: a.gaps, depth: a.depth };
}

/** Gaps still open: not fixed and not waived (thin ones count too when `strict`). */
export function openGaps(s: BuilderSession, gaps: AuditGap[], strict: boolean): AuditGap[] {
  const waived = s.waived ?? {};
  return gaps.filter((g) => !waived[g.id] && (strict || g.severity === "gap"));
}

function referenceFor(topic: string): string {
  const t = topic.toLowerCase().replace(/s$/, "");
  const guide = DESIGN_GUIDE.split(/\n(?=## )/).filter((b) => b.toLowerCase().includes(t)).join("\n");
  const blocks = REFERENCE.split(/\n(?=[a-z_]+:\s)/).filter((b) => b.toLowerCase().includes(t)).slice(0, 6).join("\n");
  return [guide && `Design guidance:\n${guide}`, blocks && `Format:\n${blocks}`].filter(Boolean).join("\n\n").slice(0, 7000) || `Nothing specific on "${topic}". Topics: items, encounters, stats, people, places, money, conditions, dating, dungeons, story, checks.`;
}

function issuesText(issues: Issue[], label?: string): string {
  const mine = label ? issues.filter((i) => i.level === "error" || i.where.toLowerCase().includes(label)) : issues;
  const errors = mine.filter((i) => i.level === "error"), warns = mine.filter((i) => i.level !== "error");
  if (!errors.length && !warns.length) return "No problems.";
  return [...errors.map((i) => `ERROR ${i.where}: ${i.message}`), ...warns.slice(0, 15).map((i) => `warning ${i.where}: ${i.message}`)].join("\n");
}

const gapLine = (g: AuditGap) => `- [${g.severity}] ${g.id}: ${g.text} → ${g.fix}`;

function previewText(r: Ruleset, location?: string, hour?: number): string {
  const s = initialState(r);
  if (location && r.locations[location]) s.location = location;
  if (typeof hour === "number" && hour >= 0 && hour < 24) s.minutes = Math.floor(s.minutes / 1440) * 1440 + Math.round(hour * 60);
  const h = buildHud(r, s);
  const choices = buildChoices(r, s, { lines: [], veils: [] });
  return [
    `At ${h.location?.name ?? "?"}${h.clock ? `, ${h.clock.day} ${h.clock.time}` : ""}.`,
    `Bars: ${h.bars.map((b) => `${b.label} ${b.display}`).join(", ") || "none"}`,
    h.conditions.length ? `Conditions: ${h.conditions.map((c) => c.label).join(", ")}` : "",
    `Inventory: ${h.items.map((i) => `${i.name}${i.use ? ` [use: ${i.use.label}${i.use.locked ? ` — locked: ${i.use.locked}` : ""}]` : ""}${i.bonus ? ` [${i.bonus}]` : ""}`).join(", ") || "empty"}`,
    `Choices: ${choices.map((c) => `${c.label}${c.odds !== null ? ` (${Math.round(c.odds * 100)}%)` : ""}${c.locked ? ` [locked: ${c.locked}]` : ""}`).join(" | ") || "none"}`,
  ].filter(Boolean).join("\n");
}

/** Run one tool against the session; returns what the model is told. */
export function runTool(s: BuilderSession, name: string, args: Record<string, unknown>, strict: boolean): { text: string; finished?: string } {
  const label = String(args.label ?? "") as PartLabel;
  switch (name) {
    case "read_section": {
      const p = s.parts.find((x) => x.label === label);
      return { text: p ? `### ${label}\n${p.yaml}` : `There's no "${label}" section yet. It may hold: ${PART_CONTENTS[label] ?? "?"}` };
    }
    case "write_section": {
      if (!(PART_LABELS as readonly string[]).includes(label)) return { text: `Unknown section "${label}". Sections: ${PART_LABELS.join(", ")}` };
      const yaml = String(args.yaml ?? "").replace(/^```(?:ya?ml)?\s*\n?|```\s*$/g, "").trim();
      if (!yaml) return { text: "Empty YAML — nothing written." };
      const before = evaluate(s.parts);
      const p = s.parts.find((x) => x.label === label);
      if (p) { p.yaml = `${yaml}\n`; p.changed = true; } else s.parts.push({ label, yaml: `${yaml}\n`, status: "ok", issues: [], changed: true });
      const after = evaluate(s.parts);
      if (!after.ruleset) return { text: `Written, but the ruleset no longer loads:\n${issuesText(after.issues)}` };
      const was = new Set(before.gaps.map((g) => g.id)), now = new Set(after.gaps.map((g) => g.id));
      const fixed = before.gaps.filter((g) => !now.has(g.id)).map((g) => g.id), added = after.gaps.filter((g) => !was.has(g.id));
      return { text: [`Wrote "${label}".`, `Checker: ${issuesText(after.issues, label)}`, `Audit: depth ${before.depth} → ${after.depth}.${fixed.length ? ` Fixed: ${fixed.join(", ")}.` : ""}${added.length ? `\nNew gaps:\n${added.map(gapLine).join("\n")}` : ""}`].join("\n") };
    }
    case "check": {
      const e = evaluate(s.parts);
      return { text: e.ruleset ? issuesText(e.issues) : `The ruleset doesn't load:\n${issuesText(e.issues)}` };
    }
    case "audit": {
      const e = evaluate(s.parts);
      if (!e.ruleset) return { text: "Fix the checker errors first; the ruleset doesn't load." };
      const open = openGaps(s, e.gaps, true);
      const links = auditRuleset(e.ruleset).links;
      return { text: [`Depth ${e.depth}/100. Open: ${open.filter((g) => g.severity === "gap").length} gaps, ${open.filter((g) => g.severity === "thin").length} thin spots${Object.keys(s.waived ?? {}).length ? `; waived: ${Object.keys(s.waived ?? {}).join(", ")}` : ""}.`, ...open.slice(0, 40).map(gapLine), links.length ? `Already connected: ${links.slice(0, 20).join("; ")}` : ""].filter(Boolean).join("\n") };
    }
    case "read_reference": return { text: referenceFor(String(args.topic ?? "")) };
    case "preview": {
      const e = evaluate(s.parts);
      return { text: e.ruleset ? previewText(e.ruleset, typeof args.location === "string" ? args.location : undefined, typeof args.hour === "number" ? args.hour : undefined) : "The ruleset doesn't load yet." };
    }
    case "simulate_encounter": {
      const e = evaluate(s.parts);
      if (!e.ruleset) return { text: "The ruleset doesn't load yet." };
      const sim = simulateEncounter(e.ruleset, String(args.id ?? ""), { runs: 100 });
      return { text: sim ? describeSim(sim) : `No encounter "${String(args.id)}". Encounters: ${Object.keys(e.ruleset.encounters).join(", ") || "none"}` };
    }
    case "waive": {
      const id = String(args.id ?? ""), reason = String(args.reason ?? "").trim();
      if (!id || reason.length < 8) return { text: "A waiver needs the gap's id and a real reason." };
      s.waived = { ...(s.waived ?? {}), [id]: reason.slice(0, 200) };
      return { text: `Waived ${id}: ${reason}` };
    }
    case "finish": {
      const e = evaluate(s.parts);
      const errors = e.issues.filter((i) => i.level === "error");
      const open = e.ruleset ? openGaps(s, e.gaps, strict) : [];
      if (!e.ruleset || errors.length) return { text: `Not finished — the checker still reports errors:\n${issuesText(e.issues)}` };
      if (open.length) return { text: `Not finished — ${open.length} audit gap${open.length === 1 ? "" : "s"} still open. Fix each, or waive it with a reason if it's deliberate:\n${open.slice(0, 25).map(gapLine).join("\n")}` };
      return { text: "Finished.", finished: String(args.summary ?? "").slice(0, 800) || "Done." };
    }
    default: return { text: `Unknown tool "${name}". Tools: ${TOOLS.map((t) => t.name).join(", ")}` };
  }
}

/** Tool calls written as JSON in plain text, for models without native tool calling. */
export function textCalls(content: string): { name: string; args: Record<string, unknown> }[] {
  const t = content.replace(/```(?:json)?/gi, "");
  const out: { name: string; args: Record<string, unknown> }[] = [];
  const tryParse = (j: string) => {
    try {
      const v = JSON.parse(j) as unknown;
      for (const x of Array.isArray(v) ? v : [v]) {
        const o = x as { tool?: unknown; name?: unknown; args?: unknown; arguments?: unknown };
        const name = typeof o?.tool === "string" ? o.tool : typeof o?.name === "string" ? o.name : null;
        if (name) out.push({ name, args: (o.args ?? o.arguments ?? {}) as Record<string, unknown> });
      }
      return true;
    } catch { return false; }
  };
  const a = t.indexOf("["), b = t.lastIndexOf("]");
  if (a >= 0 && b > a && /"tool"|"name"/.test(t.slice(a, b)) && tryParse(t.slice(a, b + 1))) return out;
  const c = t.indexOf("{"), d = t.lastIndexOf("}");
  if (c >= 0 && d > c) tryParse(t.slice(c, d + 1));
  return out;
}

const describeCall = (name: string, args: Record<string, unknown>) => {
  if (name === "write_section") return `write_section(${String(args.label)}, ${String(args.yaml ?? "").length} chars)`;
  if (name === "waive") return `waive(${String(args.id)})`;
  return `${name}(${Object.entries(args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`.slice(0, 60)).join(", ")})`;
};

const PROGRESS: Record<string, (a: Record<string, unknown>) => string> = {
  read_section: (a) => `Reading ${String(a.label)}…`,
  write_section: (a) => `Rewriting ${String(a.label)}…`,
  check: () => "Checking the rules…",
  audit: () => "Auditing what connects…",
  read_reference: (a) => `Reading up on ${String(a.topic)}…`,
  preview: () => "Previewing the start…",
  simulate_encounter: (a) => `Simulating ${String(a.id)}…`,
  waive: (a) => `Leaving ${String(a.id)} as is…`,
  finish: () => "Wrapping up…",
};

/**
 * Work until `finish` is accepted or the step budget runs out.
 * `brief` is what the model knows about the card, the player's wishes and the plan.
 */
export async function runAgent(s: BuilderSession, opts: { brief: string; task: string; maxSteps: number; strict: boolean; hooks: AgentHooks }): Promise<{ finished: boolean; summary: string; steps: number }> {
  const start = evaluate(s.parts);
  const first = [
    opts.brief,
    `Your task: ${opts.task}`,
    `Sections now: ${s.parts.map((p) => `${p.label} (${p.yaml.length} chars)`).join(", ") || "none"}. Sections you can write: ${PART_LABELS.join(", ")}.`,
    start.ruleset ? `Checker: ${issuesText(start.issues)}` : `The ruleset doesn't load yet:\n${issuesText(start.issues)}`,
    start.ruleset ? `Audit — depth ${start.depth}/100:\n${openGaps(s, start.gaps, true).slice(0, 40).map(gapLine).join("\n") || "no gaps"}` : "",
    `Done means: no checker errors, and every audit gap fixed or waived${opts.strict ? " (thin spots too)" : ""}. Then call finish.`,
  ].filter(Boolean).join("\n\n");
  const head: LlmMessageDTO[] = [{ role: "system", content: AGENT_SYSTEM }, { role: "user", content: first }];
  let tail: LlmMessageDTO[] = [];
  let idle = 0;
  for (let step = 1; step <= opts.maxSteps; step++) {
    const res = await opts.hooks.llm([...head, ...tail], TOOLS);
    const calls = res.calls.length ? res.calls : textCalls(res.content);
    if (!calls.length) {
      if (++idle >= 3) break;
      tail.push({ role: "assistant", content: res.content.slice(0, 2000) || "(no reply)" }, { role: "user", content: "Use a tool (natively, or reply with JSON {\"tool\": …, \"args\": …}). If everything is done, call finish." });
      continue;
    }
    idle = 0;
    const results: string[] = [];
    for (const c of calls.slice(0, 6)) {
      await opts.hooks.progress(PROGRESS[c.name]?.(c.args) ?? `${c.name}…`, describeCall(c.name, c.args));
      const out = runTool(s, c.name, c.args ?? {}, opts.strict);
      results.push(`[${describeCall(c.name, c.args)}]\n${out.text}`);
      if (out.finished) return { finished: true, summary: out.finished, steps: step };
    }
    tail.push(
      { role: "assistant", content: `${res.content ? `${res.content.slice(0, 1500)}\n` : ""}Called: ${calls.slice(0, 6).map((c) => describeCall(c.name, c.args)).join("; ")}` },
      { role: "user", content: `Results:\n${results.join("\n\n").slice(0, 12000)}\n\n(Step ${step} of ${opts.maxSteps}.)` },
    );
    // Keep the conversation within reach: the brief, plus the latest exchanges.
    if (tail.length > 16) tail = tail.slice(-16);
  }
  return { finished: false, summary: "", steps: opts.maxSteps };
}
