// The builder's card read (CORE-DESIGN §5.3 step 4, JEV-ROUTING §4.7). The classification half (Story or
// Adventure, one character or a scenario, a status block, a romance) is a set of typed questions: Jev answers them
// when it is set, else the helper answers them inside its one card-read call. The writing half (summary, cast,
// follow-up questions) is always the helper's. Pure: no host, no network.

import type { Answers, Questions } from "../engine/decide.js";
import type { BuilderQuestion } from "../shared/protocol.js";

export type Style = "story" | "adventure";

/** What the classification decides about a card. */
export interface CardClass { style: Style; cardType: "character" | "scenario"; statusBlock: boolean; romance: boolean }

/** A cast member as the read gives them: name, how they start toward {{user}}, and what the card states. */
export interface CastMember { name: string; relation: string; age?: number; appearance?: string; outfit?: string }

/** Everything the card read gives the builder. */
export interface CardRead extends CardClass {
  summary: string;
  /** Why that style fits (helper only). */
  reason: string;
  /** What the card's status block tracks, when it has one. */
  statusFields: string[];
  cast: CastMember[];
  followUps: BuilderQuestion[];
}

/**
 * The typed questions (JEV-ROUTING §3: the safe default is the first option; one judgment per question).
 * Adventure comes first: where one default is unavoidable it is Adventure, rolling only at risky moments.
 */
export function cardQuestions(): Questions {
  return {
    template: {
      type: "choice",
      instructions: "Which kind of game fits this character card?",
      criteria: {
        adventure: "Adventure: danger, action, fights, chases, schemes or risky goals are part of the story",
        story: "Story: relationships, romance, drama or slice of life, with little danger or action",
      },
    },
    card_type: {
      type: "choice",
      instructions: "Is the card one character, or a scenario, narrator or world card?",
      criteria: {
        character: "One character: the card's name is a person",
        scenario: "A scenario, narrator or world card: its name is a setting or premise, or it voices many characters",
      },
    },
    status_block: { type: "noul", instructions: "The card tells the model to print a status block, stat block or tracker in its replies." },
    romance: { type: "noul", instructions: "Romance or attraction between {{user}} and a character is a main theme of the card." },
  };
}

/** The answers as a classification. A missing answer is the first option, or no. */
export function cardVerdict(a: Answers): CardClass {
  const choice = (id: string) => { const x = a[id]; return x?.type === "choice" ? x.choice : undefined; };
  const yes = (id: string) => { const x = a[id]; return x?.type === "noul" && x.noul >= 0.5; };
  return {
    style: choice("template") === "story" ? "story" : "adventure",
    cardType: choice("card_type") === "scenario" ? "scenario" : "character",
    statusBlock: yes("status_block"),
    romance: yes("romance"),
  };
}

/** The helper's card-read prompt. With Jev (`classify: false`) it only writes; without, it also classifies. */
export function cardPrompt(card: string, classify: boolean): { system: string; user: string } {
  const fields = [
    '{"summary": "2-3 sentences: who this is, the setting, the likely kind of story",',
    ...(classify ? [
      ' "style": "adventure" if danger, action, fights, chases or risky goals are part of the story, "story" if it is about relationships, romance, drama or slice of life,',
      ' "reason": "one sentence: why that style fits",',
      ' "cardType": "character" if the card IS one character, "scenario" if it is a narrator / world / multi-character card,',
      ' "romance": true if romance or attraction with the player is a main theme,',
      ' "statusBlock": {"found": <does the card tell the model to print a status block?>, "fields": ["<what it tracks>"]},',
    ] : [
      ' "statusFields": ["<what the card\'s status block tracks, if it tells the model to print one; else empty>"],',
    ]),
    ' "cast": [ the main named characters (for a character card, the character first), each {"name": "Aina", "relation": "how they feel about {{user}} at the start", "age": <only if the card states it>, "appearance": "<only if stated, under 20 words>", "outfit": "<only if stated, under 20 words>"} ],',
    ' "followUps": [ up to 3 short questions specific to THIS card that change how its game is themed, e.g. {"text": "Aina hides her past. Make it a secret that opens as she trusts you?", "kind": "single", "options": ["Yes", "No"], "why": "The description hints at it"} ]}',
  ];
  return {
    system: "You help fit a game ruleset to a roleplay character card. Reply with JSON only.",
    user: `${card}\n\nReply with JSON:\n${fields.join("\n")}`,
  };
}

