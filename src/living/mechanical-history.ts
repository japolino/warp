import type { Msg } from "../backend/ledger.js";
import { revision } from "../shared/revision.js";
import { pathOf, pathsOf } from "./world.js";
import { applyObservations, commitMechanical, emptyMechanics, readMechanicalObservations, type MechanicalRecord, type MechanicalState } from "./mechanics.js";

export const MECHANICS_KEY = "warpMechanics";
export function mechanicalRecordOf(m: Msg): MechanicalRecord | undefined {
  const record = (m.metadata?.[MECHANICS_KEY] as Record<string, MechanicalRecord> | undefined)?.[String(m.swipe_id ?? 0)];
  if (record?.version !== 1 || typeof record.path !== "string" || typeof record.text !== "string" || !Array.isArray(record.observations)) return;
  return record;
}

/** Project only the active branch. A changed causal path cannot retain inferred balances. */
export function foldMechanics(messages: Msg[]): MechanicalState {
  let state = emptyMechanics(), prefix = pathOf([]);
  const paths = pathsOf(messages);
  for (const [index, message] of messages.entries()) {
    const record = mechanicalRecordOf(message);
    if (record) {
      if (record.path !== prefix || record.text !== revision(message.content)) {
        // Keeping the old pre-spend value would turn an edit into free inventory.
        state = emptyMechanics();
      } else {
        if (record.receipt) {
          try { state = commitMechanical(state, record.receipt); }
          catch { state = emptyMechanics(); }
        }
        // Revalidate persisted evidence, including corrections, without asking a model.
        const raw = record.observations.flatMap<Record<string, unknown>>(o => {
          if (!o || typeof o !== "object") return [];
          if (o.kind === "condition_end") return [{ kind: o.kind, id: o.id, ...o.source }];
          if (!o.value?.source) return [];
          return [{ kind: o.kind, ...o.value, ...o.value.source }];
        });
        state = applyObservations(state, readMechanicalObservations(raw, state, messages.slice(0, index + 1)));
      }
    }
    prefix = paths.get(message.id)!;
  }
  return state;
}
