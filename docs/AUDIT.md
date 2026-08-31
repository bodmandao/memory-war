# Final Audit

> **Addendum 8 — the first fully resolved case on 0G mainnet.** A
> second, independently funded mainnet wallet was provided specifically
> for the `investigatorB` role (`makeChain()` in `demo/lib.ts` now
> checks `INVESTIGATOR_B_PRIVATE_KEY` for that one role and falls back
> to the shared demo-relayer key otherwise — nothing else changed).
> With two genuinely distinct investigator addresses, the exact
> `DuplicateReport` wall from Addendum 7 no longer applies, and a full
> pay-per-verification lifecycle completed on real 0G mainnet end to
> end: claim → payment → evidence → two independent TEE-verified
> reports (one per address) → mechanical resolution (`TRUE`) → atomic
> on-chain settlement (both investigators paid in the same transaction
> as the verdict) → indexer reconstruction → client. Every field below
> was pulled from a direct `eth_getLogs`/contract-read query against
> mainnet, not from the demo script's own printed summary — see the
> final report for the exact claim ID, challenge ID, both investigator
> addresses, and all three transaction hashes. `DuplicateReport`
> protection itself was not touched and remains fully active (confirmed
> by the still-passing `MemoryWarRegistry.test.ts` replay-protection
> case).
>
> **Addendum 7 — judge-readiness pass: client wired to real mainnet
> state, and the demo relayer's real ceiling found.** An eighth pass
> added a live, data-driven "Infrastructure Proof" panel to the landing
> page (network/chain ID derived from the indexer's actual configured
> RPC, contract addresses and storage mode read from a real `/health`
> call — never hardcoded), corrected `0G_COMPUTE_TEE` labeling
> everywhere in the client to say `TESTNET` explicitly (it never did
> before, which technically wasn't wrong but wasn't as precise as it
> should be), and exposed `procedure.{id,version,procedureHash}` on
> `/agent/verify-claim`'s response (already computed by `buildVerdict()`,
> just not returned before).
>
> **The retry protection from Addendum 6 was incomplete — extended it.**
> `findEventInReceipt` only helped once a receipt was already in hand;
> a fresh mainnet run hit `tx.wait()` throwing outright ("no matching
> receipts found: this may indicate potential data corruption") before
> ever returning a receipt at all, which the existing fix couldn't
> catch. Added `waitRobust()`, the same bounded-retry philosophy applied
> to `.wait()` itself, and replaced all 19 remaining direct `.wait()`
> call sites in `demo/lib.ts` with it (verified via search — none
> remain unprotected). Confirmed against 3 clean local-devnet
> `demo:full` runs (no behavior change when nothing is actually flaky)
> and re-verified against real mainnet, where it visibly got the flow
> significantly further than before.
>
> **The real ceiling on completing a resolved claim on mainnet, found
> and precisely diagnosed — not a bug.** After the retry fix, a live
> mainnet run reached real report submission and reverted with a
> genuine on-chain error, decoded by computing every custom error
> selector in the contract and matching: `0xd6247cb5` =
> `DuplicateReport(address investigator, bytes32 challengeId)`. Because
> `investigatorA` and `investigatorB` both resolve to the same shared
> demo-relayer wallet on mainnet (the address the whole build falls
> back to for every role once the network isn't `LOCAL_DEVNET` — the
> already-disclosed single-key limitation), the contract's own replay
> protection correctly and deterministically rejects the second
> investigator's report as a duplicate from the same address, every
> time, regardless of retries. This corrects an assumption from
> Addendum 6: running with one wallet does not just make investigator
> diversity "illustrative" as previously stated — it makes it
> **impossible to reach MIN_REPORTS_REQUIRED with two distinct reports
> at all**, because the second submission is rejected outright. A fully
> resolved claim on mainnet genuinely requires a second, independently
> funded mainnet wallet; provisioning one is a real spending decision,
> not something to force unilaterally. What real mainnet state exists
> from this pass instead: 4 real claims, 2 reaching `INVESTIGATING`
> with a live-uploaded evidence bundle and a real `requestVerification`
> payment each, 6 real `InvestigatorRegistered` identities (3
> anthropic:claude-haiku-4-5, 3 openai:gpt-4o-mini) — all independently
> queryable at `MemoryWarRegistry` `0x20eC53851DcDcA67Ae8340c9962baCedaF63aD83`
> and `InvestigatorRegistry` `0xde4070363ee7B6Ba0ee567929b532489a3b4A8f4`.
>
> **Client verified against this real, if sparse, mainnet state — not
> against a synthetic fixture.** All 8 routes served 200 against the
> live indexer (real `/health.storageMode: "0G_STORAGE_LIVE"`, real
> event count growing across the pass as the RPC caught up), including
> a real claim detail page and a real investigator detail page. The
> empty/sparse states (0 investigators before registrations landed, an
> OPEN claim with no challenge) rendered honestly rather than needing
> any special-casing — exactly the property the whole honesty-labeling
> design exists for.
>
> **Addendum 6 — real 0G mainnet + testnet deployment.** A seventh pass
> deployed and independently exercised the actual live rails, not just
> configuration. Every claim below was verified by direct query (real
> tx hashes, real `eth_getLogs`/view-function calls), not by trusting a
> script's own printed output.
>
> **Chain — LIVE.** `InvestigatorRegistry` at
> `0xde4070363ee7B6Ba0ee567929b532489a3b4A8f4` and `MemoryWarRegistry`
> at `0x20eC53851DcDcA67Ae8340c9962baCedaF63aD83`, deployed to real 0G
> mainnet (chain ID 16661, `https://evmrpc.0g.ai` — verified against
> docs.0g.ai and a live `eth_chainId` call before use, hardcoded in a
> new `ogMainnet` Hardhat network rather than reusing `CHAIN_RPC_URL`'s
> usual dev/test values). Verified by reading bytecode back from chain,
> confirming `MemoryWarRegistry.investigatorRegistry()` returns the
> correct address, and calling `MIN_REPORTS_REQUIRED()`. Deployment
> gas: 0.0119 OG actual vs. 0.0127 OG estimated.
>
> **0G Storage — LIVE, with a real bug found and fixed.** Uploaded real
> bytes to the live mainnet indexer (`indexer-storage-turbo.0g.ai`,
> distinct from the testnet one), got a real tx hash, downloaded them
> back byte-for-byte, twice. Found in the process: `upload()`'s
> returned `rootHash` was 0G's own network-internal Merkle root (over
> chunked/segmented data), not `contentHashOf(bytes)` — the protocol's
> own canonical hash used everywhere else (`Evidence.id`, on-chain
> `evidenceBundleHash`). On-chain commitments were never affected (they
> never touch storage's rootHash — confirmed by reading
> `evidence.ts`/`demo/lib.ts`), but live-uploaded content would have
> been unretrievable by the identifier the rest of the system actually
> uses, and `verify()`'s tamper-check would have spuriously failed on
> byte-perfect content. Invisible until now because LOCAL_DEMO mode's
> rootHash happens to equal `contentHashOf` by construction. Fixed:
> `upload()` now always returns `contentHashOf(bytes)`, with 0G's own
> root persisted separately (`writeLiveMapping`) purely for retrieval.
> Re-verified against mainnet after the fix — `upload.rootHash` now
> exactly matches `contentHashOf(bytes)`, and `verify().ok === true`.
> New regression test added (`storage.test.ts`).
>
> **0G Compute — LIVE, with two real bugs found and fixed.** Ran a real
> investigation against 0G Compute on testnet (chain ID 16602 —
> deliberately never mainnet: docs.0g.ai's mainnet overview lists no
> compute broker endpoint at all, so compute now reads its own
> `OG_COMPUTE_CHAIN_RPC_URL`/`COMPUTE_PRIVATE_KEY`, falling back to the
> shared chain vars only if unset, so a mainnet deployment wallet can
> never be silently reused for compute). Got a genuine
> `attestation.mode: "0G_COMPUTE_TEE"`, `verified: true` — confirmed via
> `broker.inference.processResponse()` genuinely returning `true` for
> that exact response. Two bugs found along the way: (1) the installed
> SDK exposes a listed service's provider address as `.provider`, not
> `.providerAddress` as the code assumed — confirmed by inspecting a
> real `listService()` response; silently resolved to `undefined` and
> only failed later, inside the SDK's own `transferFund()` ("unsupported
> addressable value"). (2) The internal `ethers.JsonRpcProvider` this
> path creates was never destroyed, leaking a background polling handle
> — same class of bug fixed in `chain.ts`'s `trackedChains` months ago,
> never applied here since live compute had never been exercised. Fixed
> with the same `try/finally` + `.destroy()` pattern. Separately: 0G
> Compute requires a minimum 3.0 OG balance just to create a ledger
> account (`LedgerProcessor.MIN_LEDGER_BALANCE_OG`) — a real funding
> floor, not a bug, confirmed by reading the SDK source directly rather
> than guessing.
>
> **A third, more serious real bug found: `tx.wait()`'s receipt can
> come back with the wrong logs — or, worse, a real 0G mainnet RPC node
> can permanently lose a successful transaction's logs.** First
> manifestation (transient, self-corrected within seconds on manual
> retry): `receipt.logs` empty on the first poll after `tx.wait()`
> resolved, complete on a second query moments later — 0G's own error
> text for a related query admits as much ("no matching receipts
> found: this may indicate potential data corruption"). Fixed with a
> new shared `findEventInReceipt()` helper (replacing five duplicated,
> unprotected `receipt.logs.map(...).find(...)` call sites across
> `demo/lib.ts`) that retries re-fetching the receipt up to 5 times
> before failing loudly — never silently succeeding, never crashing
> with an opaque "Cannot read properties of undefined." **Second
> manifestation, on a later run, was not transient**: a `createClaim`
> transaction mined with `status: 1` (genuine EVM success — the
> contract unconditionally emits `ClaimCreated` on every non-reverting
> path, confirmed by reading `MemoryWarRegistry.sol` directly) but
> **zero logs, permanently** — confirmed 45 blocks later via both a
> direct receipt re-fetch and an independent `eth_getLogs` block-range
> query against the same contract address, both returning nothing. This
> is a genuine data-loss defect in this specific public RPC node, not a
> lag, not a code bug, and not something fixable from this side —
> consistent with docs.0g.ai's own recommendation to use a third-party
> RPC provider (QuickNode/ThirdWeb/Ankr) for production. This is why
> the full multi-step lifecycle (claim → verification request →
> evidence → investigation → resolution → settlement) could not be
> completed end-to-end in one live run against mainnet in this pass —
> each individual rail (chain, storage, compute) was independently
> verified live and working; the orchestrated sequence was blocked by
> this RPC node dropping a transaction's logs outright, which the
> `findEventInReceipt` retry correctly surfaced as a clear, honest
> failure rather than papering over it.
>
> **Payment/settlement:** unchanged from the existing on-chain
> mechanism (verified extensively by the 21-case contract test suite,
> re-run clean against the fresh mainnet-matching compiled bytecode
> before deployment). No separate "0G Pay" SDK exists or was
> fabricated — this remains agent-native on-chain settlement using 0G
> Chain's native token, exactly as previously documented.
>
> **DA and ERC-7857: unchanged, on purpose.** No genuine public 0G DA
> API was found to exist beyond what was already investigated in
> Addendum 1 — `COMMITMENT READY` stands. ERC-7857/Agentic ID was not
> forced into investigator identity; `InvestigatorRegistry.sol` remains
> the correct fit for auditable lineage over encrypted transferable
> intelligence, and nothing found in this pass changes that reasoning.
>
> **Addendum 5 — client rename + art-direction pass.** A sixth pass (1)
> renamed `apps/web` → `apps/client` throughout the repo — package name
> (`@memory-war/web` → `@memory-war/client`), root scripts (`web:dev` →
> `client:dev`, `web:build` → `client:build`, now also wired into `npm
> run typecheck`), README, and the one still-actionable stale command in
> this document; `apps/web` no longer exists anywhere in the tree, and
> `.next/` was added to `.gitignore`; and (2) substantially upgraded the
> client's visual design without touching any backend/protocol/contract
> code: a display typeface (Bricolage Grotesque) for branding/hero tiers
> alongside the existing IBM Plex Sans/Mono; a signature `ProtocolFlow`
> component with per-stage iconography and animated causality; a
> restrained canvas network background on the hero (hard-disabled under
> `prefers-reduced-motion`); the claim detail page rebuilt as a numbered
> 01–08 case-file dossier (`Stage` component) that always shows all
> eight stages in fixed order — pending stages render their real pending
> state rather than being skipped, so numbering never shifts between
> claims; an investigator comparison table; skeleton loading states
> matching each page's real layout; named empty/error states ("No claims
> found", "Indexer unavailable", "Local demonstration mode") replacing
> generic text; a mobile navigation drawer. No new data field is
> invented anywhere — the dossier's pending-stage messaging and the
> resolution "N investigators → verdict" summary are computed from the
> exact same indexer/demo-server responses the previous pass already
> used, just organized and labeled more legibly.
>
> **Environment note, not a code defect.** Verifying this pass hit a
> real build failure worth recording: `next build` kept hanging for
> 10+ minutes on `Found lockfile missing swc dependencies, patching...`,
> which fetches from `registry.npmjs.org` and — separately — on Google
> Fonts retries, both against a registry connection that was timing out
> at the time (confirmed via direct `curl` to `registry.npmjs.org`). A
> full clean reinstall (fresh `node_modules` + regenerated
> `package-lock.json`, which had been missing a complete SWC platform
> entry after this session's own `apps/web` → `apps/client` rename)
> resolved it — the build has been clean since. This was a local
> network/lockfile-consistency issue on the machine doing verification,
> not a defect in the committed code; recorded here only because it's
> exactly the kind of thing this document exists to be honest about.
>
> **Addendum 4 — frontend/productization pass.** A fifth pass replaced
> `apps/web` (a small hand-rolled Vite/DOM console — 3 files, no
> routing) with a proper Next.js App Router application: a landing
> dashboard with live indexed stats, a claims explorer with filters, a
> claim detail page (evidence, challenge lifecycle, per-investigator
> reports, resolution, dissent, payouts, appeals), an investigators
> section (identity, lineage, controller history, calibration, real
> cross-referenced payouts), a playground that runs the same four demo
> scenarios and renders their actual returned step trace (not a
> fabricated fixed lifecycle diagram — different scenarios genuinely
> take different paths), and a page documenting and exercising `POST
> /agent/verify-claim` live. No protocol, contract, adapter, or indexer
> code changed in this pass; no data field is invented anywhere in the
> UI — every value traces to a real indexer/demo-server response, and
> "no indexed data yet" is shown as such rather than populated with
> placeholder content.
>
> **Architecture decision — package layout kept.** A hypothetical
> production layout (`packages/chain`, `packages/storage`,
> `packages/compute`, `packages/investigators`, moving `contracts/` under
> `packages/`, etc.) was considered and rejected: the existing separation
> (`protocol-core` pure domain logic, `zg-adapters` for all three 0G
> integration surfaces, `contracts`, `apps/indexer`, `demo`) already
> isolates protocol logic from presentation, and splitting `zg-adapters`
> along its three current files into three packages would be pure
> churn — real regression risk across a codebase that has already been
> through four hostile audit passes, for no functional or boundary
> benefit. Refactoring only where it improves a real production
> boundary meant refactoring the frontend, not the backend.
>
> **Naming — `ZG_*` env vars renamed to `OG_*`.** `ZG_STORAGE_MODE` →
> `OG_STORAGE_MODE`, `ZG_COMPUTE_MODE` → `OG_COMPUTE_MODE`,
> `ZG_STORAGE_INDEXER_RPC` → `OG_STORAGE_INDEXER_RPC`; the Hardhat
> testnet network name `zgTestnet` → `ogTestnet`. These are the only
> places "ZG" appeared as project-chosen terminology a human actually
> reads or types. `ZgChainAdapter` / `ZgStorageAdapter` /
> `ZgComputeInvestigator`, the `zg-adapters` package name, and the
> Solidity enum member `ZG_COMPUTE_TEE` were deliberately left alone:
> these are source-code identifiers, and identifiers in both TypeScript
> and Solidity cannot start with a digit — "Zg"/"ZG_" is the same
> unavoidable ASCII-safe escape "0G" needs everywhere else it's used as
> a bare identifier, not a naming mistake, and no judge or user ever
> reads a class name. Renaming those anyway would have been pure
> mechanical churn against hardened, tested code for zero externally
> visible benefit.
>
> **Addendum 3 — nonce-timing race, root-caused and closed.** A fourth,
> narrowly scoped pass targeted specifically the "probabilistic, not
> eliminated" nonce race disclosed in Addendum 2 below. Root cause:
> ethers v6's `AbstractProvider` shares identical in-flight/recent RPC
> calls — same method, same params — for `cacheTimeout` ms (250ms by
> default) to cut redundant network traffic. `eth_getTransactionCount
> (address, "pending")` is such a call. A single signer sending two
> transactions in tight, ordinary succession (the second issued right
> after the first's send call resolves, without waiting for its
> receipt — the normal shape of every scenario in `demo/lib.ts`) could
> have its second nonce lookup handed the *same* cached value as the
> first, even though Hardhat's instant automining had already consumed
> that nonce on-chain. A captured failing trace confirmed this exactly:
> one real `eth_getTransactionCount` call, two `eth_sendRawTransaction`
> calls both carrying the identical embedded nonce, the second rejected
> as `NONCE_EXPIRED` ("Nonce too low. Expected nonce to be 13 but got
> 12."). This was never a true concurrency race between separate
> signers or a chain-level ordering problem — it was a client-side read
> cache handing back a stale answer to the same signer. Fix: construct
> every `JsonRpcProvider` in `ZgChainAdapter` with `cacheTimeout: -1`,
> disabling that cache. This is not the `pollingInterval` change
> Addendum 2 tried and reverted — it does not touch how `.wait()` polls
> for confirmations, costs at most a handful of extra
> `eth_getTransactionCount` calls per scenario, and has no latency
> tradeoff. Verified: 8 repeated full sequential `demo:full` runs (32
> scenario executions) with zero failures where the race previously
> reproduced on the first iteration; 6 genuinely concurrent
> `/agent/verify-claim` requests all returned 200 with distinct,
> correct on-chain results; full test suite (67 protocol-core/
> zg-adapters unit tests + 2 new nonce regression tests + 21 contract
> tests, 90 total) passing; typecheck and production build clean. Two
> new regression tests reproduce the exact bug shape against a real
> `hardhat node` over HTTP (an in-process test network does not exhibit
> this — the cache lives in the HTTP transport layer). Honest scope
> limit: a genuinely simultaneous pair of sends from one signer with no
> `await` at all between them is a different, structurally distinct
> problem that would need a centralized nonce manager to fix — no call
> site in this codebase does that (verified), so it is out of scope and
> intentionally not asserted against.
>
> **Addendum 2 — hostile audit pass.** A third pass tried to break the
> protocol, the payment model, investigator identity, and the agent API
> on purpose. It found one critical on-chain defect, two smaller
> identity-registry defects, a real evidence-scoring regression, and a
> real (partially mitigated, not eliminated) transaction-timing
> flakiness — and fixed the first four. Test count: 76 → **77**
> unit/integration tests + 16 → **21** contract tests, all passing.
>
> **Critical — `resolve()` trusted the caller's word for the verdict.**
> The contract accepted any `status` argument with zero on-chain check
> against what investigators actually reported — a permissionless
> caller could resolve *any* challenge to *any* outcome, including
> ones with zero reports submitted. Fixed: `_submitReport` now tallies
> SUPPORTS/REJECTS/INSUFFICIENT_EVIDENCE on-chain per challenge, and
> `resolve()` derives the expected status from those tallies (mirroring
> protocol-core's `DefaultResolutionProcedure`) and reverts
> (`StatusMismatch`) if the caller's argument doesn't match. Fixing
> this broke — and required correcting — four existing tests that had
> been resolving challenges with zero or verdict-inconsistent reports;
> that breakage is itself evidence the defect was real, not theoretical.
> Honest residual limitation: this still can't verify model-provider
> diversity on-chain (no such field exists in the contract), so Sybil/
> monoculture investigator addresses can still satisfy the tally check —
> already-disclosed as bounded, not solved, not a new gap.
>
> **`InvestigatorRegistry` lineage forgery.** `register()` checked that
> a claimed `parentId` existed, but not that the caller controlled it —
> anyone could register a "successor" to an identity they didn't own,
> polluting its reputation lineage. Fixed: successor registration now
> requires `msg.sender == parentId`'s current controller. Also added:
> `rotateController` rejects the zero address (previously an irreversible
> self-lockout with no error).
>
> **Adversarial-evidence regression in the SIMULATED investigator.**
> Re-running Scenario B during this pass surfaced a real correctness
> bug: yesterday's fix for "$25M" vs "$25,000,000" number-scaling made
> the SIMULATED stub match a claim's own restated figure *anywhere in
> the evidence bundle* — but an adversarial dispute's bundle legitimately
> contains evidence for both sides, and the claim's own number is almost
> always present alongside whatever contradicts it. The stub started
> flipping Scenario B's genuinely-false claim to SUPPORTS/TRUE, because
> the $40M figure it was checking for was trivially present in the same
> bundle as the $12M evidence that actually contradicts it. Fixed: any
> evidence number that does NOT match the claim's figure now outweighs
> one that does, rather than "does the number appear anywhere" winning
> by default. Regression test added; Scenario B now resolves FALSE
> again (verified live, twice, after the fix).
>
> **Concurrency.** The agent API's hard requirement — never report
> success when the underlying operation failed — held in every test
> run, including every failure below. Two real fixes landed: (1)
> concurrent requests are now serialized through one process-wide queue
> (`demo/server.ts`) rather than racing each other's transaction nonces
> on the shared demo-relayer keys; (2) every chain adapter's provider is
> now `.destroy()`ed after use, closing a real background-polling
> resource leak. A third attempted fix — lowering the provider's
> polling interval to cut ~40s worst-case latency from `tx.wait()` — was
> reverted: it measurably reintroduced nonce failures in plain
> *sequential* runs, so it was not shipped. Residual, disclosed
> limitation, now characterized more precisely than before: the
> underlying nonce-timing race this repo has fought since the previous
> pass (see the `connectAs()` fix earlier in this document) is
> **probabilistic, not eliminated** — most runs of `demo:full` and the
> agent API succeed cleanly (confirmed repeatedly, including
> immediately after this pass's fixes), but a fresh JsonRpcProvider's
> readiness handshake can still occasionally lose the race against
> Hardhat's instant automining even in a single-process, purely
> *sequential* CLI run, not only under concurrency. This was true
> before this pass and remains true after it; today's fixes reduce its
> frequency (no more concurrent requests racing each other on top of
> it) but do not claim to have eliminated it. Every observed failure,
> in every test run of this entire audit, was an honest error — never
> once a fabricated success.

> **Addendum 1 — 0G-native integration pass.** A second pass added
> pay-per-verification settlement, investigator payouts, portable
> investigator identity (`InvestigatorRegistry.sol`), a DA batch-commitment
> module (not wired to the runtime), and an agent-facing
> `POST /agent/verify-claim` API. See `docs/0G_INTEGRATION.md` for what
> was built and why, and `docs/ERC7857_DECISION.md` / `docs/DA_DECISION.md`
> for the two "don't fake it" calls. The section below is the original
> audit, left intact; here is what changed:
>
> - Test count: 60 → **76** unit/integration tests (protocol-core +
>   zg-adapters) + 10 → **16** contract tests, all passing.
> - Same "`at` collides with `Array.prototype.at`" bug recurred in the
>   *new* `InvestigatorRegistry` events (`InvestigatorRegistered`,
>   `ControllerRotated`) — same fix (rename to `occurredAt`), now with a
>   regression assertion in the Hardhat test suite so it can't silently
>   come back a third time.
> - The rebuilt-`dist/` discipline bit again: after the `occurredAt`
>   rename, the Solidity contract was recompiled but `zg-adapters`'
>   TypeScript ABI wasn't rebuilt, so the indexer kept parsing the *old*
>   ABI shape against the *new* on-chain events until the mismatch was
>   caught by inspection (`registeredAt` showing `null`) — not by a
>   test. No test currently guards "the compiled dist/ matches the
>   current source"; noted as a P1 in the addendum below.
> - The SIMULATED investigator's numeric-overlap heuristic didn't scale
>   `"$25M"` the way it scaled `"$25,000,000"`, producing a wrong-looking
>   REJECT on genuinely matching evidence — fixed, with a regression
>   test (`compute.test.ts`).
>
> **Addendum P0/P1s:**
> - **P0 (unchanged from the original audit):** 0G Storage/Compute live
>   paths are still unexercised against the real network this pass —
>   Priority 1's payment settlement is real on-chain value, but the
>   *investigator execution* itself still ran in `SIMULATED` mode for
>   every demo run in this pass, same as before.
> - **P1 — no dist/source drift guard.** As seen above, a stale compiled
>   package can silently serve an old ABI. Worth a pre-flight check
>   (e.g. `npm run build` as a `pretest`/`predemo` hook) in a future pass.
> - **P1 — 0G Pay does not exist as a distinct product to integrate**;
>   documented honestly in `docs/0G_INTEGRATION.md` rather than faked.
> - **P2 — DA and ERC-7857 both investigated and deliberately not
>   used**; see their decision docs. Not a gap, a documented choice.

---

This is the honest report demanded by the build spec §26. It was written
after running the actual test suites and a live end-to-end demo against
a real deployed contract on a real (local) EVM — not written from intent.

## A. What was already present

Nothing. The repository was empty (`Is a git repository: false`, zero
files) when this build started. Everything below was written in this
session.

## B. What was built

- `packages/protocol-core` — the full domain model: predicate
  extraction/disambiguation, content-addressed evidence bundles with a
  canonical (order-independent) Merkle root, a justification/
  supersession DAG with cycle rejection, bi-temporal claim validity, a
  mechanical five-state resolution procedure, the claim/challenge state
  machine, and append-only appeals. Zero network dependency. **52
  passing tests.**
- `packages/zg-adapters` — mode-aware, honesty-labeled adapters for 0G
  Storage, 0G Compute, and 0G Chain, built against the real published
  SDKs (`@0gfoundation/0g-storage-ts-sdk@1.2.11`,
  `@0gfoundation/0g-compute-ts-sdk@0.9.0`, `ethers@6.13.1`). **8
  passing tests.**
- `contracts/MemoryWarRegistry.sol` — the on-chain state machine:
  claims, typed challenges, bonded disputes, replay-protected
  investigator reports, mechanical verdict commitments, supersession
  pointers, and append-only appeals. **10 passing Hardhat tests**,
  executed against a real EVM (Hardhat network), including real bond
  transfers, real reverts on illegal transitions, and real replay
  rejection.
- `apps/indexer` — a read-only service that rebuilds the entire claim
  graph by replaying the contract's own events, independently of any
  stored cache.
- `apps/web` — a frontend implementing the required claim / evidence /
  investigation / verdict / history views, with honest mode badges.
- `demo/` — `lib.ts` (the real integration path, shared by the CLI
  scripts and the browser-facing demo driver), the two required
  scenarios, and the tamper-detection demo.

## C. What is genuinely on-chain

The full `MemoryWarRegistry` state machine, **verified twice over**:
once by 10 Hardhat tests exercising every guard (illegal-transition
reverts, duplicate-report reverts, bond refund vs. forfeiture, appeal
non-mutation of the original verdict), and once by an actual deployment
to a local devnet (`npx hardhat node`) followed by real signed
transactions from four distinct accounts — claim creation, relationship
recording, bonded challenge opening, evidence locking, investigation,
report submission, and mechanical resolution, all confirmed on-chain
and independently reconstructed by the indexer from the contract's own
event log.

This is **ON-CHAIN VERIFIED (local devnet)** — real EVM bytecode, real
state transitions, real bond accounting. It is **not yet deployed to
the live 0G Galileo testnet.** The deploy script (`scripts/deploy.ts`,
network `ogTestnet` in `hardhat.config.ts`) is real and testnet-ready,
but 0G's faucet requires an X-account login and a captcha — there was
no way to obtain a funded testnet wallet autonomously in this session.
Deploying live requires the user to fund a wallet and set
`CHAIN_PRIVATE_KEY` / `CHAIN_RPC_URL` in `.env`.

## D. What is genuinely stored on 0G

**Nothing, in this session.** `ZgStorageAdapter`'s live path calls the
real SDK (`Indexer`, `MemData`, `.merkleTree()`, `.upload()`,
`.downloadToBlob()`) with the exact method signatures confirmed against
the published package's own type declarations — but it requires
`OG_STORAGE_INDEXER_RPC` plus a funded `CHAIN_PRIVATE_KEY` on 0G
Storage's network, neither of which was configured. Every evidence
artifact, claim text, and report in this session's demo runs was
labeled `LOCAL_DEMO` and persisted to a local content-addressed store —
correctly and honestly, per the adapter's own fallback logic, never
upgraded to look more impressive than what happened.

## E. What is genuinely executed/attested through 0G Compute

**Nothing, in this session.** `ZgComputeInvestigator`'s live path calls
the real broker SDK (`createZGComputeNetworkBroker`, `listService`,
`transferFund`, `getServiceMetadata`, `getRequestHeaders`,
`processResponse`) matching the SDK's documented flow — but it requires
a funded 0G Compute ledger, not available here. The `LOCAL_LLM`
fallback (a real Anthropic/OpenAI call, no TEE attestation) was also
not exercised, since no API key was configured for this run. Every
investigator report in this session ran in `SIMULATED` mode — a
deterministic, non-model, rule-based stub — and every report object,
log line, and UI badge that touches it says so explicitly. **No
"TEE verified" or "0G Compute" badge was ever shown for a result that
didn't earn it.**

## F. What remains simulated

0G Storage and 0G Compute integration, for the reasons in D and E
above. This is the single most important limitation of this delivery
and should not be minimized: the *code* is written against the real
SDK surfaces and typechecks against their real published type
declarations, but the *live network round-trip* has never actually
run.

## G. Test / build / typecheck results

```
protocol-core   : 8 files, 52 tests   — PASS
zg-adapters     : 2 files,  8 tests   — PASS
contracts       : 10 tests (Hardhat, real EVM) — PASS
build           : protocol-core, zg-adapters   — clean
typecheck       : protocol-core, zg-adapters, indexer — clean
apps/web build  : vite build — clean (9.75 kB JS, 4.49 kB CSS)
```

Live demo run (`npm run demo:full`, then `demo:a` / `demo:b` re-run
standalone, repeatedly, against a deployed contract on a running local
devnet): **6/6 scenario runs succeeded**, including tamper detection
(pass → fail → pass across a real tamper-and-restore cycle), Scenario A
(predicate mismatch → `RELATES_TO`, zero bond, zero challenge), and
Scenario B (genuine contradiction → bonded challenge → locked evidence
→ two independent reports → mechanical `FALSE` verdict → on-chain
commitment → original claim still queryable, unmutated).

## Bugs found and fixed during this session's own testing

Real execution surfaced three real bugs that static review had missed
— worth stating plainly rather than pretending the first draft was
correct:

1. **`args.at` silently resolved to `Array.prototype.at`.** Several
   Solidity events used `uint64 at` as a parameter name; ethers.js's
   `Result` object inherits from `Array`, so `args.at` returned the
   built-in method instead of the field, and `Number(fn)` silently
   became `NaN` → `null` everywhere a timestamp should have been. Fixed
   by renaming every occurrence to `occurredAt` across the contract,
   the ABI, and the indexer.
2. **Four hand-typed local devnet private keys were off by 1–2 hex
   characters** (truncated during transcription), which would have
   thrown "invalid private key" the first time anyone actually tried
   the multi-role demo path. Fixed by reading the exact keys back from
   a running `hardhat node`'s own startup banner.
3. **An intermittent "nonce too low" race** on the very first
   transaction sent through a freshly-constructed per-role chain
   adapter — a new `JsonRpcProvider`'s network detection hadn't settled
   before its first write. Fixed by awaiting `provider.getNetwork()`
   inside `ZgChainAdapter.connectAs()` before returning the adapter;
   confirmed fixed by rapid back-to-back demo runs that previously
   reproduced it.

None of these were caught by reading the code twice — only by actually
deploying, running, and re-running it.

## H. Remaining P0 / P1 weaknesses

- **P0 — 0G Storage/Compute live path is unverified end-to-end.** Code
  is real and SDK-correct; the live network round-trip has not been
  exercised (see D, E, F).
- **P0 — SIMULATED investigator "independence" is not epistemically
  meaningful.** Both investigators in every run in this session are the
  same deterministic function and produced byte-identical reasoning
  (confirmed in the trace output) — the model-diversity guarantee only
  becomes real once `LOCAL_LLM` (distinct providers) or
  `0G_COMPUTE_TEE` (distinct attested models) is actually exercised.
- **P1 — predicate extraction is regex-based**, scoped to the MVP's
  funding/valuation/TVL/exploit claim shapes (spec §21). The
  `PredicateExtractor` interface anticipates an LLM-backed extractor,
  but only `RuleBasedExtractor` is implemented; classification logic
  itself remains deterministic either way (by design, spec §8).
- **P1 — source reliability scoring (`agent.ts`) is implemented but not
  wired** into the contract, indexer, or frontend — correctly scoped as
  should-have, not must-have, per §22, and left there deliberately.
- **P1 — this environment could not run `npm install` directly against
  the project's own UNC-mounted path** (`\\wsl.localhost\Ubuntu\...`);
  both npm and pnpm's Windows symlink/CoW code crashed on that volume.
  Every install, build, and test in this session ran against a local
  NTFS mirror (`C:\ClaudeBuild\memory-war`, synced via `robocopy`) while
  all source edits were made directly on the UNC path, which remains
  the authoritative copy. This is an environment limitation, not a
  defect in the delivered code — but if the user's own machine mounts
  the repo the same way, `npm install` may need the same workaround.
- **P2 — no external SDK, no ERC-8004 interop, no curator role** —
  correctly out of MVP scope per §22's "do not build" list.

## I. Exact end-to-end demo path

```bash
npm install                                    # or: mirror to a local path first, see P1 above
npm run chain:node                             # terminal A
npm run chain:deploy:local                     # terminal B — copy the printed address into .env
npm test && npm run test:contracts             # 76 unit/integration tests + 21 contract tests
npm run demo:full                              # tamper detection → scenarios A, B, C, full trace
npm run indexer:dev                            # terminal C — GET /claims, /challenges/:id, /content/:hash, /investigators
npm run demo:server                            # terminal D — POST /run/tamper, /run/a, /run/b, /run/c, /agent/verify-claim
npm run client:dev                             # terminal E — open http://localhost:4402
```

## J. One brutally honest sentence

**If a 0G judge audits this repository today, the strongest criticism
they can still make is that the 0G Storage and 0G Compute integrations
are real, SDK-correct, and fully tested in their honestly-labeled local
fallback modes, but the live round-trip through the actual 0G network
has never once been exercised — only the contract layer has been
proven against a real, running chain.**
