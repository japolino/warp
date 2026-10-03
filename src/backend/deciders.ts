// Decision providers. All answer the same typed questions. A classifier endpoint
// answers them natively (TypeSafe's Jev by default, or any service with the same
// API) or through any OpenAI-compatible chat endpoint; the helper LLM imitates one
// in a single batched call; the rules provider never calls anything (and is
// deliberately unsure of itself).

import type { GenerationResponseDTO } from "lumiverse-spindle-types";
import { normalize, type Answer, type Answers, type Decider, type DecideOptions, type Questions } from "../engine/decide.js";
import type { Settings } from "../shared/protocol.js";
import { classifierIssue } from "../shared/classifier-config.js";
import { host, logError, toast } from "./host.js";

export const JEV_KEY = "jev_api_key";
export const JEV_URL = "https://api.typesafe.ai/v1/systemone";

export class DeciderError extends Error {}

// ───────────────────────── Jev ─────────────────────────

interface HttpResult { status: number; body: string }

async function post(url: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<HttpResult> {
  signal.throwIfAborted();
  // Prefer the host proxy (sanctioned network path for extensions); fall back to fetch where allowed.
  const call = (async (): Promise<HttpResult> => {
    try {
      const r = (await host().cors(url, { method: "POST", headers, body, signal } as never)) as { status: number; body: string };
      signal.throwIfAborted();
      return { status: r.status, body: r.body };
    } catch (e) {
      signal.throwIfAborted();
      if (typeof fetch !== "function") throw e;
      const r = await fetch(url, { method: "POST", headers, body, signal });
      return { status: r.status, body: await r.text() };
    }
  })();
  return abortable(call, signal);
}

function abortable<T>(call: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DeciderError("Decision model canceled"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    call.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** POST with a couple of retries when the service is busy; anything else non-200 is an error that says what went wrong. */
async function postJson(url: string, key: string, body: string, timeoutMs: number, who: string, supplied?: AbortSignal): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) };
  let delay = 400;
  const controller = new AbortController();
  const onAbort = () => controller.abort(supplied?.reason);
  supplied?.addEventListener("abort", onAbort, { once: true });
  if (supplied?.aborted) onAbort();
  const timer = setTimeout(() => controller.abort(new DeciderError("Decision model timed out")), Math.max(1, timeoutMs));
  try {
    for (let attempt = 0; ; attempt++) {
      const res = await post(url, headers, body, controller.signal);
      if (res.status === 200) return res.body;
      if ((res.status === 429 || res.status === 529 || res.status === 503) && attempt < 2) {
        await abortable(new Promise((r) => setTimeout(r, delay)), controller.signal);
        delay *= 3;
        continue;
      }
      const hint = res.status === 401 || res.status === 403 ? `the ${who} API key was rejected` : res.status === 404 ? `${who} wasn't found at ${url}` : res.status === 422 ? `${who} rejected the request` : `${who} returned ${res.status}`;
      throw new DeciderError(`${hint}${res.body ? `: ${res.body.slice(0, 200)}` : ""}`);
    }
  } finally {
    clearTimeout(timer);
    supplied?.removeEventListener("abort", onAbort);
  }
}

/** A classifier speaking TypeSafe's typed-question API: { model, state, questions } → { answers }. */
export class JevDecider implements Decider {
  readonly id = "jev" as const;
  readonly canWrite = false;
  constructor(private key: string, private model: string, private url = JEV_URL) {}

  async ask(state: unknown, questions: Questions, opts: DecideOptions & { timeoutMs?: number } = {}): Promise<Answers> {
    if (!Object.keys(questions).length) return {};
    const issue = classifierIssue("typesafe", this.model, this.url);
    if (issue) throw new DeciderError(issue);
    const body = JSON.stringify({ model: this.model || "jev-latest", state, questions });
    const who = this.url === JEV_URL ? "Jev" : "The classifier";
    const parsed = JSON.parse(await postJson(this.url || JEV_URL, this.key, body, opts.timeoutMs ?? 8000, who, opts.signal)) as { answers?: Answers };
    return parsed.answers ?? {};
  }
}

