// The doll's helper: turns a character card, lorebook, persona, a typed
// description or the latest story into a look the doll can draw. The model only
// picks from fixed lists; anything it can't express is left out, never invented as art.

import { PRESETS } from "../frontend/doll/body.js";
import { EARS, EXPRESSIONS, HAIR_STYLES, HORNS, TAILS } from "../frontend/doll/features.js";
import { FITS, HEMS, KINDS, LENGTHS, MATERIALS, NECKLINES, PATTERNS, SLEEVE_FITS, SLEEVES, STYLES } from "../frontend/doll/garments.js";
import { cleanLook, NAMED } from "../frontend/doll/outfits.js";
import type { Look } from "../frontend/doll/render.js";
import { applyChanges, describeLook, dollChangeQuestions, dollDetailQuestions, dollQuestions, finishChanges, lookFromAnswers } from "./doll-questions.js";
import { getDecider, JevDecider } from "./deciders.js";
import type { DollRequest } from "../shared/protocol.js";
import { ask } from "./helpers.js";
import { host, logError, send, toast } from "./host.js";
import { getMessages } from "./ledger.js";
import { getSettings } from "./settings.js";
import { personProfile } from "./source.js";

const list = (xs: readonly string[]) => xs.join(" | ");

export const DOLL_SYSTEM = `You dress a paper doll for a roleplay game. You never draw; you pick from fixed lists, and the game draws it.

Reply with JSON only:
{"look": {...}, "invented": ["short notes on what you made up because the sources didn't say"]}

look fields:
- body: {"sex": "f" | "m", "preset": one word — for "f" one of ${list(Object.keys(PRESETS.f))}; for "m" one of ${list(Object.keys(PRESETS.m))}, "blend": {"preset": another preset of the same sex, "amount": 0..1} (optional, for in-between builds), "height": 0.85..1.15 (1 = average)}
- skin, eyes: hex colours ("#e8b896"). Colour words also work: ${Object.keys(NAMED).slice(0, 20).join(", ")}…
- hair: {"style": ${list(HAIR_STYLES)}, "colour": hex, "length": a number 0..1 (0 short, 1 waist-long)}
- expression: ${list(EXPRESSIONS)}
- ears (only for non-human ears): ${list(EARS)} or null; earColour
- tail: ${list(TAILS)} or null; tailColour. kitsune = several fox tails.
- horns: ${list(HORNS)} or null
- outfit: a list of garments, innermost first. Each garment:
  List garments innermost first: something listed later (armour over a robe, a belt over a coat) is drawn over earlier ones.
  {"kind": ${list(KINDS)}, "label": "what it is, 1-3 words", "colour": hex, "colour2": trim hex (optional),
   "pattern": ${list(PATTERNS)}, "patternColour": hex, "material": ${list(MATERIALS)},
   "neckline": ${list(NECKLINES)}, "sleeves": ${list(SLEEVES)}, "sleeveFit": ${list(SLEEVE_FITS)},
   "hem": ${list(HEMS)} (tops), "length": one word, ${list(LENGTHS)} — for trousers, skirts, dresses and robes how far DOWN they reach; for socks, stockings and boots where their TOP sits ("knee" socks, "ankle" boots, "short" = thigh-high), "fit": ${list(FITS)},
   "rise": high | mid | low, "flare": 0..1 (skirts, coat tails), "open": true|false (jackets), "damage": 0..1 (torn or worn),
   "style": ${Object.entries(STYLES).map(([k, v]) => `${k}: ${list(v!)}`).join("; ")}}

How to build things that aren't on the lists — compose them:
- kimono / yukata: robe (wrap neckline, wide sleeves, a pattern) + sash (obi) + shoes geta
- hanfu, bathrobe, wizard robe: robe with sleeveFit bell or wide; a priest's cassock: robe with collar neckline
- plate armour: armor (material metal) + gloves metal + shoes boots metal; chainmail: top with pattern scales, material metal
- a dress shirt: top, collar neckline; a hoodie: outer style hoodie; a trench coat: outer style coat, length knee
- leggings / jeans: bottom, fit tight; a kilt: skirt with plaid; overalls: bottom + apron in the same colour
- detached sleeves: sleeves; arm warmers: gloves style fingerless, sleeves elbow
Never add a garment the sources don't support unless you need it to clothe them plausibly for the setting; note those in "invented".
Keep what the sources say exactly (colours, cuts, animal features). Fill gaps to fit the setting and the person.
"look" is one object with the fields above (not a list of garments). Write nothing before or after the JSON.`;

