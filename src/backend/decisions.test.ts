import { describe, expect, test } from "bun:test";
import type { Answers, Decider, Questions } from "../engine/decide.js";
import { loadRuleset } from "../engine/loader.js";
import { normalizeRuleset } from "../engine/ruleset.js";
import { resolveTurnFull } from "../engine/resolve.js";
import { foldEvents, initialState } from "../engine/state.js";
import { TEMPLATES } from "../engine/templates/index.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { JevDecider, RulesDecider } from "./deciders.js";
import { bookkeeping, readTurn } from "./decisions.js";

/** A decider that answers from a script and records what it was asked. */
class Scripted implements Decider {
  readonly id = "jev" as const;
  readonly canWrite = false;
  asked: Questions[] = [];
  constructor(private fn: (q: Questions) => Answers) {}
  async ask(_state: unknown, q: Questions) { this.asked.push(q); return this.fn(q); }
}

const hometown = () => loadRuleset(TEMPLATES.find((t) => t.id === "hometown")!.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i }))).ruleset!;
const choice = (c: string, conf: number, keys: string[]) => ({
  type: "choice" as const, choice: c, confidence: conf,
  probabilities: Object.fromEntries(keys.map((k) => [k, k === c ? conf : (1 - conf) / (keys.length - 1)])),
});

describe("reading the player's turn", () => {
  const base = { settings: DEFAULT_SETTINGS, sceneText: "A busy street.", player: "Sam", timeoutMs: 5000 };

  test("confidence decides: act, suggest, or leave as roleplay", async () => {
    const r = hometown();
    const s = initialState(r);
    s.location = "high_street";
    for (const [conf, expectAct, expectSuggest] of [[0.9, true, false], [0.55, false, true], [0.2, false, false]] as const) {
      const d = new Scripted((q) => ({ action: choice("pickpocket", conf, Object.keys((q.action as any).criteria)) }));
      const rd = await readTurn({ ...base, decider: d, r, s, playerText: "I lift his wallet" });
      expect(!!rd.intent).toBe(expectAct);
      expect(!!rd.suggestion).toBe(expectSuggest);
    }
  });

  test("'none' means plain roleplay; travel and difficulty map onto the ruleset", async () => {
    const r = hometown();
    const s = initialState(r);
    s.location = "high_street";
    const none = await readTurn({ ...base, decider: new Scripted((q) => ({ action: choice("none", 0.95, Object.keys((q.action as any).criteria)) })), r, s, playerText: "Hello!" });
    expect(none.intent).toBeNull();
    const go = await readTurn({ ...base, decider: new Scripted((q) => ({ action: choice("go:park", 0.9, Object.keys((q.action as any).criteria)) })), r, s, playerText: "I walk to the park" });
    expect(go.intent?.actionId).toBe("go:park");
    // "escape" has difficulty params; a score of 3 (extreme) picks the hardest option.
    const d = new Scripted((q) => ({
      action: choice("escape", 0.9, Object.keys((q.action as any).criteria)),
      difficulty: { type: "score", score: 3, confidence: 0.8, probabilities: {} },
    }));
    const esc = await readTurn({ ...base, decider: d, r, s, playerText: "I wrench free and bolt" });
    expect(esc.intent).toMatchObject({ actionId: "escape", params: { difficulty: "extreme" } });
  });

  test("nothing typed → no action question, but scene triggers are still judged", async () => {
    const { ruleset: r } = normalizeRuleset({
      stats: { stress: { max: 100, start: 0, good: "low" } },
      triggers: { danger: { when_scene: "{{user}} is in immediate danger", do: { stress: +20, hint: "Danger!" } } },
    });
    const d = new Scripted(() => ({ "scene:danger": { type: "noul", noul: 0.92 } }));
    const rd = await readTurn({ ...base, decider: d, r: r!, s: initialState(r!), playerText: null });
    expect(Object.keys(d.asked[0])).toEqual(["scene:danger"]);
    expect((d.asked[0]["scene:danger"] as any).instructions).toBe("Sam is in immediate danger");
    expect(rd.scene).toEqual({ danger: true });
    const rec = resolveTurnFull(r!, initialState(r!), null, { seed: "x", scene: rd.scene }).record;
    expect(foldEvents(r!, [rec.events]).stats.stress).toBe(20);
    // Unsure answers don't flip a trigger either way.
    const unsure = await readTurn({ ...base, decider: new Scripted(() => ({ "scene:danger": { type: "noul", noul: 0.55 } })), r: r!, s: initialState(r!), playerText: null });
    expect(unsure.scene).toEqual({});
  });

  test("rules-only provider never acts on its own", async () => {
    const r = hometown();
    const s = initialState(r);
    s.location = "high_street";
    const rd = await readTurn({ ...base, decider: new RulesDecider(), r, s, playerText: "I try to pick a pocket of the tourist" });
    expect(rd.intent).toBeNull();
    expect(rd.suggestion?.actionId).toBe("pickpocket");
  });
});

