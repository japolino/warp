// The doll as typed questions: every field of a look is a choice, a score or a
// yes/no, so a classifier (Jev) can dress it in one call — no JSON to parse, and
// every answer comes with how sure it is. Garment details are asked for every
// slot up front ("speculative fan-out"); the answers for slots nobody wears are
// simply ignored. Colours are asked by name: classifiers read words, not hex.

import type { Answer, Answers, Question, Questions } from "../engine/decide.js";
import type { Sex } from "../frontend/doll/body.js";
import type { Garment, Kind } from "../frontend/doll/garments.js";
import { NAMED } from "../frontend/doll/outfits.js";
import type { Look } from "../frontend/doll/render.js";

const choice = (instructions: string, criteria: Record<string, string>): Question => ({ type: "choice", instructions, criteria });
const score = (instructions: string, criteria: string[]): Question => ({ type: "score", instructions, criteria });
const yes = (instructions: string): Question => ({ type: "noul", instructions });

/** Colours offered for clothes (all in NAMED). */
const CLOTH = ["black", "charcoal", "grey", "silver", "white", "ivory", "cream", "beige", "tan", "khaki", "brown", "dark brown", "maroon", "burgundy", "crimson", "red", "coral", "pink", "rose", "magenta", "orange", "gold", "yellow", "olive", "green", "dark green", "emerald", "mint", "teal", "turquoise", "sky", "blue", "dark blue", "navy", "indigo", "violet", "purple", "lavender"];
const HAIR = { black: "black or jet", "dark brown": "dark brown", brown: "brown or chestnut", "light brown": "light brown", auburn: "auburn", ginger: "ginger, red or copper", blonde: "blonde or golden", platinum: "platinum or white", silver: "silver or grey", pink: "pink", blue: "blue", green: "green", purple: "purple or violet" } as const;
const EYES = { brown: "brown or dark", hazel: "hazel", amber: "amber or gold", green: "green", emerald: "bright green", blue: "blue", "sky": "pale blue or grey-blue", grey: "grey", violet: "violet or purple", red: "red or crimson", pink: "pink", gold: "golden or yellow" } as const;
const SKIN: Record<string, [string, string]> = {
  pale: ["very pale, porcelain or snow-white", "#fbe3d3"], fair: ["fair or light", "#f6d7c3"], light: ["light with a warm tone", "#efc4a4"],
  olive: ["olive or lightly tanned", "#d9a37e"], tan: ["tanned or light brown", "#c98e65"], brown: ["brown", "#a8714c"],
  dark: ["dark brown", "#8d5a3b"], deep: ["very dark", "#6a4128"], blue: ["blue or blue-grey (not human)", "#c9d8e8"], green: ["green (not human)", "#9fd3a8"],
};

interface Slot { kind: Kind; noun: string; ask: (who: string) => Questions }

