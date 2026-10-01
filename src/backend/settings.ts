import { DEFAULT_SETTINGS, type Settings } from "../shared/protocol.js";
import { host } from "./host.js";

const cache = new Map<string, Settings>();
const key = (userId?: string) => userId ?? "_";

export async function getSettings(userId?: string): Promise<Settings> {
  const hit = cache.get(key(userId));
  if (hit) return hit;
  let stored: Partial<Settings> = {};
  try {
    stored = await host().userStorage.getJson<Partial<Settings>>("settings.json", { fallback: {}, userId });
  } catch { /* first run */ }
  const s = { ...DEFAULT_SETTINGS, ...stored };
  cache.set(key(userId), s);
  return s;
}

export async function patchSettings(patch: Partial<Settings>, userId?: string): Promise<Settings> {
  const cur = await getSettings(userId);
  const next: Settings = { ...cur, ...patch };
  next.lines = (next.lines ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  next.veils = (next.veils ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  next.drafts = Math.max(1, Math.min(4, Math.round(Number(next.drafts) || 1)));
  next.prewrite = Math.max(0, Math.min(4, Math.round(Number(next.prewrite) || 0)));
  next.sceneLines = next.sceneLines === "scripted" ? "scripted" : "model";
  next.draftItemUses = next.draftItemUses !== false;
  next.dateImages = next.dateImages !== false && (next.dateImages as unknown) !== "false";
  cache.set(key(userId), next);
  await host().userStorage.setJson("settings.json", next, { indent: 2, userId });
  return next;
}
