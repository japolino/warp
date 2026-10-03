import { DEFAULT_SETTINGS, type Settings } from "../shared/protocol.js";
import { host } from "./host.js";

const cache = new Map<string, Settings>();
const writes = new Map<string, Promise<void>>();
const key = (userId?: string) => userId ?? "_";

/** Treat persisted data and UI messages as untrusted input. */
export function normalizeSettings(value: unknown): Settings {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const s: Settings = { ...DEFAULT_SETTINGS, lines: [], veils: [] };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const def = DEFAULT_SETTINGS[k], v = raw[k];
    if (typeof def === "boolean") (s as unknown as Record<string, unknown>)[k] = v === true || v === "true" ? true : v === false || v === "false" ? false : def;
    else if (typeof def === "string" && typeof v === "string") (s as unknown as Record<string, unknown>)[k] = v.trim();
    else if (typeof def === "number" && (typeof v === "number" || typeof v === "string") && v !== "" && Number.isFinite(Number(v))) (s as unknown as Record<string, unknown>)[k] = Number(v);
  }
  for (const k of ["lines", "veils"] as const) s[k] = Array.isArray(raw[k]) ? [...new Set((raw[k] as unknown[]).filter((v): v is string => typeof v === "string").map((v) => v.trim().toLowerCase()).filter(Boolean))] : [];
  s.autoConfidence = Math.max(0, Math.min(1, s.autoConfidence));
  s.askConfidence = Math.max(0, Math.min(s.autoConfidence, s.askConfidence));
  s.decider = ["llm", "jev", "rules"].includes(s.decider) ? s.decider : DEFAULT_SETTINGS.decider;
  s.jevFormat = s.jevFormat === "openai" ? "openai" : "typesafe";
  s.jevUrl = /^https?:\/\/\S+$/i.test(s.jevUrl) ? s.jevUrl : DEFAULT_SETTINGS.jevUrl;
  return s;
}

export async function getSettings(userId?: string): Promise<Settings> {
  const hit = cache.get(key(userId));
  if (hit) return hit;
  let stored: Partial<Settings> = {};
  try {
    stored = await host().userStorage.getJson<Partial<Settings>>("settings.json", { fallback: {}, userId });
  } catch { /* first run */ }
  const s = normalizeSettings(stored);
  cache.set(key(userId), s);
  return s;
}

export async function patchSettings(patch: Partial<Settings>, userId?: string): Promise<Settings> {
  let result!: Settings;
  const k = key(userId);
  const operation = (writes.get(k) ?? Promise.resolve()).then(async () => {
    result = await persistSettings(patch, userId);
  });
  const tail = operation.catch(() => {});
  writes.set(k, tail);
  void tail.then(() => { if (writes.get(k) === tail) writes.delete(k); });
  await operation;
  return result;
}

async function persistSettings(patch: Partial<Settings>, userId?: string): Promise<Settings> {
  const cur = await getSettings(userId);
  const next: Settings = normalizeSettings({ ...cur, ...patch });
  await host().userStorage.setJson("settings.json", next, { indent: 2, userId });
  cache.set(key(userId), next);
  return next;
}
