// Decision providers. Both answer the same typed questions (CORE-CUT: Jev stays only through the same
// questions and interface). Jev (TypeSafe's classifier, or any service with the same API) answers them
// natively; without it the helper LLM imitates one in a single batched call.

import type { GenerationResponseDTO } from "lumiverse-spindle-types";
import type { Answer, Answers, Decider, DecideOptions, Questions } from "../engine/decide.js";
import type { Settings } from "../shared/protocol.js";
import { classifierIssue } from "../shared/classifier-config.js";
import { host, logError, toast } from "./host.js";

export const JEV_KEY = "jev_api_key";
export const JEV_URL = "https://api.typesafe.ai/v1/systemone";

export class DeciderError extends Error {}

export type AskOptions = DecideOptions & { timeoutMs?: number };

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

  async ask(state: unknown, questions: Questions, opts: AskOptions = {}): Promise<Answers> {
    if (!Object.keys(questions).length) return {};
    const issue = classifierIssue(undefined, this.model, this.url);
    if (issue) throw new DeciderError(issue);
    const body = JSON.stringify({ model: this.model || "jev-latest", state, questions });
    const who = this.url === JEV_URL ? "Jev" : "The classifier";
    const parsed = JSON.parse(await postJson(this.url || JEV_URL, this.key, body, opts.timeoutMs ?? 8000, who, opts.signal)) as { answers?: Answers };
    return parsed.answers ?? {};
  }
}

// ───────────────────────── the helper LLM as a classifier ─────────────────────────

export function firstJson(text: string): Record<string, unknown> | null {
  const s = text.replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

/** The questions as plain lines, the same for the classifier prompt and the post-reply writer. */
export function questionLines(questions: Questions): string {
  return Object.entries(questions).map(([id, q]) => {
    if (q.type === "choice") return `${id} (choice): ${q.instructions}\n${Object.entries(q.criteria).map(([k, v]) => `    "${k}": ${v}`).join("\n")}`;
    if (q.type === "score") return `${id} (score 0–${q.criteria.length - 1}): ${q.instructions}\n${q.criteria.map((c, i) => `    ${i}: ${c}`).join("\n")}`;
    return `${id} (yes/no): ${q.instructions}`;
  }).join("\n\n");
}

/** How the answers are written back (shared with the writer's `answers` object). */
export const ANSWER_FORMAT = [
  '  choice → {"choice": "<option key>", "confidence": 0.0–1.0}',
  '  score  → {"level": <integer>, "confidence": 0.0–1.0}',
  '  yes/no → {"p": <probability it is true, 0.0–1.0>}',
].join("\n");

/** A missing answer means the first option, the lowest level, or "no": the safe default every interpreter assumes. */
export const SPARSE_RULE = "You may leave a question out: that means its first option, its lowest level, or no.";

/** The typed questions as a chat prompt any model can answer with JSON. */
export function typedPrompt(state: unknown, questions: Questions, opts: { sparse?: boolean } = {}): { system: string; user: string } {
  const system = [
    "You answer typed questions about a roleplay game's current situation. You never write story.",
    opts.sparse ? SPARSE_RULE : "Answer every question.",
    "Reply with JSON only, one key per question id:",
    ANSWER_FORMAT,
    "Be honest about confidence: 0.5 means a coin flip.",
  ].join("\n");
  const user = `State:\n${typeof state === "string" ? state : JSON.stringify(state, null, 1)}\n\nQuestions:\n${questionLines(questions)}`;
  return { system, user };
}

/** A model's JSON answers, read back into typed answers (anything malformed is left out = the default). */
export function typedAnswers(raw: Record<string, unknown>, questions: Questions): Answers {
  const out: Answers = {};
  for (const id of Object.keys(questions)) {
    const q = questions[id];
    const a = raw[id];
    if (a === undefined || a === null) continue;
    // A bare value ("bold", 2, 0.8) is accepted too: writers often shorten.
    const o = (typeof a === "object" ? a : q.type === "choice" ? { choice: a } : q.type === "score" ? { level: a } : { p: a }) as Record<string, unknown>;
    const conf = clamp01(Number(o.confidence ?? 0.6));
    if (q.type === "choice") {
      const keys = Object.keys(q.criteria);
      const pick = typeof o.choice === "string" && keys.includes(o.choice) ? o.choice : null;
      if (!pick) continue;
      const rest = keys.length > 1 ? (1 - conf) / (keys.length - 1) : 0;
      out[id] = { type: "choice", choice: pick, confidence: conf, probabilities: Object.fromEntries(keys.map((k) => [k, k === pick ? conf : rest])) };
    } else if (q.type === "score") {
      const n = q.criteria.length;
      const raw = Number(o.level ?? o.score);
      if (!Number.isFinite(raw)) continue;
      const level = Math.max(0, Math.min(n - 1, Math.round(raw)));
      const rest = n > 1 ? (1 - conf) / (n - 1) : 0;
      out[id] = { type: "score", score: level, confidence: conf, probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), i === level ? conf : rest])) };
    } else {
      const v = o.p ?? o.probability ?? o.noul;
      const p = typeof v === "boolean" ? (v ? 0.9 : 0.1) : Number(v);
      if (Number.isFinite(p)) out[id] = { type: "noul", noul: clamp01(p) };
    }
  }
  return out;
}

/** The helper LLM answering typed questions in one call (temperature 0). */
export class LlmDecider implements Decider {
  readonly id = "llm" as const;
  readonly canWrite = true;
  constructor(private settings: Settings, private userId?: string) {}

  async ask(state: unknown, questions: Questions, opts: AskOptions = {}): Promise<Answers> {
    const ids = Object.keys(questions);
    if (!ids.length) return {};
    const { system, user } = typedPrompt(state, questions);
    const timeout = AbortSignal.timeout(Math.max(1, opts.timeoutMs ?? 20000));
    const res = (await host().generate.quiet({
      type: "quiet",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      connection_id: this.settings.helperConnectionId || undefined,
      reasoning: { source: "off" },
      parameters: { temperature: 0, max_tokens: 60 + ids.length * 30 },
      userId: this.userId,
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    })) as GenerationResponseDTO | string;
    return typedAnswers(firstJson(typeof res === "string" ? res : res?.content ?? "") ?? {}, questions);
  }
}

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

/** Jev when it is chosen and usable (a key, or a self-hosted URL that needs none); otherwise the helper LLM. */
export async function getDecider(settings: Settings, userId?: string): Promise<Decider> {
  if (settings.decider === "jev") {
    const url = settings.jevUrl?.trim() || JEV_URL;
    const issue = classifierIssue(undefined, settings.jevModel, url);
    if (issue) throw new DeciderError(issue);
    let key: string | null = null;
    try { key = await host().enclave.get(JEV_KEY, userId); } catch { /* enclave unavailable */ }
    // TypeSafe needs a key; a self-hosted endpoint may not.
    if (key || url !== JEV_URL) return new JevDecider(key ?? "", settings.jevModel, url);
  }
  return new LlmDecider(settings, userId);
}

export type { Answer };

const fallbackNotices = new Map<string, string>();
/** The turn's decider. A broken Jev setup falls back to the helper LLM (with one toast), so play goes on. */
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
      toast("warning", `Jev isn't set up, so the helper model answers instead: ${reason}`, userId);
    }
    return new LlmDecider(settings, userId);
  }
}