describe("decide blocks: model odds, engine dice", () => {
  const { ruleset: r } = normalizeRuleset({
    relationships: { stats: { love: { start: 10 } }, people: { robin: { name: "Robin" } } },
    actions: {
      ask_out: {
        label: "Ask Robin out",
        effects: {
          decide: {
            ask: "How does Robin respond to {{user}} asking them out?",
            options: {
              yes: { desc: "Says yes", rel: { robin: { love: +10 } } },
              no: { desc: "Turns them down", rel: { robin: { love: -2 } } },
            },
          },
        },
      },
    },
  });

  test("without odds it reports the need and falls back to weights; with odds the draw follows them", () => {
    const s = initialState(r!);
    const first = resolveTurnFull(r!, s, { actionId: "ask_out", via: "choice" }, { seed: "s1" });
    expect(first.needs.map((n) => n.id)).toHaveLength(1);
    expect(first.record.decisions![0].source).toBe("weights");
    const id = first.needs[0].id;
    const sure = resolveTurnFull(r!, s, { actionId: "ask_out", via: "choice" }, { seed: "s1", odds: { [id]: { yes: 1, no: 0 } } });
    expect(sure.needs).toHaveLength(0);
    expect(sure.record.decisions![0]).toMatchObject({ picked: "yes", source: "model" });
    expect(foldEvents(r!, [sure.record.events], s).rel.robin.love).toBe(20);
    expect(sure.record.hints.join("\n")).toContain("→ Says yes");
  });

  test("the same seed and odds always give the same pick (swipes stay honest)", () => {
    const s = initialState(r!);
    const id = resolveTurnFull(r!, s, { actionId: "ask_out", via: "choice" }, { seed: "a" }).needs[0].id;
    const picks = new Set<string>();
    for (let i = 0; i < 5; i++) picks.add(resolveTurnFull(r!, s, { actionId: "ask_out", via: "choice" }, { seed: "same", odds: { [id]: { yes: 0.5, no: 0.5 } } }).record.decisions![0].picked);
    expect(picks.size).toBe(1);
    const spread = new Set<string>();
    for (let i = 0; i < 40; i++) spread.add(resolveTurnFull(r!, s, { actionId: "ask_out", via: "choice" }, { seed: `s${i}`, odds: { [id]: { yes: 0.5, no: 0.5 } } }).record.decisions![0].picked);
    expect(spread.size).toBe(2);
  });
});

describe("System-1 bookkeeping", () => {
  test("atomic answers become bounded deltas; gates request names from a writer", async () => {
    const r = hometown();
    const s = initialState(r);
    s.people.robin = { name: "Robin" };
    s.rel.robin = { love: 0, lust: 0, trust: 10, dominance: 0 };
    const d = new Scripted((q) => {
      const a: Answers = {};
      for (const [k, v] of Object.entries(q)) {
        if (k === "time") a[k] = { type: "score", score: 2, confidence: 0.9, probabilities: {} };
        else if (k === "stat:stress") a[k] = choice("up_lot", 0.8, Object.keys((v as any).criteria));
        else if (k === "stat:fatigue") a[k] = choice("up", 0.3, Object.keys((v as any).criteria)); // too unsure → ignored
        else if (k === "rel:robin:trust") a[k] = choice("down", 0.7, Object.keys((v as any).criteria));
        else if (k === "move") a[k] = choice("park", 0.8, Object.keys((v as any).criteria));
        else if (k === "gate:people") a[k] = { type: "noul", noul: 0.9 };
        else if (v.type === "noul") a[k] = { type: "noul", noul: 0.1 };
      }
      return a;
    });
    const out = await bookkeeping({ decider: d, r, s, playerText: "…", reply: "Robin frowns as you both head to the park. A stranger named Alex waves.", player: "Sam" });
    expect(out.proposal.minutes).toBe(30);
    expect(out.proposal.stats).toEqual({ stress: r.stats.stress.narrator });
    expect(out.proposal.rel).toEqual({ Robin: { trust: -2 } });
    expect(out.proposal.move).toBe("park");
    expect([...out.needsWriting]).toEqual(["people"]);
    // Only people the reply mentions are asked about.
    expect(Object.keys(d.asked[0]).filter((k) => k.startsWith("rel:")).every((k) => k.startsWith("rel:robin:"))).toBe(true);
  });
});

describe("Jev adapter", () => {
  test("posts TypeSafe's request shape and reads answers", async () => {
    const g = globalThis as any;
    const prev = g.spindle;
    let sent: any = null;
    g.spindle = {
      ...(prev ?? {}),
      cors: async (url: string, init: any) => {
        sent = { url, init };
        return { status: 200, body: JSON.stringify({ model: "jev-1.13.0", answers: { action: { type: "choice", choice: "climb", probabilities: { climb: 0.9, none: 0.1 }, confidence: 0.9 } }, usage: {} }) };
      },
    };
    try {
      const jev = new JevDecider("sk-test", "jev-latest");
      const q: Questions = { action: { type: "choice", instructions: "What?", criteria: { climb: "Climbing", none: "Nothing" } } };
      const ans = await jev.ask({ player_message: "I climb" }, q);
      expect(sent.url).toBe("https://api.typesafe.ai/v1/systemone");
      expect(sent.init.headers.Authorization).toBe("Bearer sk-test");
      expect(JSON.parse(sent.init.body)).toEqual({ model: "jev-latest", state: { player_message: "I climb" }, questions: q });
      expect(ans.action).toMatchObject({ type: "choice", choice: "climb" });
    } finally {
      g.spindle = prev;
    }
  });

  test("a rejected key surfaces a readable error", async () => {
    const g = globalThis as any;
    const prev = g.spindle;
    g.spindle = { ...(prev ?? {}), cors: async () => ({ status: 401, body: "invalid key" }) };
    try {
      await expect(new JevDecider("bad", "jev-latest").ask({}, { x: { type: "noul", instructions: "?" } })).rejects.toThrow(/API key was rejected/);
    } finally {
      g.spindle = prev;
    }
  });
});
