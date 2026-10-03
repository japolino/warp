// What a clicked choice means: the line posted as the player's message and the
// intent the turn resolves. Shared by clicking and by pre-writing replies.

import { cleanLiveForecast, ABILITY_PREFIX, availableChoices, canExplore, EXPLORE, findAction, ITEM_PREFIX, LIVE_PREFIX, usableAbilities, usableItems, lockedExits, RUN_EPILOGUE, TARGET_SEP, TRAVEL_PREFIX, travelTargets, type Intent } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import type { GameState } from "../engine/state.js";
import { JOB_PREFIX, PAY_PREFIX, workMoves } from "../engine/work.js";
import { QUEST_PREFIX, questDef, questOffers, questsToReport } from "../engine/quests.js";
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
    const found = c ? findAction(r, state, `${LIVE_PREFIX}${c.tag}${c.target ? `${TARGET_SEP}${c.target}` : ""}`) : null;
    if (!c || !found) return { error: "That choice isn't available anymore." };
    const forecast = cleanLiveForecast(c.forecast);
    // Explicit choices (the tag's own params, a chosen mind resistance) ride on the intent; the engine validates them.
    const known = new Set(["mind_resist", ...found.a.params.map((p) => p.id)]);
    const explicit = Object.fromEntries(Object.entries(params ?? {}).filter(([k, v]) => known.has(k) && typeof v === "string"));
    return { say: `*${c.label}*`, intent: { ...(forecast ? { forecast } : {}), actionId: `${LIVE_PREFIX}${c.tag}${c.target ? `${TARGET_SEP}${c.target}` : ""}`, ...(Object.keys(explicit).length ? { params: explicit } : {}), via: "choice", label: c.label } };
  }
  if (actionId.startsWith(PAY_PREFIX) || actionId.startsWith(JOB_PREFIX)) {
    const m = workMoves(r, state).find((x) => x.id === actionId);
    if (!m) return { error: "That isn't possible right now." };
    return { say: m.say, intent: { actionId: m.id, via: "choice", label: m.label } };
  }
  if (actionId.startsWith(TRAVEL_PREFIX)) {
    const to = actionId.slice(TRAVEL_PREFIX.length);
    if (!travelTargets(r, state).includes(to)) {
      const shut = lockedExits(r, state).find((x) => x.id === to);
      return { error: shut ? `${r.locations[to].name} is locked: ${shut.locked}` : "You can't get there from here." };
    }
    return { say: `*I head to ${r.locations[to].name}.*`, intent: { actionId, params, via: "choice" } };
  }
  if (actionId.startsWith(ITEM_PREFIX)) {
    const u = usableItems(r, state).find((x) => x.id === actionId);
    if (!u) return { error: "You don't have that anymore." };
    if (u.locked) return { error: u.locked };
    const name = r.items[actionId.slice(ITEM_PREFIX.length)]?.name ?? "it";
    return { say: u.a.say ?? `*I use the ${name}.*`, intent: { actionId, params, via: "choice", label: u.a.label } };
  }
  if (actionId.startsWith(QUEST_PREFIX)) {
    // Taking a quest, handing one in, giving one up: what the player says depends on who's asking.
    const [, verb, id] = actionId.split(":");
    const q = questDef(r, state, id ?? "");
    if (!q) return { error: "That quest isn't here anymore." };
    const giver = q.giver ? state.people[q.giver]?.name ?? r.people[q.giver]?.name ?? null : null;
    if (verb === "take") {
      const o = questOffers(r, state).find((x) => x.id === id);
      if (!o) return { error: "That isn't on offer here." };
      return { say: o.via === "giver" && giver ? `*I tell ${giver} I'll do it: ${q.name.toLowerCase()}.*` : o.via === "board" ? `*I take the notice down: "${q.name}".*` : `*I take on "${q.name}".*`, intent: { actionId, via: "choice", label: `Take on "${q.name}"` } };
    }
    if (verb === "report") {
      const to = questsToReport(r, state).find((x) => x.id === id);
      if (!to) return { error: "There's nobody to hand that in to here." };
      return { say: to.to ? `*I tell ${to.to} it's done.*` : `*I hand in "${q.name}".*`, intent: { actionId, via: "choice", label: `Hand in "${q.name}"` } };
    }
    if (verb === "drop") {
      const st = state.quests?.[id ?? ""]?.st;
      if (st !== "active" && st !== "ready") return { error: "That quest isn't under way." };
      return { say: `*I give up on ${q.name.toLowerCase()}.*`, intent: { actionId, via: "choice", label: `Give up on "${q.name}"` } };
    }
    return { error: "That isn't possible right now." };
  }
  if (actionId.startsWith(ABILITY_PREFIX)) {
    const u = usableAbilities(r, state).find((x) => x.id === actionId);
    if (!u) return { error: "You can't use that here." };
    if (u.status.locked) return { error: u.status.locked };
    return { say: u.a.say ?? `*${u.a.label}.*`, intent: { actionId, params, via: "choice", label: u.a.label } };
  }
  const c = availableChoices(r, state, settings.lines).find((x) => x.id === actionId);
  if (!c) return { error: "That choice isn't available anymore." };
  const who = c.target ? state.people[c.target]?.name ?? c.target : "";
  return { say: c.a.say ? c.a.say.replace(/\{\{target\}\}|\{target\}/gi, who) : `*${c.label}*`, intent: { actionId, params, via: "choice" } };
}
