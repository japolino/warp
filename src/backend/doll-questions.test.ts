import { describe, expect, test } from "bun:test";
import type { Answers } from "../engine/decide.js";
import { applyChanges, describeLook, dollChangeQuestions, dollQuestions, finishChanges, lookFromAnswers } from "./doll-questions.js";
import { renderDoll } from "../frontend/doll/render.js";
import kuzunoha from "./fixtures/doll-jev-kuzunoha.json";
import vance from "./fixtures/doll-jev-vance.json";
import aina from "./fixtures/doll-jev-aina.json";

// Real answers from Jev 1.13 for three described characters (see the fixture files).
describe("a look from a classifier's answers", () => {
  test("every question is well formed and within the API's limits", () => {
    const q = { ...dollQuestions("Aina"), ...dollChangeQuestions("Aina") };
    for (const x of Object.values(q)) {
      if (x.type === "choice") { expect(Object.keys(x.criteria).length).toBeGreaterThan(1); expect(Object.keys(x.criteria).length).toBeLessThanOrEqual(255); }
      if (x.type === "score") { expect(x.criteria.length).toBeGreaterThan(1); expect(x.criteria.length).toBeLessThanOrEqual(10); }
    }
  });

  test("a fox spirit in a kimono: robe, obi (no extra belt), geta, fox ears, several tails, hair in a bun", () => {
    const { look } = lookFromAnswers(kuzunoha as Answers, "Kuzunoha");
    expect(look.outfit.map((g) => g.kind)).toEqual(["shoes", "robe", "sash"]);
    expect(look.outfit[1].pattern).toBe("waves");
    expect(look.outfit[0].style).toBe("geta");
    expect([look.ears, look.tail, look.hair.style, look.body.preset]).toEqual(["fox", "kitsune", "bun", "curvy"]);
    expect(renderDoll(look)).not.toContain("NaN");
  });

  test("a drifter: an open, worn trench coat over a t-shirt, slacks and scuffed sneakers", () => {
    const { look } = lookFromAnswers(vance as Answers, "Vance");
    const coat = look.outfit.find((g) => g.kind === "outer")!;
    expect([coat.style, coat.open]).toEqual(["coat", true]);
    expect(look.outfit.find((g) => g.kind === "shoes")?.style).toBe("sneakers");
    expect(look.body.sex).toBe("m");
  });

  test("a catgirl in school uniform: blazer, collared blouse, plaid skirt, knee socks", () => {
    const { look } = lookFromAnswers(aina as Answers, "Aina");
    expect(look.ears).toBe("cat");
    expect(look.outfit.find((g) => g.kind === "skirt")?.pattern).toBe("plaid");
    expect(look.outfit.find((g) => g.kind === "legwear")?.length).toBe("knee");
    expect(describeLook(look)).toContain("plaid");
  });
});

describe("story changes", () => {
  const yes = (v: number) => ({ type: "noul" as const, noul: v });
  const vanceLook = lookFromAnswers(vance as Answers, "Vance").look;

  test("nothing changed: no update at all", () => {
    expect(applyChanges(vanceLook, { changed: yes(0.05) })).toBeNull();
  });

  test("a coat taken off and a shirt torn need no second call", () => {
    const ch = applyChanges(vanceLook, { changed: yes(0.99), "outer.off": yes(0.95), "top.torn": yes(0.9) })!;
    expect(ch.needs.size).toBe(0);
    expect(ch.look.outfit.some((g) => g.kind === "outer")).toBe(false);
    expect(ch.look.outfit.find((g) => g.kind === "top")!.damage).toBeGreaterThan(0.5);
  });

  test("something put on is read from the second call, and only that", () => {
    const ch = applyChanges(vanceLook, { changed: yes(0.99), "gloves.on": yes(0.9) })!;
    expect([...ch.needs]).toEqual(["gloves"]);
    const done = finishChanges(ch, { ...(vance as Answers), "gloves.wears": yes(0.2), "gloves.colour": { type: "choice", choice: "black", confidence: 0.9, probabilities: { black: 0.9 } } }, "Vance");
    expect(done.look.outfit.find((g) => g.kind === "gloves")?.colour).toBe("#1f1d24");
    // The coat wasn't touched.
    expect(done.look.outfit.find((g) => g.kind === "outer")).toEqual(vanceLook.outfit.find((g) => g.kind === "outer"));
  });
});
