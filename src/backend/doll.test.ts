import { describe, expect, test } from "bun:test";
import { lookFrom } from "./doll.js";
import { nameRe } from "./source.js";
import { cleanLook } from "../frontend/doll/outfits.js";

describe("the doll helper's reply", () => {
  test("finds the look after thinking-out-loud objects, prose and code fences", () => {
    expect(lookFrom('Sure!\n```json\n{"thought": "dressing"} {"look": {"eyes": "blue"}, "invented": ["eyes"]}\n```')).toEqual({ look: { eyes: "blue" }, invented: ["eyes"] });
  });
  test("a look written at the top level, or as a bare list of garments", () => {
    expect(lookFrom('{"body": {"sex": "m"}, "outfit": []}')?.look).toEqual({ body: { sex: "m" }, outfit: [] });
    const got = lookFrom('{"look": [{"kind": "robe", "colour": "navy"}]}')!;
    expect(cleanLook(got.look).outfit.map((g) => g.kind)).toEqual(["robe"]);
  });
  test("no look at all, or a null one, is a failure (never a default doll)", () => {
    expect(lookFrom('{"look": null}')).toBeNull();
    expect(lookFrom("I can't help with that.")).toBeNull();
    expect(lookFrom('{"thought": "x"}')).toBeNull();
  });
  test("braces inside strings don't confuse it", () => {
    expect(lookFrom('{"look": {"outfit": [{"kind": "top", "label": "a {weird} \\"shirt\\""}]}}')?.look).toEqual({ outfit: [{ kind: "top", label: 'a {weird} "shirt"' }] });
  });
});

describe("looks from loose words", () => {
  test("presets written as 'f: curvy' or 'Curvy', and colour words with modifiers", () => {
    const l = cleanLook({ body: { sex: "f", preset: "f: Curvy", blend: { preset: "HEAVY", amount: 0.3 } }, eyes: "hazel", skin: "peach", hair: { colour: "deep crimson" } });
    expect(l.body.preset).toBe("curvy");
    expect(l.body.blend?.preset).toBe("heavy");
    expect([l.eyes, l.skin, l.hair.colour]).toEqual(["#8e7652", "#f4c29f", "#9e1b32"]);
  });
});

test("an empty name matches nothing", () => {
  expect(nameRe("").test("Anyone. Anything, at all.")).toBe(false);
  expect(nameRe("  ").test("x")).toBe(false);
  expect(nameRe("Aina").test("Then Aina left.")).toBe(true);
});
