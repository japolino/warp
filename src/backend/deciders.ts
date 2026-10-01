// Decision providers. All answer the same typed questions; only Jev is a true
// System-1 model. The LLM provider imitates it in one batched call, and the
// rules provider never calls anything (and is deliberately unsure of itself).

import type { GenerationResponseDTO } from "lumiverse-spindle-types";
import { decodeAnswers, normalize, type Answer, type Answers, type Decider, type DecideOptions, type Questions } from "../engine/decide.js";
import type { Settings } from "../shared/protocol.js";
import { host } from "./host.js";
import { backoff, withDeadline } from "./deadline.js";

export const JEV_KEY = "jev_api_key";
const JEV_URL = "https://api.typesafe.ai/v1/systemone";

export class DeciderError extends Error {}

// ───────────────────────── Jev ─────────────────────────

interface HttpResult { status: number; body: string }

async function post(url: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<HttpResult> {
  signal.throwIfAborted();
  // Prefer the host proxy (sanctioned network path for extensions); fall back to fetch where allowed.
  const call = (async (): Promise<HttpResult> => {
    try {
      const r = (await host().cors(url, { method: "POST", headers, body })) as { status: number; body: string };
      return { status: r.status, body: r.body };
    } catch (e) {
      signal.throwIfAborted();
      if (typeof fetch !== "function") throw e;
      const r = await fetch(url, { method: "POST", headers, body, signal });
      return { status: r.status, body: await r.text() };
    }
  })();
  const result = await call;
  signal.throwIfAborted();
  return result;
}

export class JevDecider implements Decider {
  readonly id = "jev" as const;
  readonly canWrite = false;
  constructor(private key: string, private model: string) {}

  async ask(state: unknown, questions: Questions, opts: DecideOptions = {}): Promise<Answers> {
    if (!Object.keys(questions).length) return {};
    const body = JSON.stringify({ model: this.model || "jev-latest", state, questions });
    const headers = { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" };
    return withDeadline(opts, 8000, async (signal, remaining) => {
    let delay = 400;
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const res = await post(JEV_URL, headers, body, signal);
      if (res.status === 200) {
        const parsed = JSON.parse(res.body) as { answers?: unknown };
        return decodeAnswers(parsed.answers, questions);
      }
      if ((res.status === 429 || res.status === 529) && attempt < 2) {
        if (delay >= remaining()) throw new DeciderError("Decision deadline exceeded during retry");
        await backoff(delay, signal);
        delay *= 3;
        continue;
      }
      const hint = res.status === 401 ? "the Jev API key was rejected" : res.status === 422 ? "Jev rejected the request" : `Jev returned ${res.status}`;
      throw new DeciderError(`${hint}${res.body ? `: ${res.body.slice(0, 200)}` : ""}`);
    }
    });
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

export class LlmDecider implements Decider {
  readonly id = "llm" as const;
  readonly canWrite = true;
  constructor(private settings: Settings, private userId?: string) {}

  async ask(state: unknown, questions: Questions, opts: DecideOptions = {}): Promise<Answers> {
    const ids = Object.keys(questions);
    if (!ids.length) return {};
    const lines = ids.map((id) => {
      const q = questions[id];
      if (q.type === "choice") return `${id} (choice) — ${q.instructions}\n${Object.entries(q.criteria).map(([k, v]) => `    "${k}": ${v}`).join("\n")}`;
      if (q.type === "score") return `${id} (score 0–${q.criteria.length - 1}) — ${q.instructions}\n${q.criteria.map((c, i) => `    ${i}: ${c}`).join("\n")}`;
      return `${id} (yes/no) — ${q.instructions}`;
    });
    const system = [
      "You answer typed questions about a roleplay game's current situation. You never write story.",
      "Answer every question. Reply with JSON only, one key per question id:",
      '  choice → {"choice": "<option key>", "probabilities": {"<every option key>": 0.0–1.0}}',
      '  score  → {"level": <number in range>, "probabilities": {"<every level index>": 0.0–1.0}}',
      '  yes/no → {"p": <probability it is true, 0.0–1.0>}',
      "Each probability distribution must sum to 1. Express uncertainty across plausible alternatives.",
    ].join("\n");
    const user = `State:\n${typeof state === "string" ? state : JSON.stringify(state, null, 1)}\n\nQuestions:\n${lines.join("\n\n")}`;
    return withDeadline(opts, 20000, async (signal) => {
    const res = (await host().generate.quiet({
      type: "quiet",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      connection_id: this.settings.helperConnectionId || undefined,
      reasoning: { source: "off" },
      parameters: { temperature: 0, max_tokens: 100 + ids.reduce((n, id) => n + (questions[id].type === "choice" ? Object.keys((questions[id] as { criteria: object }).criteria).length : 6) * 20, 0) },
      userId: this.userId,
      signal,
    })) as GenerationResponseDTO | string;
    const raw = firstJson(typeof res === "string" ? res : res?.content ?? "") ?? {};
    return decodeAnswers(raw, questions);
    });
  }
}

// ───────────────────────── rules only ─────────────────────────

const STOP = new Set("a an the to of and or in on at for with my i me you your it is be do try tries trying".split(" "));
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** Keyword overlap. Never confident enough to act on its own — at most it suggests. */
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
    let key: string | null = null;
    try { key = await host().enclave.get(JEV_KEY, userId); } catch { /* enclave unavailable */ }
    if (key) return new JevDecider(key, settings.jevModel);
  }
  return new LlmDecider(settings, userId);
}

export type { Answer };
