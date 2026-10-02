// Keep an arcade result tied to the exact choice set the player opted into.
import type { ChoiceView } from "../../shared/protocol.js";

export function playableChoice(choices: ChoiceView[], actionId: string): ChoiceView | undefined {
  return choices.find((c) => c.id === actionId && !c.locked && (c.game || c.gamble));
}

export function acceptsArcadeResult(snapshot: unknown, current: unknown, startedChat: string, activeChat: string | null, busy: boolean): boolean {
  return snapshot === current && startedChat === activeChat && !busy;
}

/** "always" is explicit consent; default "ask" never opens the arcade on an action click. */
export function automaticChallenge(mode: "ask" | "always" | "off", choice: ChoiceView | undefined): boolean {
  return mode === "always" && !!choice && !choice.locked && !!(choice.game || choice.gamble);
}
