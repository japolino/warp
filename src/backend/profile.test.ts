import { describe, expect, test } from "bun:test";
import { aboutThem, nameRe } from "./source.js";

describe("who someone is, from a scenario card", () => {
  test("only the passages about them, matched by first name as a whole word", () => {
    const card = [
      "The city of Vell is split by a river.",
      "Miu Tanaka: a barista with silver hair and green eyes, shy but sharp-tongued.",
      "Mitsuki runs the bakery.",
      "Everyone knows Miu hums when she works.",
    ].join("\n\n");
    const out = aboutThem(card, nameRe("Miu Tanaka"), 2000);
    expect(out).toContain("silver hair");
    expect(out).toContain("hums");
    expect(out).not.toContain("Mitsuki");
    expect(out).not.toContain("river");
  });
});