/** The person in each question, by name, so the classifier reads it literally. */
function slots(): Slot[] {
  const colourQ = (who: string, noun: string) => choice(`The main colour of ${who}'s ${noun}`, Object.fromEntries(CLOTH.map((c) => [c, c])));
  const patternQ = (who: string, noun: string) => choice(`The pattern on ${who}'s ${noun}`, { none: "plain, one colour", stripes: "horizontal stripes", vstripes: "vertical stripes or pinstripes", plaid: "plaid or tartan", check: "checked or gingham", dots: "polka dots", floral: "flowers or blossoms", waves: "waves or a Japanese wave pattern", stars: "stars or moons", cow: "cow print or black-and-white patches", leopard: "leopard or animal print", fishnet: "fishnet or mesh", scales: "scales, chainmail or overlapping plates" });
  const damageQ = (who: string, noun: string) => score(`How worn or damaged ${who}'s ${noun} is`, ["intact, clean", "worn, scuffed or stained", "torn or ripped in places", "in tatters, falling apart"]);
  const materialQ = (who: string, noun: string) => choice(`What ${who}'s ${noun} is made of`, { cloth: "ordinary cloth, cotton, linen, wool", leather: "leather or hide", metal: "metal, steel, iron or chainmail", sheer: "see-through, sheer, lace or mesh", knit: "knitted", silk: "silk, satin or other shiny cloth" });
  const base = (who: string, key: string, noun: string): Questions => ({
    [`${key}.colour`]: colourQ(who, noun), [`${key}.pattern`]: patternQ(who, noun), [`${key}.damage`]: damageQ(who, noun), [`${key}.material`]: materialQ(who, noun),
  });
  const neckline = (who: string, noun: string) => choice(`The neckline of ${who}'s ${noun}`, { crew: "round, close to the neck (t-shirt)", scoop: "low round", v: "V-neck or plunging", wrap: "wrapped, crossing over (kimono, robe, wrap top)", collar: "shirt collar or lapels", turtle: "turtleneck or high collar", boat: "wide and shallow", strapless: "strapless or tube", offshoulder: "off the shoulders", halter: "halter, tied behind the neck" });
  const sleeves = (who: string, noun: string) => choice(`How long the sleeves of ${who}'s ${noun} are`, { none: "no sleeves", cap: "tiny cap sleeves", short: "short sleeves", elbow: "to the elbow", three: "three-quarter", long: "long, to the wrist" });
  const sleeveFit = (who: string, noun: string) => choice(`The shape of the sleeves of ${who}'s ${noun}`, { tight: "fitted", loose: "loose or baggy", wide: "very wide hanging sleeves (kimono)", puff: "puffed at the shoulder", bell: "flaring wide at the wrist" });
  const legLength = (who: string, noun: string) => choice(`How far down ${who}'s ${noun} reaches`, { micro: "barely below the hips", short: "upper thigh", mid: "mid thigh", knee: "the knee", calf: "mid calf", ankle: "the ankle", floor: "the floor" });
  const topReach = (who: string, noun: string) => choice(`Where the top of ${who}'s ${noun} sits`, { ankle: "at the ankle", calf: "mid calf", knee: "at the knee", short: "over the knee, on the thigh" });
  const fit = (who: string, noun: string) => choice(`How ${who}'s ${noun} fits`, { tight: "tight or form-fitting", regular: "ordinary fit", loose: "loose, baggy or oversized" });
  const S = (kind: Kind, noun: string, extra: (who: string) => Questions): Slot => ({ kind, noun, ask: (who) => ({ ...base(who, kind, noun), ...extra(who) }) });
  return [
    S("top", "shirt or top", (w) => ({ "top.neckline": neckline(w, "top"), "top.sleeves": sleeves(w, "top"), "top.sleeveFit": sleeveFit(w, "top"), "top.fit": fit(w, "top"), "top.hem": choice(`Where ${w}'s top ends`, { crop: "cropped, showing the belly", waist: "at the waist", hip: "at the hips", knee: "a long tunic to the knee" }) })),
    S("outer", "jacket, coat or vest", (w) => ({ "outer.style": choice(`What kind of outer layer ${w} wears`, { jacket: "jacket or blazer", coat: "long coat, trench coat, duster or overcoat", vest: "vest or waistcoat (no sleeves)", hoodie: "hoodie or sweatshirt" }), "outer.open": yes(`${w}'s jacket or coat hangs open at the front`), "outer.neckline": neckline(w, "jacket or coat") })),
    S("dress", "dress", (w) => ({ "dress.neckline": neckline(w, "dress"), "dress.sleeves": sleeves(w, "dress"), "dress.sleeveFit": sleeveFit(w, "dress"), "dress.length": legLength(w, "dress"), "dress.flare": score(`How full ${w}'s dress skirt is`, ["straight or tight", "a little flared", "full and swishing", "very full, ball gown"]) })),
    S("robe", "robe or kimono", (w) => ({ "robe.neckline": neckline(w, "robe"), "robe.sleeveFit": sleeveFit(w, "robe"), "robe.length": legLength(w, "robe") })),
    S("armor", "armour", (w) => ({ "armor.sleeves": sleeves(w, "armour") })),
    S("bottom", "trousers or shorts", (w) => ({ "bottom.length": legLength(w, "trousers or shorts"), "bottom.fit": fit(w, "trousers or shorts") })),
    S("skirt", "skirt", (w) => ({ "skirt.length": legLength(w, "skirt"), "skirt.flare": score(`How full ${w}'s skirt is`, ["straight or pencil", "a little flared", "pleated or full", "very full"]) })),
    S("legwear", "socks, stockings or tights", (w) => ({ "legwear.style": choice(`What ${w} wears on the legs`, { socks: "socks", stockings: "stockings or thigh-highs", tights: "tights or pantyhose" }), "legwear.length": topReach(w, "socks or stockings") })),
    S("shoes", "shoes", (w) => ({ "shoes.style": choice(`What ${w} wears on the feet`, { shoes: "shoes, loafers or flats", boots: "boots", heels: "high heels", sandals: "sandals", geta: "geta or wooden clogs", sneakers: "sneakers or trainers" }), "shoes.length": topReach(w, "boots") })),
    S("gloves", "gloves", (w) => ({ "gloves.style": choice(`${w}'s gloves`, { full: "full gloves", fingerless: "fingerless gloves, bracers or arm warmers" }), "gloves.sleeves": choice(`How far up ${w}'s gloves go`, { cap: "just the hand and wrist", short: "the forearm", elbow: "to the elbow", long: "above the elbow" }) })),
    S("hat", "hat or headwear", (w) => ({ "hat.style": choice(`What ${w} wears on the head`, { newsboy: "flat or newsboy cap, beret", beanie: "beanie or knit cap", witch: "pointed witch or wizard hat", sunhat: "wide-brimmed hat, sun hat, cowboy or straw hat", cap: "baseball cap", crown: "crown", tiara: "tiara or circlet", headband: "headband or maid headdress", hood: "a hood, up" }) })),
    S("neck", "necklace, collar or scarf", (w) => ({ "neck.style": choice(`What ${w} wears around the neck`, { choker: "choker", necklace: "necklace or pendant", scarf: "scarf", collar: "collar with a bell or ring" }) })),
    S("belt", "belt", () => ({})),
    S("sash", "sash or obi", () => ({})),
    S("apron", "apron", () => ({})),
    S("cape", "cape or cloak", (w) => ({ "cape.length": legLength(w, "cape or cloak") })),
    S("sleeves", "detached sleeves", () => ({})),
  ];
}

