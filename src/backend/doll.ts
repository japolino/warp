// The doll's helper: turns a character card, lorebook, persona, a typed
// description or the latest story into a look the doll can draw. The model only
// picks from fixed lists; anything it can't express is left out, never invented as art.

import { PRESETS } from "../frontend/doll/body.js";
import { EARS, EXPRESSIONS, HAIR_STYLES, HORNS, TAILS } from "../frontend/doll/features.js";
import { FITS, HEMS, KINDS, LENGTHS, MATERIALS, NECKLINES, PATTERNS, SLEEVE_FITS, SLEEVES, STYLES } from "../frontend/doll/garments.js";
import { cleanLook, NAMED } from "../frontend/doll/outfits.js";
import type { DollRequest } from "../shared/protocol.js";
import { ask, firstJson } from "./helpers.js";
import { host, logError, send, toast } from "./host.js";
import { getMessages } from "./ledger.js";
import { getSettings } from "./settings.js";
import { personProfile } from "./source.js";

const list = (xs: readonly string[]) => xs.join(" | ");

export const DOLL_SYSTEM = `You dress a paper doll for a roleplay game. You never draw; you pick from fixed lists, and the game draws it.

Reply with JSON only:
{"look": {...}, "invented": ["short notes on what you made up because the sources didn't say"]}

look fields:
- body: {"sex": "f" | "m", "preset": f: ${list(Object.keys(PRESETS.f))}; m: ${list(Object.keys(PRESETS.m))}, "blend": {"preset": another preset, "amount": 0..1} (optional, for in-between builds), "height": 0.85..1.15 (1 = average)}
- skin, eyes: hex colours ("#e8b896"). Colour words also work: ${Object.keys(NAMED).slice(0, 20).join(", ")}…
- hair: {"style": ${list(HAIR_STYLES)}, "colour": hex, "length": 0..1 (for long styles)}
- expression: ${list(EXPRESSIONS)}
- ears (only for non-human ears): ${list(EARS)} or null; earColour
- tail: ${list(TAILS)} or null; tailColour. kitsune = several fox tails.
- horns: ${list(HORNS)} or null
- outfit: a list of garments, innermost first. Each garment:
  {"kind": ${list(KINDS)}, "label": "what it is, 1-3 words", "colour": hex, "colour2": trim hex (optional),
   "pattern": ${list(PATTERNS)}, "patternColour": hex, "material": ${list(MATERIALS)},
   "neckline": ${list(NECKLINES)}, "sleeves": ${list(SLEEVES)}, "sleeveFit": ${list(SLEEVE_FITS)},
   "hem": ${list(HEMS)} (tops), "length": ${list(LENGTHS)} (legs, skirts, socks, boots), "fit": ${list(FITS)},
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
Keep what the sources say exactly (colours, cuts, animal features). Fill gaps to fit the setting and the person.`;

async function macro(text: string, chatId: string | null, userId?: string): Promise<string> {
  if (!chatId) return "";
  try {
    const { text: t } = await host().macros.resolve(text, { chatId, userId, commit: false });
    return t && t !== text ? t.trim() : "";
  } catch { return ""; }
}

/** Gather what's known about someone and ask the helper for their look. */
export async function dollLook(m: DollRequest, userId?: string): Promise<void> {
  const settings = await getSettings(userId);
  const parts: string[] = [];
  let name = m.who;
  try {
    if (m.source === "text") {
      parts.push(`Describe this look:\n${String(m.text ?? "").slice(0, 3000)}`);
    } else if (m.who === "you") {
      name = (await macro("{{user}}", m.chatId, userId)) || "the player";
      const persona = await macro("{{persona}}", m.chatId, userId);
      parts.push(`Who: ${name}, the player character.`);
      if (persona) parts.push(`Their persona:\n${persona.slice(0, 3000)}`);
    } else if (m.chatId) {
      const p = await personProfile(m.chatId, m.who, userId);
      parts.push(`Who: ${m.who}.`);
      if (p.text) parts.push(p.text);
      if (p.setting) parts.push(`The setting:\n${p.setting}`);
    }
    if (m.worn?.length) parts.push(`What the game says they are wearing now (keep all of these; describe each as a garment):\n${m.worn.map((w) => `- ${w}`).join("\n")}`);
    if (m.source === "story" && m.chatId) {
      const msgs = await getMessages(m.chatId);
      const recent = msgs.slice(-6).map((x) => `${x.is_user ? "(player)" : "(story)"} ${x.content.slice(0, 1500)}`).join("\n\n");
      parts.push(`Their look right now:\n${JSON.stringify(m.current ?? {}).slice(0, 4000)}`);
      parts.push(`The latest story:\n${recent}`);
      parts.push(`Return the whole look, changed only where the latest story changed it (clothes put on, taken off, torn, swapped; hair let down; a transformation). If nothing changed, return it as it was.`);
    } else if (m.source !== "text" && m.current) {
      parts.push(`Their current look, for reference (replace it): ${JSON.stringify(m.current).slice(0, 2000)}`);
    }
    if (m.chatId && m.source !== "text" && m.source !== "story") {
      const msgs = await getMessages(m.chatId).catch(() => []);
      const tail = msgs.slice(-3).map((x) => x.content.slice(0, 800)).join("\n\n");
      if (tail) parts.push(`The story lately (for what they're wearing now):\n${tail}`);
    }
    if (parts.length === 0) { send({ type: "doll_look", who: m.who, look: null, note: "", error: "Nothing to go on: open a chat first, or describe the look." }, userId); return; }
    const raw = firstJson(await ask(DOLL_SYSTEM, parts.join("\n\n"), settings, userId, 45000, { temperature: 0.6, maxTokens: 2400 }));
    if (!raw || typeof raw.look !== "object") throw new Error("the helper didn't send a look");
    const look = cleanLook(raw.look);
    const invented = Array.isArray(raw.invented) ? raw.invented.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
    send({ type: "doll_look", who: m.who, look, note: invented.length ? `Made up: ${invented.join("; ")}` : "", name }, userId);
  } catch (e) {
    logError("doll look", e);
    toast("warning", "The helper couldn't dress the doll this time. Try again, or describe the look.", userId);
    send({ type: "doll_look", who: m.who, look: null, note: "", error: String((e as Error)?.message ?? e) }, userId);
  }
}