/** Any OpenAI-compatible /chat/completions endpoint used as a classifier: the helper LLM's prompt, sent straight to it. */
export class ChatEndpointDecider implements Decider {
  readonly id = "jev" as const;
  readonly canWrite = false;
  constructor(private key: string, private model: string, private url: string) {}

  async ask(state: unknown, questions: Questions, opts: DecideOptions & { timeoutMs?: number } = {}): Promise<Answers> {
    const ids = Object.keys(questions);
    if (!ids.length) return {};
    const issue = classifierIssue("openai", this.model, this.url);
    if (issue) throw new DeciderError(issue);
    const { system, user } = typedPrompt(state, questions);
    const url = /\/chat\/completions\/?$/.test(this.url) ? this.url : `${this.url.replace(/\/+$/, "")}/chat/completions`;
    const body = JSON.stringify({ model: this.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0, max_tokens: 60 + ids.length * 30 });
    const parsed = JSON.parse(await postJson(url, this.key, body, opts.timeoutMs ?? 15000, "The classifier", opts.signal)) as { choices?: { message?: { content?: string } }[] };
    return typedAnswers(firstJson(parsed.choices?.[0]?.message?.content ?? "") ?? {}, questions);
  }
}

// ───────────────────────── LLM stand-in ─────────────────────────

function firstJson(text: string): Record<string, unknown> | null {
  const s = text.replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

/** The typed questions as a chat prompt any model can answer with JSON. */
function typedPrompt(state: unknown, questions: Questions): { system: string; user: string } {
  const ids = Object.keys(questions);
  const lines = ids.map((id) => {
    const q = questions[id];
    if (q.type === "choice") return `${id} (choice) — ${q.instructions}\n${Object.entries(q.criteria).map(([k, v]) => `    "${k}": ${v}`).join("\n")}`;
    if (q.type === "score") return `${id} (score 0–${q.criteria.length - 1}) — ${q.instructions}\n${q.criteria.map((c, i) => `    ${i}: ${c}`).join("\n")}`;
    return `${id} (yes/no) — ${q.instructions}`;
  });
  const system = [
    "You answer typed questions about a roleplay game's current situation. You never write story.",
    "Answer every question. Reply with JSON only, one key per question id:",
    '  choice → {"choice": "<option key>", "confidence": 0.0–1.0}',
    '  score  → {"level": <integer>, "confidence": 0.0–1.0}',
    '  yes/no → {"p": <probability it is true, 0.0–1.0>}',
    "Be honest about confidence: 0.5 means a coin flip.",
  ].join("\n");
  const user = `State:\n${typeof state === "string" ? state : JSON.stringify(state, null, 1)}\n\nQuestions:\n${lines.join("\n\n")}`;
  return { system, user };
}

/** A model's JSON reply, read back into typed answers (anything malformed is simply left out). */
function typedAnswers(raw: Record<string, unknown>, questions: Questions): Answers {
  const out: Answers = {};
  for (const id of Object.keys(questions)) {
    const q = questions[id];
    const a = (raw[id] ?? {}) as Record<string, unknown>;
    const conf = clamp01(Number(a.confidence ?? 0.6));
    if (q.type === "choice") {
      const keys = Object.keys(q.criteria);
      const pick = typeof a.choice === "string" && keys.includes(a.choice) ? a.choice : null;
      if (!pick) continue;
      const rest = keys.length > 1 ? (1 - conf) / (keys.length - 1) : 0;
      out[id] = { type: "choice", choice: pick, confidence: conf, probabilities: Object.fromEntries(keys.map((k) => [k, k === pick ? conf : rest])) };
    } else if (q.type === "score") {
      const n = q.criteria.length;
      const level = Math.max(0, Math.min(n - 1, Math.round(Number(a.level))));
      if (!Number.isFinite(level)) continue;
      const rest = n > 1 ? (1 - conf) / (n - 1) : 0;
      out[id] = { type: "score", score: level, confidence: conf, probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), i === level ? conf : rest])) };
    } else {
      const p = Number(a.p ?? a.probability ?? a.noul);
      if (Number.isFinite(p)) out[id] = { type: "noul", noul: clamp01(p) };
    }
  }
  return out;
}

