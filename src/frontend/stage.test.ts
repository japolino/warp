import { describe, expect, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { resolveTurnFull } from "../engine/resolve.js";
import { foldEvents, initialState, type GameState } from "../engine/state.js";
import { TEMPLATES } from "../engine/templates/index.js";
import { enterDungeon, moveTo } from "../engine/dungeon/run.js";
import { buildDungeonEntries, buildDungeonView } from "../engine/dungeon/view.js";
import { buildDateView } from "../engine/date/view.js";
import { dateMoves } from "../engine/date/talk.js";
import type { BackendToFrontend } from "../shared/protocol.js";
import { formatStory, renderStage, stageModeOf, storySpeaker } from "./stage.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;
const t = TEMPLATES.find((x) => x.id === "hometown")!;
const r = loadRuleset(t.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i }))).ruleset!;
const msg = (s: GameState): StateMsg => ({
  type: "state", chatId: "c", status: { state: "ok", name: r.name, source: null, issues: [], characterName: null, cardKind: "character", tags: [] },
  hud: null, map: null, choices: [], records: [], suggestions: [], latestMessageId: "m", choicesAnchor: "m", busy: false,
  dungeon: buildDungeonView(r, s), dungeonEntries: buildDungeonEntries(r, s), date: buildDateView(r, s, []), story: null,
});
const ui = { pick: null, mates: new Set<string>(), busy: false, cat: null, freshReaction: false };
const atDocks = () => { const s = initialState(r); s.location = "docks"; s.locationName = "The Docks"; return s; };

describe("the stage", () => {
  test("it shows a run or a date in progress, and the entrance only when asked", () => {
    const s = atDocks();
    expect(stageModeOf(msg(s), false)).toBeNull();
    expect(stageModeOf(msg(s), true)).toBe("gate");
    const run = foldEvents(r, [enterDungeon(r, s, "old_mines", [], "seed").events], s);
    expect(stageModeOf(msg(run), false)).toBe("dungeon");
    expect(storySpeaker(msg(run), "dungeon")).toBe("The Old Mines");
  });

  test("the entrance picks companions and enters", () => {
    const html = renderStage(msg(atDocks()), "gate", ui);
    expect(html).toContain('data-dg-enter="old_mines"');
    expect(html).toContain("data-dg-mate=");
    expect(html).toContain("data-stage-close");
  });

  test("a run shows the floor to walk and a way out; a battle swaps in the command menu", () => {
    const s = atDocks();
    let run = foldEvents(r, [enterDungeon(r, s, "old_mines", [], "seed-7").events], s);
    const html = renderStage(msg(run), "dungeon", ui);
    expect(html).toContain("data-dg-move=");
    expect(html).toContain("data-dg-leave");
    expect(html).toContain("Floor 1");
    for (let i = 0; i < 60 && !run.dungeon?.battle; i++) {
      const next = buildDungeonView(r, run)!.tiles.find((x) => x.reachable && x.state === "hidden") ?? buildDungeonView(r, run)!.tiles.find((x) => x.reachable);
      if (!next) break;
      run = foldEvents(r, [moveTo(r, run, next.x, next.y).events], run);
    }
    expect(run.dungeon?.battle).toBeTruthy();
    const fight = renderStage(msg(run), "dungeon", ui);
    expect(fight).toContain("data-dg-skill=");
    expect(fight).toContain("data-dg-auto=");
    expect(fight).not.toContain("data-dg-leave"); // no walking out mid-fight
  });

  test("a date shows where you stand, their mood, the moves and every topic", () => {
    let s = initialState(r);
    s.location = "high_street"; s.minutes = 10 * 60;
    s = foldEvents(r, [resolveTurnFull(r, s, { actionId: "date:talk@jo", via: "choice" }, { seed: "d" }).record.events], s);
    const topic = dateMoves(r, s, []).find((m) => m.kind === "topic")!;
    s = foldEvents(r, [resolveTurnFull(r, s, { actionId: topic.id, via: "choice" }, { seed: "e" }).record.events], s);
    const m = msg(s);
    expect(stageModeOf(m, false)).toBe("date");
    const html = renderStage(m, "date", { ...ui, freshReaction: true });
    expect(html).toContain("warp-stage-ladder");
    expect(html).toContain('class="now"');
    expect(html).toContain("data-date-act=\"date:topic:");
    expect(html).toContain("warp-stage-reaction");
    expect(html).toContain(" fresh");
    expect(storySpeaker(m, "date")).toBe("Jo");
  });

  test("narration keeps its shape: paragraphs, emphasis, dialogue — and nothing unescaped", () => {
    const out = formatStory(`"Stay close," she says. *It's dark.*\n\n**Run.** <script>x</script>`);
    expect(out).toContain('<span class="warp-stage-q">&quot;Stay close,&quot;</span>');
    expect(out).toContain("<em>It&#39;s dark.</em>");
    expect(out).toContain("<strong>Run.</strong>");
    expect(out).not.toContain("<script>");
    expect(out.match(/<p>/g)?.length).toBe(2);
  });
});
