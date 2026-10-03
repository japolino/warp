// A whole rulebook as one file, for writing it with other tools: split into the
// sections Warp keeps as lorebook entries, and joined back for export. Splitting
// is textual, so comments and formatting survive the round trip.

import { PART_LABELS } from "./reference.js";

/**
 * Which section each top-level key of format 2 belongs in (CORE-DESIGN §1.1): core, stats, people, world, actions,
 * story, conflict. Anything else (an unknown or removed key) goes to core, where the checker flags it.
 */
export const PART_OF_KEY: Record<string, string> = {
  name: "core", description: "core", style: "core", clock: "core", start: "core", hud: "core", narration: "core",
  stats: "stats", growth: "stats", practice: "stats", checks: "stats", improvise: "stats", improvised: "stats",
  relationships: "people", people: "people", you: "people", player: "people",
  items: "world", inventory: "world", conditions: "world", flags: "world",
  actions: "actions",
  secrets: "story", live_choices: "story", goals: "story", triggers: "story", rules: "story",
  conflict: "conflict",
};

export interface RulebookPart { label: string; yaml: string }

const DOC_HEAD = /^---[ \t]*(?:#[ \t]*(?:warp-ruleset[ \t]*·[ \t]*)?([\w -]+?))?[ \t]*$/;

/**
 * One file → sections. Documents headed `--- # stats` keep their label (that's what export
 * writes); a plain file is cut at its top-level keys and grouped by where each key belongs.
 */
export function splitRulebook(text: string): RulebookPart[] {
  const src = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const lines = src.split("\n");
  // Labelled documents, as written by export.
  if (lines.some((l) => DOC_HEAD.test(l) && /#/.test(l))) {
    const out: RulebookPart[] = [];
    let label: string | null = null;
    let buf: string[] = [];
    const flush = () => {
      const yaml = buf.join("\n").trim();
      if (yaml && !/^(#.*\n?)*$/.test(yaml)) {
        const l = (label ?? "core").trim().toLowerCase();
        for (const p of splitPlain(yaml, l, true)) merge(out, p);
      }
      buf = [];
    };
    for (const l of lines) {
      const m = DOC_HEAD.exec(l);
      if (m) { flush(); label = m[1] ?? null; continue; }
      buf.push(l);
    }
    flush();
    // Exported sections keep the order they were written in.
    return out.map((p) => ({ ...p, yaml: `${p.yaml.trim()}
` }));
  }
  return order(splitPlain(src.replace(/^---[ \t]*\n/, ""), null));
}

/** Cut a plain YAML file at its top-level keys; comments just above a key travel with it. `keep`: everything stays under `label`. */
function splitPlain(src: string, label: string | null, keep = false): RulebookPart[] {
  const known = keep && !!label;
  const lines = src.split("\n");
  const out: RulebookPart[] = [];
  let cur: { label: string; lines: string[] } | null = null;
  let pending: string[] = [];
  for (const l of lines) {
    const key = /^([A-Za-z_][\w]*)\s*:/.exec(l)?.[1];
    if (key) {
      // A section label from export wins (its keys stay together); otherwise the key decides.
      const to = known ? label! : PART_OF_KEY[key] ?? label ?? "core";
      if (cur) merge(out, { label: cur.label, yaml: cur.lines.join("\n") });
      cur = { label: to, lines: [...pending, l] };
      pending = [];
    } else if (!l.trim() || /^#/.test(l) || !cur) {
      // Blank lines and comments at the margin wait: they belong with whatever comes next.
      pending.push(l);
    } else {
      cur.lines.push(...pending, l);
      pending = [];
    }
  }
  if (cur) merge(out, { label: cur.label, yaml: [...cur.lines, ...pending].join("\n") });
  return out;
}

function merge(out: RulebookPart[], p: RulebookPart) {
  const yaml = p.yaml.replace(/\s+$/, "");
  if (!yaml.trim()) return;
  const hit = out.find((x) => x.label === p.label);
  if (hit) hit.yaml = `${hit.yaml}\n${yaml}`;
  else out.push({ label: p.label, yaml });
}

/** Sections in the order Warp lists them; unknown labels last. */
function order(parts: RulebookPart[]): RulebookPart[] {
  // The sections in the order of format 2 (labels the reference doesn't list yet go by this order too).
  const ORDER = ["core", "stats", "people", "world", "actions", "story", "conflict"];
  const rank = (l: string) => { const i = ORDER.indexOf(l); const j = (PART_LABELS as readonly string[]).indexOf(l); return i >= 0 ? i : j >= 0 ? 50 + j : 99; };
  return parts.map((p) => ({ ...p, yaml: `${p.yaml.trim()}\n` })).sort((a, b) => rank(a.label) - rank(b.label));
}

/** Sections → one file: each a document headed `--- # label`, so importing it puts everything back where it was. */
export function joinRulebook(parts: RulebookPart[], title: string): string {
  const head = [
    `# Warp rulebook — ${title}`,
    "# Each document below is one section of the ruleset (a lorebook entry named \"warp-ruleset · <section>\").",
    "# Edit it anywhere, then import it back: Warp → Ruleset → Import a rulebook.",
  ].join("\n");
  return `${head}\n${parts.map((p) => `--- # ${p.label}\n${p.yaml.trim()}\n`).join("\n")}`;
}
