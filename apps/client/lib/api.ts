import type { AgentVerifyResult, Challenge, Claim, DemoTrace, Health, Investigator } from "./types";

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

export const api = {
  health: () => getJson<Health>(`${INDEXER_BASE}/health`),
  claims: () => getJson<{ claims: Claim[] }>(`${INDEXER_BASE}/claims`),
  claim: (id: string) => getJson<{ claim: Claim; challenges: Challenge[] }>(`${INDEXER_BASE}/claims/${id}`),
  challenge: (id: string) => getJson<{ challenge: Challenge }>(`${INDEXER_BASE}/challenges/${id}`),
  content: (hash: string) => getJson<{ hash: string; mode: string; verified: boolean; text: string }>(`${INDEXER_BASE}/content/${hash}`),
  rebuild: () => postJson<{ ok: boolean; error: string | null; eventCount: number }>(`${INDEXER_BASE}/rebuild`),
  investigators: () => getJson<{ investigators: Investigator[] }>(`${INDEXER_BASE}/investigators`),
  investigator: (id: string) => getJson<{ investigator: Investigator; calibration: Investigator["calibration"] }>(`${INDEXER_BASE}/investigators/${id}`),
  runTamper: () => postJson<DemoTrace>(`${DEMO_BASE}/run/tamper`),
  runScenarioA: () => postJson<DemoTrace>(`${DEMO_BASE}/run/a`),
  runScenarioB: () => postJson<DemoTrace>(`${DEMO_BASE}/run/b`),
  runScenarioC: () => postJson<DemoTrace>(`${DEMO_BASE}/run/c`),
  verifyClaim: (input: { claim: string; evidence?: string[]; counterClaim?: string }) =>
    postJson<AgentVerifyResult>(`${DEMO_BASE}/agent/verify-claim`, input),
};

export const endpoints = { INDEXER_BASE, DEMO_BASE };