async function macro(text: string, chatId: string | null, userId?: string): Promise<string> {
  if (!chatId) return "";
  try {
    const { text: t } = await host().macros.resolve(text, { chatId, userId, commit: false });
    return t && t !== text ? t.trim() : "";
  } catch { return ""; }
}

/** The helper's reply: the first JSON object that holds a look (or is one), skipping any thinking-out-loud objects before it. */
export function lookFrom(text: string): { look: Record<string, unknown> | unknown[]; invented: string[] } | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  for (let start = cleaned.indexOf("{"); start >= 0; start = cleaned.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, end = -1;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = i; break; }
    }
    if (end < 0) return null;
    let o: unknown;
    try { o = JSON.parse(cleaned.slice(start, end + 1)); } catch { continue; }
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    const r = o as Record<string, unknown>;
    const invented = Array.isArray(r.invented) ? r.invented.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
    // {"look": {...}} or {"look": [garments]}, or the look's own fields at the top.
    if (r.look && typeof r.look === "object") return { look: r.look as Record<string, unknown> | unknown[], invented };
    if ("outfit" in r || "body" in r || "hair" in r) return { look: r, invented };
    start = end;
  }
  return null;
}

/** Gather what's known about someone and ask the helper for their look. Always answers the frontend, so its buttons never stay busy. */
export async function dollLook(m: DollRequest, userId?: string): Promise<void> {
  const who = String(m.who ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  let name = who;
  try {
    const settings = await getSettings(userId);
    const parts: string[] = [];
    /** What a classifier reads: plain facts, no instructions. */
    const context: Record<string, unknown> = {};
    if (m.source === "text") {
      const text = String(m.text ?? "").trim().slice(0, 3000);
      if (text) { parts.push(`Describe this look:\n${text}`); context.description = text; }
    } else if (who === "you") {
      name = ((await macro("{{user}}", m.chatId, userId)) || "the player").slice(0, 80);
      const persona = await macro("{{persona}}", m.chatId, userId);
      parts.push(`Who: ${name}, the player character.`);
      if (persona) { parts.push(`Their persona:\n${persona.slice(0, 3000)}`); context.description = persona.slice(0, 3000); }
    } else {
      parts.push(who && who !== "them" ? `Who: ${who}.` : "Who: the other person in the scene.");
      if (m.chatId && who && who !== "them") {
        const p = await personProfile(m.chatId, who, userId);
        if (p.text) { parts.push(p.text); context.description = p.text; }
        if (p.setting) { parts.push(`The setting:\n${p.setting}`); context.setting = p.setting; }
      }
    }
    const worn = (m.worn ?? []).filter((w) => typeof w === "string").slice(0, 16).map((w) => w.slice(0, 120));
    if (worn.length) context.wearing_now_in_the_game = worn;
    if (worn.length) parts.push(`What the game says they are wearing now (keep all of these; describe each as a garment):\n${worn.map((w) => `- ${w}`).join("\n")}`);
    if (m.source === "story" && m.chatId) {
      const msgs = await getMessages(m.chatId);
      const recent = msgs.slice(-6).map((x) => `${x.is_user ? "(player)" : "(story)"} ${x.content.slice(0, 1500)}`).join("\n\n");
      parts.push(`Their look right now:\n${JSON.stringify(m.current ?? {}).slice(0, 4000)}`);
      parts.push(`The latest story:\n${recent}`);
      context.latest_story = msgs.slice(-3).map((x) => x.content.slice(0, 2500)).join("\n\n");
      parts.push(`Return the whole look, changed only where the latest story changed it (clothes put on, taken off, torn, swapped; hair let down; a transformation). If nothing changed, return it as it was.`);
    } else if (m.source !== "text" && m.current) {
      parts.push(`Their current look, for reference (replace it): ${JSON.stringify(m.current).slice(0, 2000)}`);
    }
    if (m.chatId && m.source === "profile") {
      const msgs = await getMessages(m.chatId).catch(() => []);
      const tail = msgs.slice(-3).map((x) => x.content.slice(0, 800)).join("\n\n");
      if (tail) { parts.push(`The story lately (for what they're wearing now):\n${tail}`); context.story_lately = tail; }
    }
    const enough = m.source === "text" ? parts.length > 0 : m.source === "story" ? !!m.chatId : who === "you" ? parts.length > 1 : parts.length > 1;
    if (!enough) {
      send({ type: "doll_look", who: m.who, chatId: m.chatId, ...(m.auto ? { auto: true } : {}), look: null, note: "", error: m.source === "text" ? "Describe the look first." : "Nothing to go on yet: open a chat with them, or describe the look." }, userId);
      return;
    }
    // With a classifier set up, answer typed questions (fast, and always well-formed); the writing model is the fallback.
    const decider = await getDecider(settings, userId).catch(() => null);
    if (decider instanceof JevDecider) {
      const done = await classify(decider, m, who === "you" ? name : who && who !== "them" ? who : "the other person", context).catch((e) => { logError("doll classifier", e); return null; });
      if (done) { send({ type: "doll_look", who: m.who, chatId: m.chatId, ...(m.auto ? { auto: true } : {}), look: done.look, note: done.note, ...(who !== "them" ? { name } : {}) }, userId); return; }
    }
    const got = lookFrom(await ask(DOLL_SYSTEM, parts.join("\n\n"), settings, userId, 60000, { temperature: 0.6 }));
    if (!got) throw new Error("the helper didn't send a look");
    const look = cleanLook(got.look);
    send({ type: "doll_look", who: m.who, chatId: m.chatId, ...(m.auto ? { auto: true } : {}), look, note: got.invented.length ? `Made up: ${got.invented.join("; ")}` : "", ...(who !== "them" ? { name } : {}) }, userId);
  } catch (e) {
    logError("doll look", e);
    if (!m.auto) toast("warning", "The helper couldn't dress the doll this time. Try again, or describe the look.", userId);
    send({ type: "doll_look", who: m.who, chatId: m.chatId, ...(m.auto ? { auto: true } : {}), look: null, note: "", error: String((e as Error)?.message ?? e).slice(0, 200) }, userId);
  }
}

/** The classifier path: one batch of typed questions (two for a story change with something new). */
export async function classify(d: JevDecider, m: DollRequest, who: string, context: Record<string, unknown>): Promise<{ look: Look; note: string } | null> {
  if (m.source === "story") {
    const current = cleanLook(m.current);
    const story = String(context.latest_story ?? "");
    if (!story) return null;
    const before = describeLook(current);
    const gate = await d.ask({ who, how_they_looked_before: before, latest_story: story }, dollChangeQuestions(who), { timeoutMs: 15000 });
    const ch = applyChanges(current, gate);
    if (!ch) return { look: current, note: "Nothing about their look changed in the latest replies." };
    const done = ch.needs.size || ch.hair || ch.hairColour || ch.body
      ? finishChanges(ch, await d.ask({ who, latest_story: story, how_they_looked_before: before }, dollDetailQuestions(who), { timeoutMs: 15000 }), who)
      : { look: ch.look, changed: ch.changed };
    return { look: done.look, note: done.changed.length ? `Changed: ${done.changed.join(", ")}.` : "Nothing about their look changed in the latest replies." };
  }
  if (!context.description && !context.story_lately && !context.wearing_now_in_the_game) return null;
  const answers = await d.ask({ who, ...context }, dollQuestions(who), { timeoutMs: 15000 });
  if (!Object.keys(answers).length) return null;
  const { look, guessed } = lookFromAnswers(answers, who);
  return { look, note: guessed.length ? `Guessed: ${guessed.join("; ")}.` : "" };
}
