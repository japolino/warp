// Finding and merging a ruleset from lorebook text.
//
// A ruleset is any of:
//   • every entry in a lorebook named "warp-ruleset"
//   • any entry whose title (comment) starts with "warp-ruleset"
//     (also "[Book] warp-ruleset …", which is how merged card exports label entries)
// Each entry holds YAML; entries are deep-merged in order, so authors can split
// stats, actions, rules… across entries.

import yaml from "js-yaml";
import { normalizeRuleset, type Issue, type Ruleset } from "./ruleset.js";

const ENTRY_RE = /^\s*(?:\[[^\]]*\]\s*)?warp[-_ ]?ruleset\b/i;
const BOOK_RE = /^\s*warp[-_ ]?ruleset\b/i;

export function isRulesetEntryTitle(comment: string | undefined | null): boolean {
  return !!comment && ENTRY_RE.test(comment);
}

export function isRulesetBookName(name: string | undefined | null): boolean {
  return !!name && BOOK_RE.test(name);
}

export interface RulesetPart {
  /** Where this text came from, for error messages ("warp-ruleset · stats"). */
  label: string;
  content: string;
  order: number;
}

function stripFences(s: string): string {
  const m = /^\s*```[a-z]*\s*\n([\s\S]*?)\n?```\s*$/i.exec(s);
  return m ? m[1] : s;
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

export function deepMerge(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (isObj(a) && isObj(b)) {
    const out: Raw = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in out ? deepMerge(out[k], v) : v;
    return out;
  }
  // `dating: true` after a `dating: { … }` block means "on", not "forget the block".
  if (isObj(a) && b === true) return a;
  return b === undefined ? a : b;
}

export interface LoadResult {
  ruleset: Ruleset | null;
  issues: Issue[];
}

export function loadRuleset(parts: RulesetPart[]): LoadResult {
  const issues: Issue[] = [];
  let merged: unknown = {};
  const sorted = [...parts].sort((x, y) => x.order - y.order || x.label.localeCompare(y.label));
  for (const p of sorted) {
    const text = stripFences(p.content ?? "");
    if (!text.trim()) continue;
    try {
      const doc = yaml.load(text, { schema: yaml.CORE_SCHEMA });
      if (doc === null || doc === undefined) continue;
      if (!isObj(doc)) {
        issues.push({ level: "error", where: p.label, message: "should be YAML key/value pairs (like `stats:`), not a list or plain text" });
        continue;
      }
      merged = deepMerge(merged, doc);
    } catch (e) {
      const err = e as { mark?: { line: number; column: number }; reason?: string; message?: string };
      const where = err.mark ? `${p.label}, line ${err.mark.line + 1}` : p.label;
      issues.push({ level: "error", where, message: `YAML couldn't be read: ${err.reason ?? err.message ?? "syntax error"}. This entry was skipped.` });
    }
  }
  if (!parts.length) return { ruleset: null, issues };
  const { ruleset, issues: more } = normalizeRuleset(merged);
  return { ruleset, issues: [...issues, ...more] };
}
