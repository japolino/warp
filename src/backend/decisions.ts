// Running typed questions: the one place that calls a decider, and the call meter (JEV-ROUTING §6.4).
// Every model call a turn makes is counted, so tests and the simulator can hold the budget:
// narrator + at most 1 helper call per ordinary turn (the one exception: a typed attempt without Jev).

import type { Answers, Decider, Questions } from "../engine/decide.js";
import { logError } from "./host.js";

/** Model calls a turn cost: helper LLM calls and Jev calls. */
export interface CallMeter { helper: number; jev: number }

export const newMeter = (): CallMeter => ({ helper: 0, jev: 0 });

export function addCalls(a: CallMeter | undefined, b: CallMeter | undefined): CallMeter {
  return { helper: (a?.helper ?? 0) + (b?.helper ?? 0), jev: (a?.jev ?? 0) + (b?.jev ?? 0) };
}

/** Count one call on the right side of the meter. */
export function count(meter: CallMeter | undefined, who: "helper" | "jev" | Decider["id"]): void {
  if (!meter) return;
  if (who === "jev") meter.jev++;
  else meter.helper++;
}

/**
 * Ask a batch of typed questions. Never throws: on failure `ok` is false and the answers are empty (every
 * interpreter then reads its safe default). An empty batch costs nothing and is not counted.
 */
export async function safeAsk(d: Decider, state: unknown, q: Questions, timeoutMs: number, what: string, meter?: CallMeter): Promise<{ answers: Answers; ok: boolean }> {
  if (!Object.keys(q).length) return { answers: {}, ok: true };
  count(meter, d.id);
  try {
    const answers = await (d.ask as (s: unknown, q: Questions, o: { timeoutMs: number }) => Promise<Answers>)(state, q, { timeoutMs });
    return { answers: answers ?? {}, ok: true };
  } catch (e) {
    logError(`${what} (${d.id})`, e);
    return { answers: {}, ok: false };
  }
}
