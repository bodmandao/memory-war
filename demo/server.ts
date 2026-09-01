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
app.set("trust proxy", true); // behind Railway/Render/etc., so req.ip is the real caller, not the platform's proxy
app.use(cors());
app.use(express.json());

/**
 * Every route below either drives real transactions from a real funded
 * wallet (/run/*, /agent/verify-claim), so an unauthenticated public
 * deployment of this server is a real spend vector, not just a demo
 * inconvenience. If DEMO_API_KEY is set, every write route requires a
 * matching `X-Demo-Key` header; if it's unset (the local-devnet default)
 * auth is skipped entirely so `npm run demo:server` keeps working with
 * zero setup. A tiny in-memory per-IP sliding window backs it up even
 * with a valid key, since a leaked key shouldn't mean unlimited spend
 * either — this is a demo relayer, not production rate-limiting
 * infrastructure, and resets on every restart.
 */
const DEMO_API_KEY = process.env.DEMO_API_KEY;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const requestLog = new Map<string, number[]>();

function requireAuthAndRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (DEMO_API_KEY && req.header("x-demo-key") !== DEMO_API_KEY) {
    return res.status(401).json({ error: "missing or invalid X-Demo-Key header" });
  }
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const recent = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: `rate limit: max ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 60000} minutes per caller` });
  }
  recent.push(now);
  requestLog.set(ip, recent);
  next();
}

/**
 * Every route below drives real transactions from the SAME handful of
 * shared local-devnet keys (LOCAL_DEVNET_KEYS in lib.ts) — there is no
 * per-agent wallet in this demo-relayer design (documented in
 * docs/AUDIT.md). Two genuinely concurrent requests each fetch a
 * fresh "pending" nonce for the same address and race: one lands, the
 * other fails with "nonce too low". That failure was always surfaced
 * honestly (a 500, never a fabricated success) — but it made ordinary
 * concurrent agent traffic fail needlessly, found by testing exactly
 * that (kill-test §hostile audit "concurrent requests"). Serializing
 * writes through one process-wide queue is the smallest fix that
 * doesn't pretend the shared-key architecture is something it isn't:
 * a production deployment gives each agent its own wallet instead.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * Streams each real step as the scenario function actually produces it
 * (newline-delimited JSON), instead of buffering the whole trace until
 * the run finishes — a full run can take a genuine while (real chain
 * confirmations, real 0G Compute calls), and a single static "running…"
 * message for the entire duration hid that real progress was happening.
 * Once a run is queued via `serialized`, already-submitted transactions
 * can't be safely unwound if the client disconnects, so the server keeps
 * running it to completion regardless — a client-side "cancel" only
 * stops watching, it never claims to undo real on-chain effects.
 */
function streamScenario(res: express.Response, runner: (onStep: (step: import("./lib.js").DemoStep) => void) => Promise<import("./lib.js").DemoTrace>) {
  res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache", "x-accel-buffering": "no" });
  const onStep = (step: import("./lib.js").DemoStep) => res.write(`${JSON.stringify({ type: "step", step })}\n`);
  serialized(() => runner(onStep))
    .then((trace) => res.end(`${JSON.stringify({ type: "done", trace })}\n`))
    .catch((err) => res.end(`${JSON.stringify({ type: "error", error: err instanceof Error ? err.message : String(err) })}\n`));
}

app.post("/run/tamper", requireAuthAndRateLimit, (_req, res) => streamScenario(res, runTamperDemo));
app.post("/run/a", requireAuthAndRateLimit, (_req, res) => streamScenario(res, runScenarioA));
app.post("/run/b", requireAuthAndRateLimit, (_req, res) => streamScenario(res, runScenarioB));
app.post("/run/c", requireAuthAndRateLimit, (_req, res) => streamScenario(res, runScenarioC));

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
 * either way. Requests queue (see `serialized` above) rather than
 * racing each other's nonces; a failure is always a real HTTP error,
 * never a fabricated success.
 */
app.post("/agent/verify-claim", requireAuthAndRateLimit, async (req, res) => {
  const body = req.body as Partial<AgentVerifyInput>;
  if (!body.claim || typeof body.claim !== "string" || body.claim.trim().length === 0) {
    return res.status(400).json({ error: "body.claim (non-empty string) is required" });
  }
  if (body.evidence !== undefined && !Array.isArray(body.evidence)) {
    return res.status(400).json({ error: "body.evidence, if present, must be an array of strings" });
  }
  try {
    const result = await serialized(() =>
      agentVerifyClaim({ claim: body.claim!, evidence: Array.isArray(body.evidence) ? body.evidence : [], counterClaim: body.counterClaim }),
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Demo driver listening on :${PORT} — POST /run/tamper, /run/a, /run/b, /run/c, /agent/verify-claim`);
});
