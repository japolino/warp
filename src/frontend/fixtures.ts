// Hand-built `state` messages that follow the contract, for the UI tests (no engine, no templates).

import type { BackendToFrontend, ChoiceView, HudView, PersonView, RecordView } from "../shared/protocol.js";

export type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

export const person = (o: Partial<PersonView> & { id: string; name: string }): PersonView => ({
  stats: [], present: false, conditions: [], memories: [], appearance: null, outfit: null, actions: [], ...o,
});

export const choice = (o: Partial<ChoiceView> & { id: string; label: string }): ChoiceView => ({
  group: null, desc: null, odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [], difficulty: null, ...o,
});

/** Day 2, 23:40 at a harbour bar, Mira here, Jo elsewhere. */
export function hud(o: Partial<HudView> = {}): HudView {
  const base: HudView = {
    rulesetName: "Adventure",
    clock: { label: "Day 2 · 23:40", time: "23:40", day: "Day 2", phase: "night", minutes: 1440 + 23 * 60 + 40 },
    date: null,
    location: { name: "The Rusty Anchor" },
    money: "$50",
    bars: [{ id: "health", label: "Health", value: 80, min: 0, max: 100, display: "80/100", pct: 0.8, text: "Fine", tone: "good", good: "high" }],
    skills: [{ id: "body", label: "Body", value: 3, min: 0, max: 10, display: "3", grade: null, pct: 0.3, kind: "attribute", text: null, tone: "neutral", practice: 0.4, group: "Attributes" }],
    you: { appearance: "short, scar over one eye", outfit: "rain-soaked coat" },
    wereWithYou: [],
    people: [
      person({
        id: "mira", name: "Mira", present: true, appearance: "tall, red braid, freckles", outfit: "green apron over a black shirt",
        stats: [{ id: "trust", label: "Trust", value: 42, min: 0, max: 100, display: "42", pct: 0.42, text: "Open", tone: "good" }],
        memories: [{ text: "You paid for her drink", when: "Day 2" }],
        actions: [choice({ id: "talk:mira", label: "Talk to Mira", odds: 0.6, checkLabel: "Charm" })],
      }),
      person({ id: "jo", name: "Jo", present: false, stats: [{ id: "trust", label: "Trust", value: 20, min: 0, max: 100, display: "20", pct: 0.2, text: "Wary", tone: "warn" }] }),
    ],
    items: [{ id: "rope", name: "Rope", count: 2, uses: null, use: null, bonus: null }],
    conditions: [],
    goals: [
      { id: "g1", text: "Get Mira's brother out of jail", status: "open", from: "Mira", stakes: "He hangs at dawn" },
      { id: "g0", text: "Find a room for the night", status: "done", from: null, stakes: null },
    ],
    conflict: null,
    turn: 7,
  };
  return { ...base, ...o };
}

export const record = (o: Partial<RecordView> & { messageId: string }): RecordView => ({
  swipe: 0, clock: "Day 2 · 23:40", action: null, via: null, check: null, lines: [], contest: null, changes: [], hints: [], veiled: false,
  confidence: null, decisions: [], redoFrom: null, ...o,
});

/** A d20 check: 14 + 3 = 17 vs 12. */
export const check = (o: Partial<NonNullable<RecordView["check"]>> = {}): NonNullable<RecordView["check"]> => ({
  label: "Body", dice: "d20", faces: [{ sides: 20, value: 14, kept: true }], roll: 14, add: 3, total: 17, target: 12, style: "vs",
  tier: "success", tierLabel: "Success", summary: "d20 14 + 3 = 17 vs 12 (fair)", ...o,
});

export function stateMsg(o: Partial<StateMsg> = {}): StateMsg {
  return {
    type: "state", chatId: "c1", revision: 1,
    status: { state: "ok", name: "Adventure", source: "warp-ruleset", issues: [], characterName: "Mira", cardKind: "character", tags: [], style: "adventure", template: "adventure" },
    hud: hud(), choices: [], records: [], latestMessageId: "m2", choicesAnchor: "m2", busy: false, player: "Sam",
    ...o,
  };
}

/** Text without tags, spaces folded. */
export const text = (html: string) => html.replace(/<[^>]+>/g, " ")
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