/** Things a literal reader confuses with each slot. */
const NOT: Partial<Record<Kind, string>> = {
  top: " (a shirt, blouse, t-shirt or sweater; not a dress, robe, vest or jacket)",
  outer: " (not a cloak or cape)",
  cape: " (a cape or cloak, not a coat)",
  belt: " (a belt, not an obi or sash)",
};

/** Every question about one person's look, in one batch. */
export function dollQuestions(who: string): Questions {
  const q: Questions = {
    sex: choice(`Is ${who} female or male?`, { f: "female: a woman or girl", m: "male: a man or boy" }),
    build: choice(`${who}'s build`, { slim: "slim, slender, thin, petite or lithe", athletic: "athletic, fit, toned or sporty", big: "curvy or voluptuous (a woman); broad, burly or very muscular (a man)", heavy: "heavy, plump, chubby, stout or fat" }),
    height: score(`How tall ${who} is`, ["very short or tiny", "short or petite", "average height", "tall", "very tall"]),
    skin: choice(`${who}'s skin`, Object.fromEntries(Object.entries(SKIN).map(([k, [d]]) => [k, d]))),
    hairStyle: choice(`${who}'s hairstyle`, { long: "long and loose, straight", bob: "a bob, chin length", ponytail: "a ponytail", twintails: "twin tails or pigtails", short: "short and neat", spiky: "short and spiky", messy: "messy, tousled or shaggy", bun: "tied up in a bun", buzz: "shaved or buzzed" }),
    hairLength: score(`How long ${who}'s hair is`, ["shaved or very short", "short, above the ears", "chin or neck length", "to the shoulders", "past the shoulders", "to the waist or longer"]),
    hairColour: choice(`${who}'s hair colour`, HAIR),
    eyes: choice(`${who}'s eye colour`, EYES),
    expression: choice(`${who}'s usual expression or manner`, { neutral: "calm or neutral", smile: "cheerful, warm or smiling", serious: "serious, stern, cold or tired", surprised: "nervous, shy or startled", smug: "smug, teasing, sly or confident" }),
    ears: choice(`What kind of ears ${who} has`, { none: "ordinary human ears", cat: "cat ears", fox: "fox ears", wolf: "wolf or dog ears", bunny: "rabbit ears", elf: "long pointed elf ears" }),
    tail: choice(`What kind of tail ${who} has`, { none: "no tail", fox: "one fluffy fox tail", kitsune: "several fox tails (a kitsune)", cat: "a thin cat tail", wolf: "a wolf or dog tail", demon: "a thin demon tail with a spade tip" }),
    horns: choice(`What horns ${who} has`, { none: "no horns", small: "small horns", ram: "curled ram horns", oni: "one or two straight oni horns" }),
    furColour: choice(`The colour of ${who}'s animal ears and tail, if any`, { hair: "the same as their hair", orange: "orange or red, like a red fox", white: "white or snowy", black: "black", grey: "grey", brown: "brown", gold: "golden", silver: "silver" }),
  };
  for (const s of slots()) {
    q[`${s.kind}.wears`] = yes(`${who} is wearing ${/^[aeiou]/.test(s.noun) ? "an" : "a"} ${s.noun}${NOT[s.kind] ?? ""}`);
    Object.assign(q, s.ask(who));
  }
  return q;
}

