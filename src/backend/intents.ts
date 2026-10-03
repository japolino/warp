// What a clicked choice means: the line posted as the player's message and the intent the turn resolves.
// Nothing is rolled on the click: the roll happens in the interceptor, under the one reroll rule.

import { availableChoices, findAction, ITEM_PREFIX, LIVE_PREFIX, usableItems, TARGET_SEP, type Intent } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import type { GameState } from "../engine/state.js";
import { BREAK_OFF, CONTEST_PREFIX, GIVE_IN } from "../engine/contest.js";
import type { Settings } from "../shared/protocol.js";
import { contestStats } from "./live.js";
import { liveChoicesOf, type Msg } from "./ledger.js";

export type ChoiceIntent = { say: string; intent: Intent } | { error: string };

/** The contest panel's and choices' exits: Break off (a check) and Give in (an immediate loss). */
export function contestExit(r: Ruleset, state: GameState, op: "break_off" | "give_in"): ChoiceIntent {
  if (!state.contest) return { error: "There's no fight, chase or argument going on." };
  const label = op === "break_off" ? "Break off" : "Give in";
  const kind = r.conflict.kinds[state.contest.kind]?.label.toLowerCase() ?? "contest";
  const say = op === "break_off" ? `*I try to break off the ${kind} and get away.*` : `*I give in.*`;
  return { say, intent: { actionId: op === "break_off" ? BREAK_OFF : GIVE_IN, via: "choice", label } };
}

export function intentFor(r: Ruleset, state: GameState, settings: Settings, msgs: Msg[], actionId: string, params?: Record<string, string>): ChoiceIntent {
  if (actionId === BREAK_OFF) return contestExit(r, state, "break_off");
  if (actionId === GIVE_IN) return contestExit(r, state, "give_in");
  if (actionId.startsWith(LIVE_PREFIX)) {
    // Choices written for the latest reply: the tag decides what happens, the label is what the player saw,
    // and the stored difficulty word (never the client's) sets the target, so the shown odds are the rolled odds.
    const c = liveChoicesOf(msgs[msgs.length - 1])[Number(actionId.slice(LIVE_PREFIX.length))];
    if (!c) return { error: "That choice isn't available anymore." };
    if (c.tag.startsWith(CONTEST_PREFIX)) {
      const stat = c.tag.slice(CONTEST_PREFIX.length);
      if (!state.contest || !contestStats(r, state).includes(stat)) return { error: "That move isn't available anymore." };
      return { say: `*${c.label}*`, intent: { actionId: c.tag, via: "choice", label: c.label } };
    }
    const id = `${LIVE_PREFIX}${c.tag}${c.target ? `${TARGET_SEP}${c.target}` : ""}`;
    const found = findAction(r, state, id);
    if (!found) return { error: "That choice isn't available anymore." };
    const difficulty = c.difficulty && c.difficulty !== "none" && found.a.check ? c.difficulty : null;
    return { say: `*${c.label}*`, intent: { actionId: id, via: "choice", label: c.label, ...(difficulty ? { params: { difficulty } } : {}) } };
  }
  if (actionId.startsWith(ITEM_PREFIX)) {
    const u = usableItems(r, state).find((x) => x.id === actionId);
    if (!u) return { error: "You don't have that anymore." };
    if (u.locked) return { error: u.locked };
    const name = r.items[actionId.slice(ITEM_PREFIX.length)]?.name ?? "it";
    return { say: u.a.say ?? `*I use the ${name}.*`, intent: { actionId, ...(params ? { params } : {}), via: "choice", label: u.a.label } };
  }
  const c = availableChoices(r, state, settings.lines).find((x) => x.id === actionId);
  if (!c) return { error: "That choice isn't available anymore." };
  const who = c.target ? state.people[c.target]?.name ?? c.target : "";
  // An authored action's own params (its option buttons) ride on the intent; the engine validates them.
  const known = new Set(c.a.params.map((p) => p.id));
  const explicit = Object.fromEntries(Object.entries(params ?? {}).filter(([k, v]) => known.has(k) && typeof v === "string"));
  return { say: c.a.say ? c.a.say.replace(/\{\{target\}\}|\{target\}/gi, who) : `*${c.label}*`, intent: { actionId, ...(Object.keys(explicit).length ? { params: explicit } : {}), via: "choice" } };
}
