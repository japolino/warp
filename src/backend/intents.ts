// What a clicked choice means: the line posted as the player's message and the
// intent the turn resolves. Shared by clicking and by pre-writing replies.

import { availableChoices, canExplore, EXPLORE, LIVE_PREFIX, RUN_EPILOGUE, TARGET_SEP, TRAVEL_PREFIX, travelTargets, type Intent } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import type { GameState } from "../engine/state.js";
import { dateMoves } from "../engine/date/talk.js";
import { DATE_PREFIX } from "../engine/date/types.js";
import { JOB_PREFIX, PAY_PREFIX, workMoves } from "../engine/work.js";
import type { Settings } from "../shared/protocol.js";
import { liveChoicesOf, type Msg } from "./ledger.js";

export type ChoiceIntent = { say: string; intent: Intent } | { error: string };

export function intentFor(r: Ruleset, state: GameState, settings: Settings, msgs: Msg[], actionId: string, params?: Record<string, string>): ChoiceIntent {
  if (actionId === EXPLORE) {
    if (!canExplore(r, state)) return { error: "There's nowhere new to find here." };
    return { say: "*I explore around, looking for somewhere I haven't been.*", intent: { actionId: EXPLORE, via: "choice", label: "Explore" } };
  }
  if (actionId === RUN_EPILOGUE) {
    if (!state.ended || state.ended.told) return { error: "" };
    return { say: "*The end.*", intent: { actionId: RUN_EPILOGUE, via: "choice", label: "The ending" } };
  }
  if (actionId.startsWith(LIVE_PREFIX)) {
    // Choices written for the latest reply: the tag decides what happens, the label is what the player saw.
    const c = liveChoicesOf(msgs[msgs.length - 1])[Number(actionId.slice(LIVE_PREFIX.length))];
    if (!c || !r.liveChoices.tags[c.tag]) return { error: "That choice isn't available anymore." };
    return { say: `*${c.label}*`, intent: { actionId: `${LIVE_PREFIX}${c.tag}${c.target ? `${TARGET_SEP}${c.target}` : ""}`, via: "choice", label: c.label } };
  }
  if (actionId.startsWith(PAY_PREFIX) || actionId.startsWith(JOB_PREFIX)) {
    const m = workMoves(r, state).find((x) => x.id === actionId);
    if (!m) return { error: "That isn't possible right now." };
    return { say: m.say, intent: { actionId: m.id, via: "choice", label: m.label } };
  }
  if (actionId.startsWith(DATE_PREFIX)) {
    const m = dateMoves(r, state, settings.lines).find((x) => x.id === actionId);
    if (!m) return { error: "That isn't possible right now." };
    return { say: m.say, intent: { actionId: m.id, via: "choice", label: m.label } };
  }
  if (actionId.startsWith(TRAVEL_PREFIX)) {
    const to = actionId.slice(TRAVEL_PREFIX.length);
    if (!travelTargets(r, state).includes(to)) return { error: "You can't get there from here." };
    return { say: `*I head to ${r.locations[to].name}.*`, intent: { actionId, params, via: "choice" } };
  }
  const c = availableChoices(r, state, settings.lines).find((x) => x.id === actionId);
  if (!c) return { error: "That choice isn't available anymore." };
  const who = c.target ? state.people[c.target]?.name ?? c.target : "";
  return { say: c.a.say ? c.a.say.replace(/\{\{target\}\}|\{target\}/gi, who) : `*${c.label}*`, intent: { actionId, params, via: "choice" } };
}