const pickOf = (a: Answer | undefined) => (a?.type === "choice" ? a : null);
const scoreOf = (a: Answer | undefined) => (a?.type === "score" ? a : null);
const yesOf = (a: Answer | undefined) => (a?.type === "noul" ? a.noul : 0);

/** Below this, an answer is a guess and is reported as one. */
const SURE = 0.6;

/** Turn the answers into a look, and say which parts were guesses. */
export function lookFromAnswers(a: Answers, who: string, force: Set<Kind> = new Set()): { look: Look; guessed: string[] } {
  const guessed: string[] = [];
  const c = (id: string, label: string) => {
    const x = pickOf(a[id]);
    if (x && x.confidence < SURE) guessed.push(label);
    return x?.choice;
  };
  const sex: Sex = c("sex", "sex") === "m" ? "m" : "f";
  const buildPick = c("build", "build") ?? "athletic";
  const preset = buildPick === "big" ? (sex === "f" ? "curvy" : "broad") : buildPick;
  const h = scoreOf(a.height);
  const hairL = scoreOf(a.hairLength);
  if (h && h.confidence < SURE) guessed.push("height");
  const hairStyle = c("hairStyle", "hairstyle") ?? "long";
  const skinKey = c("skin", "skin") ?? "fair";
  const look: Look = {
    body: { sex, preset, ...(h ? { height: 0.88 + (h.score / 4) * 0.24 } : {}) },
    skin: SKIN[skinKey]?.[1] ?? "#f0c8a8",
    hair: { style: hairStyle as Look["hair"]["style"], colour: NAMED[c("hairColour", "hair colour") ?? "brown"] ?? NAMED.brown, length: hairL ? Math.min(1, hairL.score / 5) : 0.5 },
    eyes: NAMED[c("eyes", "eye colour") ?? "brown"] ?? "#6b4a32",
    expression: (c("expression", "expression") ?? "neutral") as Look["expression"],
    ears: ((x) => (x && x !== "none" ? x : null))(c("ears", "ears")) as Look["ears"],
    tail: ((x) => (x && x !== "none" ? x : null))(c("tail", "tail")) as Look["tail"],
    horns: ((x) => (x && x !== "none" ? x : null))(c("horns", "horns")) as Look["horns"],
    outfit: [],
  };
  const fur = c("furColour", "ear and tail colour");
  const furHex = fur && fur !== "hair" ? NAMED[fur] ?? look.hair.colour : look.hair.colour;
  if (look.ears && look.ears !== "elf") look.earColour = furHex;
  if (look.tail) look.tailColour = furHex;

  // Which slots are worn, then the rules a classifier can't see (a robe isn't worn over trousers unless clearly so).
  const wears = (k: Kind) => yesOf(a[`${k}.wears`]);
  const on = new Set<Kind>();
  for (const s of slots()) if (wears(s.kind) >= 0.5 || force.has(s.kind)) on.add(s.kind);
  const full = on.has("dress") || on.has("robe");
  if (full) for (const k of ["top", "bottom", "skirt"] as Kind[]) if (on.has(k) && wears(k) < 0.85 && !force.has(k)) on.delete(k);
  if (on.has("dress") && on.has("robe")) on.delete(wears("dress") >= wears("robe") ? "robe" : "dress");
  if (on.has("skirt") && on.has("bottom")) on.delete(wears("skirt") >= wears("bottom") ? "bottom" : "skirt");
  // An obi is the belt; a padded coat read under armour is the armour's lining.
  if (on.has("sash") && on.has("belt") && wears("belt") <= wears("sash")) on.delete("belt");
  if (on.has("armor") && on.has("outer") && wears("outer") < 0.85) on.delete("outer");

  // Innermost first: later garments are drawn over earlier ones.
  const ORDER: Kind[] = ["legwear", "shoes", "bottom", "skirt", "top", "dress", "robe", "armor", "sash", "belt", "apron", "outer", "cape", "sleeves", "gloves", "neck", "hat"];
  for (const k of ORDER) {
    if (!on.has(k)) continue;
    const slot = slots().find((s) => s.kind === k)!;
    if (wears(k) < 0.7) guessed.push(`whether ${who} wears ${/^[aeiou]/.test(slot.noun) ? "an" : "a"} ${slot.noun}`);
    const g: Garment = { kind: k, colour: NAMED[c(`${k}.colour`, `${slot.noun} colour`) ?? "grey"] ?? "#7a7a84", label: slot.noun.split(/,| or /)[0].trim() };
    const set = (field: keyof Garment, id = `${k}.${String(field)}`) => { const x = pickOf(a[id]); if (x) (g as unknown as Record<string, unknown>)[field] = x.choice; };
    const pat = pickOf(a[`${k}.pattern`]);
    if (pat && pat.choice !== "none" && pat.confidence >= 0.5) { g.pattern = pat.choice as Garment["pattern"]; g.patternColour = pat.choice === "fishnet" ? "#1d1720" : g.colour === NAMED.black || g.colour === NAMED.charcoal ? "#e8e4dc" : "#1d1a22"; }
    const mat = pickOf(a[`${k}.material`]);
    if (mat && mat.choice !== "cloth" && mat.confidence >= 0.5 && (k !== "shoes" || mat.choice === "metal")) g.material = mat.choice as Garment["material"];
    const dmg = scoreOf(a[`${k}.damage`]);
    if (dmg && dmg.score >= 1) g.damage = Math.min(1, (dmg.score - 0.5) / 3);
    for (const f of ["neckline", "sleeves", "sleeveFit", "fit", "hem", "length", "style"] as (keyof Garment)[]) if (a[`${k}.${String(f)}`]) set(f);
    for (const f of ["flare"] as const) { const s = scoreOf(a[`${k}.${f}`]); if (s) g.flare = s.score / 3; }
    if (k === "outer") g.open = yesOf(a["outer.open"]) >= 0.5;
    if (k === "shoes" && g.style !== "boots") delete g.length;
    if (k === "legwear" && g.style === "tights") delete g.length;
    if (k === "sash" || k === "belt") g.colour2 = "#c9a54a";
    look.outfit.push(g);
  }
  return { look, guessed };
}

