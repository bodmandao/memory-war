import type { AgentVerifyResult, Challenge, Claim, DemoStep, DemoTrace, Health, Investigator } from "./types";

const INDEXER_BASE = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:4400";
// Always same-origin, proxied server-side by app/api/demo/[...path]/route.ts —
// the real demo server URL and its shared secret are server-only env vars
// (DEMO_UPSTREAM_URL / DEMO_API_KEY), never exposed to the browser.
const DEMO_BASE = "/api/demo";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new ApiError(`could not reach ${new URL(url).host}`, url);
  }
  if (!res.ok) throw new ApiError(`${url} → HTTP ${res.status}`, url);
  return res.json();
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`could not reach ${new URL(url).host}`, url);
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(payload?.error ?? `${url} → HTTP ${res.status}`, url);
  }
  return res.json();
}

/**
 * Reads a newline-delimited-JSON scenario stream, calling `onStep` for
 * each real step the instant the server produces it, instead of waiting
 * for the whole run to finish. `signal` lets the caller stop *watching*
 * a run early — it does not and cannot undo already-submitted on-chain
 * transactions, which is why there's no server-side "abort" call here.
 */
async function streamScenario(url: string, onStep: (step: DemoStep) => void, signal?: AbortSignal): Promise<DemoTrace> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new ApiError("cancelled", url);
    throw new ApiError(`could not reach ${new URL(url, window.location.origin).host}`, url);
  }
  if (!res.body) throw new ApiError(`${url} → no response body`, url);
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(payload?.error ?? `${url} → HTTP ${res.status}`, url);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: DemoTrace | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineAt: number;
      while ((newlineAt = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineAt);
        buffer = buffer.slice(newlineAt + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line) as { type: "step"; step: DemoStep } | { type: "done"; trace: DemoTrace } | { type: "error"; error: string };
        if (msg.type === "step") onStep(msg.step);
        else if (msg.type === "done") result = msg.trace;
        else if (msg.type === "error") throw new ApiError(msg.error, url);
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new ApiError("cancelled", url);
    throw err;
  }
  if (result === null) throw new ApiError(`${url} → stream ended without a result`, url);
  return result;
}

export const api = {
  health: () => getJson<Health>(`${INDEXER_BASE}/health`),
  claims: () => getJson<{ claims: Claim[] }>(`${INDEXER_BASE}/claims`),
  claim: (id: string) => getJson<{ claim: Claim; challenges: Challenge[] }>(`${INDEXER_BASE}/claims/${id}`),
  challenge: (id: string) => getJson<{ challenge: Challenge }>(`${INDEXER_BASE}/challenges/${id}`),
  content: (hash: string) => getJson<{ hash: string; mode: string; verified: boolean; text: string }>(`${INDEXER_BASE}/content/${hash}`),
  rebuild: () => postJson<{ ok: boolean; error: string | null; eventCount: number }>(`${INDEXER_BASE}/rebuild`),
  investigators: () => getJson<{ investigators: Investigator[] }>(`${INDEXER_BASE}/investigators`),
  investigator: (id: string) => getJson<{ investigator: Investigator; calibration: Investigator["calibration"] }>(`${INDEXER_BASE}/investigators/${id}`),
  runTamper: (onStep: (step: DemoStep) => void, signal?: AbortSignal) => streamScenario(`${DEMO_BASE}/run/tamper`, onStep, signal),
  runScenarioA: (onStep: (step: DemoStep) => void, signal?: AbortSignal) => streamScenario(`${DEMO_BASE}/run/a`, onStep, signal),
  runScenarioB: (onStep: (step: DemoStep) => void, signal?: AbortSignal) => streamScenario(`${DEMO_BASE}/run/b`, onStep, signal),
  runScenarioC: (onStep: (step: DemoStep) => void, signal?: AbortSignal) => streamScenario(`${DEMO_BASE}/run/c`, onStep, signal),
  verifyClaim: (input: { claim: string; evidence?: string[]; counterClaim?: string }) =>
    postJson<AgentVerifyResult>(`${DEMO_BASE}/agent/verify-claim`, input),
};

export const endpoints = { INDEXER_BASE, DEMO_BASE };
