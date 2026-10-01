import type { DecideSpec } from "../engine/ruleset.js";
import type { Resolution } from "../engine/resolve.js";
import { withDeadline } from "./deadline.js";
import { normalize } from "../engine/decide.js";

/** Discover questions reached by accepted answers, resolving every pass with the same seed. */
export async function resolveWithDecisions(opts: {
  resolve: (odds: Record<string, Record<string, number>>) => Resolution;
  ask?: (specs: DecideSpec[], remainingMs: number, signal: AbortSignal) => Promise<Record<string, Record<string, number>>>;
  deadlineAt: number; signal?: AbortSignal;
  accepted?: Record<string, Record<string, number>>;
}): Promise<Resolution> {
  const accepted = structuredClone(opts.accepted ?? {}), attempted = new Set(Object.keys(accepted));
  let res = opts.resolve(accepted), reason = opts.ask ? "No usable provider answer" : "Rules-only provider";
  for (let round = 0; opts.ask && round < 8; round++) {
    const specs = res.needs.filter((n) => !attempted.has(n.id)).slice(0, 64);
    if (!specs.length) break;
    const remaining = opts.deadlineAt - Date.now();
    if (remaining <= 0 || opts.signal?.aborted) { reason = opts.signal?.aborted ? "Cancelled" : "Decision deadline exceeded"; break; }
    specs.forEach((n) => attempted.add(n.id));
    let answers: Record<string, Record<string, number>> = {};
    try { answers = await withDeadline({ deadlineAt: opts.deadlineAt, signal: opts.signal }, remaining, (signal, left) => opts.ask!(specs, left(), signal)); } catch { /* Explicit weighted fallback below. */ }
    if (opts.signal?.aborted || Date.now() > opts.deadlineAt) { reason = "Decision deadline exceeded or cancelled"; break; }
    for (const spec of specs) {
      const p = answers[spec.id], keys = spec.options.map((o) => o.id);
      if (!p || Object.entries(p).some(([k, v]) => !keys.includes(k) || !Number.isFinite(v) || v < 0 || v > 1) || !Object.values(p).some((v) => v > 0)) continue;
      accepted[spec.id] = normalize(p, keys);
    }
    res = opts.resolve(accepted);
    if (round === 7) reason = "Decision round limit reached";
  }
  for (const decision of res.record.decisions ?? []) if (decision.source === "weights") decision.fallback = reason;
  return res;
}
