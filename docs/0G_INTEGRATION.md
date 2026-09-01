# 0G integration — status and rationale

## Current status (verified live, not aspirational)

| Rail | Status | Network | Evidence |
|---|---|---|---|
| Chain | **LIVE** | Mainnet (`16661`) | `MemoryWarRegistry` at `0x20eC53851DcDcA67Ae8340c9962baCedaF63aD83`, bytecode/state independently read back post-deploy |
| Storage | **LIVE** | Mainnet | Real bytes uploaded to `indexer-storage-turbo.0g.ai`, downloaded back byte-for-byte, twice |
| Compute | **LIVE**, TEE-attested | Testnet (deliberately, see below) | `broker.inference.processResponse()` independently returned `true` for a real response |
| Payments / settlement | **LIVE**, on-chain | Mainnet | A full pay-per-verification lifecycle resolved `TRUE` with two investigators paid atomically in the verdict transaction |
| DA | **Not yet completed** | — | Real batching math (`daBatch.ts`) is prepared; the live network call is not — no official 0G DA SDK exists yet, so it is not claimed as an integration |
| ERC-7857 | Not used, on purpose | — | See `ERC7857_DECISION.md` |

Full narrative, exact transaction hashes, and every bug found and fixed
while getting each of these live: `docs/AUDIT.md`, Addenda 6–8. The
sections below are the original design rationale from the pass that
built this integration; they remain accurate and are not restated here.

## What this document originally covered

This document covers the implementation pass that made MEMORY WAR more
deeply integrated with the 0G ecosystem without touching the core
protocol invariants (predicate normalization, typed challenges, the
evidence DAG, independent investigation, dissent-preserving verdicts,
supersession, bi-temporal history, no protocol token). Those are all
untouched and still fully covered by the original test suite — see
`docs/AUDIT.md` for that baseline.

## Priority 1 — payment

**There is no separately-published "0G Pay" SDK to integrate against.**
Research for this pass found no public `0G Pay` package or API —
what 0G actually ships today is the Compute Router's own ledger
(`broker.ledger.depositFund`/`transferFund`, already wired in
`zg-adapters/compute.ts`) and an announced-but-not-yet-public
micropayments layer ("0g402", evidently x402-shaped). Building against
either an SDK that doesn't exist, or an x402 facilitator that doesn't
support 0G Chain yet, would be exactly the cosmetic integration the
brief warned against.

**What was built instead is the real, live rail**: native on-chain
value settlement on 0G Chain, the same currency the existing challenge
bond already used.

- `MemoryWarRegistry.requestVerification(claimId)` — an agent pays a
  verification fee with no adversary and no dispute (spec: "an agent
  paying for an investigation"). No liveness window; the pipeline goes
  straight to evidence → investigation → resolution.
- `_settleBond` now pays investigators their execution fee **out of the
  pool first, regardless of verdict** (100% for a verification
  request, 20% for an adversarial challenge, the rest following the
  existing win/lose rule) — spec §10's "investigator pay is
  deliberately not outcome-contingent," finally made real instead of
  aspirational.
- `packages/protocol-core/src/payment.ts` mirrors this math off-chain,
  pure and tested, so a caller can predict the exact payout before
  sending a transaction.
- Demonstrated end to end in Scenario C (`npm run demo:c`) and the
  agent-facing API below — real wei, real balance changes, verified by
  querying account balances before/after `resolve()` on a live local
  chain.

## Priority 2 — investigator identity: ERC-8004-shaped, not ERC-7857

Investigated and rejected ERC-7857 for this role — full reasoning in
[`ERC7857_DECISION.md`](ERC7857_DECISION.md). Short version: ERC-7857
makes intelligence a private, transferable secret; an investigator's
value is the opposite — public, auditable, non-transferable identity.
Built `contracts/contracts/InvestigatorRegistry.sol` instead: a
persistent `investigatorId` that survives key rotation
(`rotateController`) and records explicit version lineage (`parentId`).
`MemoryWarRegistry.submitReportAsIdentity` links a report to this
identity only when the caller controls it. The indexer computes
calibration (agreed/disagreed/pending, contested-case involvement) at
read time from the identity's linked reports — `GET /investigators` and
`GET /investigators/:id`.

## Priority 3 — 0G DA: investigated, not wired in

Full reasoning in [`DA_DECISION.md`](DA_DECISION.md). Short version:
MEMORY WAR's evidence is already individually content-addressed and
verifiable — that's not a DA problem. The real future case (batching
many claim/investigation events at high agent-driven throughput) got a
real, tested mechanism —
`packages/protocol-core/src/daBatch.ts` (`computeBatchCommitment`,
`shouldBatchForDA`) — with no network call wired up, because no
official 0G DA TypeScript client exists to call for real as of this
build.

## Priority 4 — agent-facing API

`demo/server.ts`'s `POST /agent/verify-claim` runs the exact pipeline
above against caller-supplied `{ claim, evidence[], counterClaim? }`
and returns:

```json
{
  "verdict": "TRUE",
  "confidence": 0.7,
  "evidenceRoot": "0x...",
  "investigationId": "0x...",
  "investigators": [{ "address": "0x...", "investigatorId": "0x...", "modelProvider": "...", "verdict": "SUPPORTS", "attestation": { "mode": "0G_COMPUTE_TEE", "verified": true, "detail": "..." } }],
  "attestation": { "anyLiveTee": true, "modes": ["0G_COMPUTE_TEE", "0G_COMPUTE_TEE"] },
  "payment": { "feeWei": "2000000000000000", "payouts": [{ "investigator": "0x...", "amountWei": "1000000000000000" }] },
  "history": { "claimId": "0x...", "onChainTxHash": "0x...", "queryUrl": "/claims/0x..." }
}
```

This is the shape a genuinely TEE-verified run returns — see the
resolved mainnet case in `README.md` → Mainnet Deployment for a real
example with real values instead of placeholders. `anyLiveTee`/`modes`
degrade honestly to `false`/`SIMULATED` or `LOCAL_LLM` whenever a report
didn't actually earn live TEE verification — never upgraded past what
ran, per the honesty contract in `docs/ARCHITECTURE.md`.

Every field is independently re-derivable from chain state via the
indexer — this endpoint is a convenience orchestrator (a demo-scale
relayer using this service's own funded keys, documented honestly in
`docs/AUDIT.md`), not a hidden source of truth.