// ───────── words for a look (what a classifier reads as "how they look now") ─────────

const nameOf = (hex: string) => Object.entries(NAMED).find(([, h]) => h === hex)?.[0] ?? "coloured";

export function describeLook(l: Look): string {
  const lines = [
    `${l.body.sex === "m" ? "Male" : "Female"}, ${l.body.preset} build.`,
    `Hair: ${l.hair.style}, ${nameOf(l.hair.colour)}. Eyes: ${nameOf(l.eyes)}.`,
    l.ears ? `Ears: ${l.ears}.` : "", l.tail ? `Tail: ${l.tail}.` : "", l.horns ? `Horns: ${l.horns}.` : "",
    l.outfit.length ? `Wearing: ${l.outfit.map((g) => [g.damage && g.damage > 0.4 ? "torn" : "", nameOf(g.colour), g.pattern && g.pattern !== "none" ? `${g.pattern}` : "", g.material && g.material !== "cloth" ? g.material : "", g.style ?? "", g.label ?? g.kind, g.kind === "outer" && g.open ? "(open)" : ""].filter(Boolean).join(" ")).join("; ")}.` : "Wearing: nothing.",
  ];
  return lines.filter(Boolean).join(" ");
}

// ───────── story updates: what changed, then only that ─────────
//
// Two steps, each asked literally. First, against the story and the look before it:
// did anything change, and per garment was it taken off, put on, or torn? Then, only
// when something new went on (or hair or body changed), the details of just that,
// read from the story.

