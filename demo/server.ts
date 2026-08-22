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
import { runScenarioA, runScenarioB, runTamperDemo } from "./lib.js";

const PORT = Number(process.env.DEMO_SERVER_PORT ?? 4401);
const app = express();
app.use(cors());

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

app.listen(PORT, () => {
  console.log(`Demo driver listening on :${PORT} — POST /run/tamper, /run/a, /run/b`);
});
