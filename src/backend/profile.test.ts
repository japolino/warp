import { describe, expect, test } from "bun:test";
import { aboutThem, nameRe } from "./source.js";

describe("who someone is, from a scenario card", () => {
  test("full names isolate the profile when first names may collide", () => {
    const card = [
      "The city of Vell is split by a river.",
      "Miu Tanaka: a barista with silver hair and green eyes, shy but sharp-tongued.",
      "Mitsuki runs the bakery.",
      "Everyone knows Miu hums when she works.",
    ].join("\n\n");
    const out = aboutThem(card, nameRe("Miu Tanaka"), 2000);
    expect(out).toContain("silver hair");
    expect(out).not.toContain("hums");
    expect(out).not.toContain("Mitsuki");
    expect(out).not.toContain("river");
    expect(nameRe("Alex Bell").test("Alex River: a different person")).toBe(false);
  });
});
