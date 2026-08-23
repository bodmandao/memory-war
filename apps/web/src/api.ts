const INDEXER_BASE = (import.meta as any).env?.VITE_INDEXER_URL ?? "http://localhost:4400";
const DEMO_BASE = (import.meta as any).env?.VITE_DEMO_URL ?? "http://localhost:4401";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function postJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

export const api = {
  health: () => getJson<any>(`${INDEXER_BASE}/health`),
  claims: () => getJson<{ claims: any[] }>(`${INDEXER_BASE}/claims`),
  claim: (id: string) => getJson<any>(`${INDEXER_BASE}/claims/${id}`),
  challenge: (id: string) => getJson<any>(`${INDEXER_BASE}/challenges/${id}`),
  content: (hash: string) => getJson<any>(`${INDEXER_BASE}/content/${hash}`),
  rebuild: () => postJson<any>(`${INDEXER_BASE}/rebuild`),
  runTamper: () => postJson<any>(`${DEMO_BASE}/run/tamper`),
  runScenarioA: () => postJson<any>(`${DEMO_BASE}/run/a`),
  runScenarioB: () => postJson<any>(`${DEMO_BASE}/run/b`),
};
