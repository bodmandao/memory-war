import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import express from "express";
import cors from "cors";
import { JsonRpcProvider } from "ethers";
import { ZgStorageAdapter } from "@memory-war/zg-adapters";
import { rebuildFromChain, emptyState, type ProtocolState } from "./eventStore.js";

// Load the monorepo-root .env regardless of which directory `npm run
// --workspace=...` happened to set as cwd — this bit us once already
// (see docs/AUDIT.md).
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "..", "..", "..", ".env") });

const PORT = Number(process.env.INDEXER_PORT ?? 4400);
const RPC_URL = process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.MEMORY_WAR_CONTRACT_ADDRESS;
const INVESTIGATOR_REGISTRY_ADDRESS = process.env.INVESTIGATOR_REGISTRY_ADDRESS ?? null;

const provider = new JsonRpcProvider(RPC_URL);
const storage = new ZgStorageAdapter();

let state: ProtocolState = emptyState();
let lastRebuildError: string | null = null;
let lastRebuildAt = 0;

async function rebuild() {
  if (!CONTRACT_ADDRESS) {
    lastRebuildError = "MEMORY_WAR_CONTRACT_ADDRESS not set — nothing deployed yet";
    return;
  }
  try {
    state = await rebuildFromChain(provider, CONTRACT_ADDRESS, INVESTIGATOR_REGISTRY_ADDRESS, 0);
    lastRebuildError = null;
    lastRebuildAt = Date.now();
  } catch (err) {
    lastRebuildError = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Calibration is computed at read time, never stored: for every report
 * an investigator identity has linked (submitReportAsIdentity), compare
 * that report's own verdict against the case's FINAL resolved verdict.
 * Trivial/unanimous cases and genuinely CONTESTED ones both count —
 * spec §9 "reputation farming": we don't currently weight by
 * contestedness here (that's a should-have, see docs/AUDIT.md), but we
 * do keep raw agree/disagree/pending counts auditable from first
 * principles rather than as an opaque score.
 */
function calibrationOf(investigatorId: string) {
  const inv = state.investigators.get(investigatorId);
  if (!inv) return null;
  let agreed = 0,
    disagreed = 0,
    pending = 0,
    contested = 0;
  const investigations = inv.linkedReports.map(({ challengeId }) => {
    const challenge = state.challenges.get(challengeId);
    const report = challenge?.reports.find((r) => r.investigatorId === investigatorId);
    const verdictLabel = report ? (["INSUFFICIENT_EVIDENCE", "SUPPORTS", "REJECTS"][report.verdict] ?? String(report.verdict)) : null;
    if (!challenge?.verdict) {
      pending += 1;
    } else {
      if (challenge.verdict.status === "CONTESTED") contested += 1;
      const finalTrue = challenge.verdict.status === "TRUE";
      const finalFalse = challenge.verdict.status === "FALSE";
      const reportSupported = report?.verdict === 1;
      const reportRejected = report?.verdict === 2;
      if ((finalTrue && reportSupported) || (finalFalse && reportRejected)) agreed += 1;
      else if (finalTrue || finalFalse) disagreed += 1;
      else pending += 1; // SUPERSEDED / INCONCLUSIVE — not a calibration signal either way
    }
    return { claimId: challenge?.claimId ?? null, challengeId, reportVerdict: verdictLabel, finalVerdict: challenge?.verdict?.status ?? null };
  });
  return { investigatorId, agreed, disagreed, pending, contestedInvolvement: contested, totalInvestigations: investigations.length, investigations };
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    note: "This service is NOT authoritative — everything below is reconstructed from on-chain events (spec §5). Deleting this process and restarting it reproduces identical state.",
    contractAddress: CONTRACT_ADDRESS ?? null,
    investigatorRegistryAddress: INVESTIGATOR_REGISTRY_ADDRESS,
    rpcUrl: RPC_URL,
    lastRebuildAt: lastRebuildAt || null,
    lastRebuildError,
    eventCount: state.eventCount,
    lastIndexedBlock: state.lastBlock,
  });
});

app.post("/rebuild", async (_req, res) => {
  await rebuild();
  res.json({ ok: !lastRebuildError, error: lastRebuildError, eventCount: state.eventCount });
});

app.get("/claims", (_req, res) => {
  res.json({ claims: [...state.claims.values()] });
});

app.get("/claims/:id", (req, res) => {
  const claim = state.claims.get(req.params.id);
  if (!claim) return res.status(404).json({ error: "claim not found in indexed state" });
  const challenges = claim.challengeIds.map((id) => state.challenges.get(id)).filter(Boolean);
  res.json({ claim, challenges });
});

app.get("/challenges/:id", (req, res) => {
  const challenge = state.challenges.get(req.params.id);
  if (!challenge) return res.status(404).json({ error: "challenge not found in indexed state" });
  res.json({ challenge });
});

/** Priority-2: portable investigator identity — list every registered identity with its calibration. */
app.get("/investigators", (_req, res) => {
  const investigators = [...state.investigators.values()].map((inv) => ({ ...inv, calibration: calibrationOf(inv.id) }));
  res.json({ investigators });
});

app.get("/investigators/:id", (req, res) => {
  const inv = state.investigators.get(req.params.id);
  if (!inv) return res.status(404).json({ error: "investigator identity not found in indexed state" });
  res.json({ investigator: inv, calibration: calibrationOf(req.params.id) });
});

/**
 * Hydrate full text/content for a content-addressed hash from storage
 * (whichever mode the storage adapter is actually running in — this
 * endpoint reports which one). This is how claim text, evidence text,
 * and investigator reasoning are read back — never stored on-chain.
 */
app.get("/content/:hash", async (req, res) => {
  try {
    const { bytes, mode } = await storage.download(req.params.hash as `0x${string}`);
    const verify = await storage.verify(req.params.hash as `0x${string}`);
    res.json({
      hash: req.params.hash,
      mode,
      verified: verify.ok,
      text: new TextDecoder().decode(bytes),
    });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`MEMORY WAR indexer listening on :${PORT} (read-only — see /health)`);
  rebuild();
  setInterval(rebuild, 3000);
});