const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Normalise model-written follow-up questions (at most 3). */
export function normQuestions(raw: unknown, prefix: string, max = 3): BuilderQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: BuilderQuestion[] = [];
  for (const q of raw) {
    if (out.length >= max) break;
    if (!q || typeof q !== "object") continue;
    const r = q as Record<string, unknown>;
    const t = text(r.text ?? r.question, 300);
    if (!t) continue;
    const kind = (["single", "multi", "text"] as const).find((k) => k === r.kind) ?? (Array.isArray(r.options) ? "single" : "text");
    const options = Array.isArray(r.options)
      ? r.options.slice(0, 6).map((o, j) => (typeof o === "string" ? { id: `o${j}`, label: o.slice(0, 80) } : { id: String((o as Record<string, unknown>).id ?? `o${j}`), label: String((o as Record<string, unknown>).label ?? (o as Record<string, unknown>).text ?? `Option ${j + 1}`).slice(0, 80) }))
      : undefined;
    out.push({ id: `${prefix}${out.length}`, text: t, kind: kind === "multi" || kind === "single" ? (options?.length ? kind : "text") : "text", ...(options?.length ? { options } : {}), ...(typeof r.why === "string" ? { why: r.why.slice(0, 200) } : {}) });
  }
  return out;
}

/** The helper's JSON as a card read; `cls` = Jev's classification (null: the helper classified). */
export function readCard(out: Record<string, unknown>, cls: CardClass | null, fallbackName: string): CardRead {
  const sb = out.statusBlock as { found?: unknown; fields?: unknown } | undefined;
  const strings = (v: unknown) => (Array.isArray(v) ? v.map((x) => text(x, 60)).filter(Boolean).slice(0, 12) : []);
  const cast: CastMember[] = Array.isArray(out.cast) ? out.cast.slice(0, 8).flatMap((c) => {
    const r = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const name = text(r.name, 60);
    if (!name) return [];
    const age = Number(r.age);
    return [{ name, relation: text(r.relation, 200), ...(Number.isFinite(age) && age > 0 ? { age: Math.round(age) } : {}), ...(text(r.appearance, 160) ? { appearance: text(r.appearance, 160) } : {}), ...(text(r.outfit, 160) ? { outfit: text(r.outfit, 160) } : {}) }];
  }) : [];
  const own: CardClass = {
    style: out.style === "story" ? "story" : "adventure",
    cardType: out.cardType === "scenario" ? "scenario" : "character",
    statusBlock: sb?.found === true,
    romance: out.romance === true,
  };
  const c = cls ?? own;
  return {
    ...c,
    summary: text(out.summary, 800) || `${fallbackName}.`,
    reason: cls ? "" : text(out.reason, 300),
    statusFields: c.statusBlock ? (cls ? strings(out.statusFields) : strings(sb?.fields)) : [],
    cast,
    followUps: normQuestions(out.followUps, "f1_"),
  };
}

/** The three questions every card gets (CORE-DESIGN §5.3), after the Story / Adventure switch. */
export function coreQuestions(style: Style, reason: string): BuilderQuestion[] {
  return [
    { id: "style", core: true, kind: "single", text: "Story or Adventure?", default: style,
      ...(reason ? { why: reason } : {}),
      options: [{ id: "story", label: "📖 Story (no dice)" }, { id: "adventure", label: "🎲 Adventure (dice)" }] },
    { id: "tone", core: true, kind: "single", text: "What tone should it have?", default: "dramatic",
      options: ["cozy", "dramatic", "dark", "playful", "romantic", "gritty"].map((t) => ({ id: t, label: t[0].toUpperCase() + t.slice(1) })) },
    { id: "difficulty", core: true, kind: "scale", text: "How hard should risky moves be?", default: 3, why: "Adventure only: Story rulesets don't roll.",
      options: [{ id: "1", label: "Forgiving" }, { id: "3", label: "Fair" }, { id: "5", label: "Punishing" }] },
    { id: "pace", core: true, kind: "single", text: "How fast should relationships move?", default: "slow",
      options: [{ id: "slow", label: "Slow burn" }, { id: "steady", label: "Steady" }, { id: "fast", label: "Quick" }] },
  ];
}
