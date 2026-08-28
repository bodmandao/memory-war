/**
 * A tiny dedicated "demo driver" HTTP service — separate from the
 * indexer (which stays read-only and chain-derived, spec §5) — so the
 * frontend's "run demo" buttons trigger the exact same lib.ts code
 * path as the CLI scripts. One implementation, three entry points
 * (CLI, this server, tests would be a fourth) — nothing about what the
 * browser demo does is different from what `npm run demo:b` does.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { runScenarioA, runScenarioB, runScenarioC, runTamperDemo, agentVerifyClaim, type AgentVerifyInput } from "./lib.js";

const PORT = Number(process.env.DEMO_SERVER_PORT ?? 4401);
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/run/tamper", async (_req, res) => {
  try {
    res.json(await runTamperDemo());
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/run/a", async (_req, res) => {
  try {
    res.json(await runScenarioA());
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/run/b", async (_req, res) => {
  try {
    res.json(await runScenarioB());
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/run/c", async (_req, res) => {
  try {
    res.json(await runScenarioC());
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * The agent-facing entry point (spec Priority 4 / §3):
 *   POST /agent/verify-claim { claim, evidence: [...], counterClaim? }
 * runs the full pay -> investigate -> attest -> resolve pipeline and
 * returns the structured, independently-auditable result. This is a
 * demo-scale relayer: it uses this service's own funded local-devnet
 * keys to pay fees and settle transactions on the calling agent's
 * behalf, rather than requiring the agent to hold and sign with its
 * own key over HTTP — the honest scope for this build (see
 * docs/AUDIT.md). The economic actions it performs (paying a
 * verification fee, paying investigators) are real on-chain transfers
 * either way.
 */
app.post("/agent/verify-claim", async (req, res) => {
  const body = req.body as Partial<AgentVerifyInput>;
  if (!body.claim || typeof body.claim !== "string") {
    return res.status(400).json({ error: "body.claim (string) is required" });
  }
  try {
    const result = await agentVerifyClaim({ claim: body.claim, evidence: Array.isArray(body.evidence) ? body.evidence : [], counterClaim: body.counterClaim });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Demo driver listening on :${PORT} — POST /run/tamper, /run/a, /run/b, /run/c, /agent/verify-claim`);
});