export class LlmDecider implements Decider {
  readonly id = "llm" as const;
  readonly canWrite = true;
  constructor(private settings: Settings, private userId?: string) {}

  async ask(state: unknown, questions: Questions, opts: DecideOptions & { timeoutMs?: number } = {}): Promise<Answers> {
    const ids = Object.keys(questions);
    if (!ids.length) return {};
    const { system, user } = typedPrompt(state, questions);
    const res = (await host().generate.quiet({
      type: "quiet",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      connection_id: this.settings.helperConnectionId || undefined,
      reasoning: { source: "off" },
      parameters: { temperature: 0, max_tokens: 60 + ids.length * 30 },
      userId: this.userId,
      signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(Math.max(1, opts.timeoutMs ?? 20000))]) : AbortSignal.timeout(Math.max(1, opts.timeoutMs ?? 20000)),
    })) as GenerationResponseDTO | string;
    return typedAnswers(firstJson(typeof res === "string" ? res : res?.content ?? "") ?? {}, questions);
  }
}

// ───────────────────────── rules only ─────────────────────────

const STOP = new Set("a an the to of and or in on at for with my i me you your it is be do try tries trying".split(" "));
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** Keyword overlap. Never confident enough to act on its own. */
export class RulesDecider implements Decider {
  readonly id = "rules" as const;
  readonly canWrite = false;
  async ask(state: unknown, questions: Questions): Promise<Answers> {
    const text = typeof state === "string" ? state : JSON.stringify((state as Record<string, unknown>)?.player_message ?? state);
    const have = words(text);
    const out: Answers = {};
    for (const [id, q] of Object.entries(questions)) {
      if (q.type === "choice") {
        const keys = Object.keys(q.criteria);
        const scores: Record<string, number> = {};
        for (const k of keys) {
          const want = words(`${k.replace(/_/g, " ")} ${q.criteria[k]}`);
          let hit = 0;
          for (const w of want) if (have.has(w)) hit++;
          scores[k] = 0.15 + hit;
        }
        const p = normalize(scores, keys);
        const best = keys.reduce((a, b) => (p[b] > p[a] ? b : a));
        out[id] = { type: "choice", choice: best, probabilities: p, confidence: Math.min(0.6, p[best]) };
      } else if (q.type === "score") {
        const mid = Math.floor((q.criteria.length - 1) / 2);
        out[id] = { type: "score", score: mid, confidence: 0.2, probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), 1 / q.criteria.length])) };
      } else {
        out[id] = { type: "noul", noul: 0.5 };
      }
    }
    return out;
  }
}

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

export async function getDecider(settings: Settings, userId?: string): Promise<Decider> {
  if (settings.decider === "rules") return new RulesDecider();
  if (settings.decider === "jev") {
    const issue = classifierIssue(settings.jevFormat ?? "typesafe", settings.jevModel, settings.jevUrl || JEV_URL);
    if (issue) throw new DeciderError(issue);
    let key: string | null = null;
    try { key = await host().enclave.get(JEV_KEY, userId); } catch { /* enclave unavailable */ }
    const url = settings.jevUrl?.trim() || JEV_URL;
    // TypeSafe needs a key; a self-hosted endpoint may not.
    if (settings.jevFormat === "openai") return new ChatEndpointDecider(key ?? "", settings.jevModel, url);
    if (key || url !== JEV_URL) return new JevDecider(key ?? "", settings.jevModel, url);
  }
  return new LlmDecider(settings, userId);
}

export type { Answer };

const fallbackNotices = new Map<string, string>();
/** Gameplay must still resolve an explicit action when classifier setup is invalid. */
export async function getTurnDecider(settings: Settings, userId?: string): Promise<Decider> {
  try {
    const decider = await getDecider(settings, userId);
    fallbackNotices.delete(userId ?? "_");
    return decider;
  } catch (error) {
    logError("decision model setup", error);
    const reason = error instanceof Error ? error.message : String(error);
    const key = userId ?? "_";
    if (fallbackNotices.get(key) !== reason) {
      fallbackNotices.set(key, reason);
      toast("warning", `Using rulebook outcomes because the decision model isn't configured: ${reason}`, userId);
    }
    return new RulesDecider();
  }
}