export function dollChangeQuestions(who: string): Questions {
  const q: Questions = {
    changed: yes(`In the latest story, ${who}'s clothes, hair or body visibly change (something put on, taken off, swapped, torn, or a transformation)`),
    "changed.hair": yes(`In the latest story, ${who}'s hairstyle changes (cut, let down, tied up, braided)`),
    "changed.hairColour": yes(`In the latest story, ${who}'s hair colour changes (dyed, bleached, magic)`),
    "changed.body": yes(`In the latest story, ${who} grows or loses animal ears, a tail or horns`),
  };
  for (const s of slots()) {
    q[`${s.kind}.off`] = yes(`In the latest story, ${who} takes off or loses their ${s.noun}`);
    q[`${s.kind}.on`] = yes(`In the latest story, ${who} puts on a ${s.noun}${NOT[s.kind] ?? ""}`);
    q[`${s.kind}.torn`] = yes(`In the latest story, ${who}'s ${s.noun} gets torn, cut or damaged`);
  }
  return q;
}

export interface Change { look: Look; changed: string[]; needs: Set<Kind>; hair: boolean; hairColour: boolean; body: boolean }

/** Apply the yes/no answers. `needs` lists what must be read from the story next (new garments). */
export function applyChanges(current: Look, a: Answers): Change | null {
  if (yesOf(a.changed) < 0.5) return null;
  const look: Look = JSON.parse(JSON.stringify(current));
  const changed: string[] = [];
  const needs = new Set<Kind>();
  // Under a robe or dress, a "new top" is usually the robe or a layer over it being read twice.
  const fullBody = look.outfit.some((g) => g.kind === "robe" || g.kind === "dress") || yesOf(a["robe.on"]) >= 0.6 || yesOf(a["dress.on"]) >= 0.6;
  for (const s of slots()) {
    const i = look.outfit.findIndex((g) => g.kind === s.kind);
    const bar = fullBody && ["top", "bottom", "skirt"].includes(s.kind) ? 0.85 : 0.6;
    const off = yesOf(a[`${s.kind}.off`]) >= 0.6, on = yesOf(a[`${s.kind}.on`]) >= bar, torn = yesOf(a[`${s.kind}.torn`]) >= 0.6;
    if (off && i >= 0 && !on) { look.outfit.splice(i, 1); changed.push(`${s.noun} off`); continue; }
    if (on) { needs.add(s.kind); continue; }
    if (torn && i >= 0) { look.outfit[i].damage = Math.max(look.outfit[i].damage ?? 0, 0.55); changed.push(`${s.noun} torn`); }
  }
  const hair = yesOf(a["changed.hair"]) >= 0.6, hairColour = yesOf(a["changed.hairColour"]) >= 0.6, body = yesOf(a["changed.body"]) >= 0.6;
  if (!changed.length && !needs.size && !hair && !hairColour && !body) return null;
  return { look, changed, needs, hair, hairColour, body };
}

/** The details asked when something new went on: the full set, read from the story (unused answers are ignored). */
export const dollDetailQuestions = dollQuestions;

/** Fill in what `applyChanges` left open from the detail answers. */
export function finishChanges(ch: Change, a: Answers, who: string): { look: Look; changed: string[] } {
  const fresh = lookFromAnswers(a, who, ch.needs).look;
  const look = ch.look, changed = [...ch.changed];
  if (ch.hair) { look.hair = { ...look.hair, style: fresh.hair.style, length: fresh.hair.length }; changed.push("hair"); }
  if (ch.hairColour) { look.hair = { ...look.hair, colour: fresh.hair.colour }; changed.push("hair colour"); }
  if (ch.body) { look.ears = fresh.ears; look.tail = fresh.tail; look.horns = fresh.horns; look.earColour = fresh.earColour; look.tailColour = fresh.tailColour; changed.push("ears, tail or horns"); }
  for (const k of ch.needs) {
    const now = fresh.outfit.find((g) => g.kind === k);
    if (!now) continue;
    const i = look.outfit.findIndex((g) => g.kind === k);
    if (i >= 0) look.outfit[i] = now; else look.outfit.push(now);
    changed.push(`${slots().find((s) => s.kind === k)!.noun} on`);
  }
  return { look, changed };
}
