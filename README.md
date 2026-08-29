# MEMORY WAR

A persistent, adversarially-tested knowledge layer for machine-generated
claims, built on 0G — and a verification service autonomous agents can
pay to use: `POST /agent/verify-claim` runs pay → investigate → attest
→ resolve end to end and returns a machine-readable, independently
auditable result. See [`docs/0G_INTEGRATION.md`](docs/0G_INTEGRATION.md)
for what's genuinely wired into the 0G ecosystem in this pass
(pay-per-verification settlement, portable investigator identity) and
what was deliberately left out (0G DA, ERC-7857) and why.

```
CLAIM → EVIDENCE/JUSTIFICATION DAG → PREDICATE DISAMBIGUATION → TYPED CHALLENGE
      → INDEPENDENT INVESTIGATION → STRUCTURED VERDICT → SUPERSESSION → PERMANENT HISTORY
```

The protocol never outputs "Truth." It outputs an evidentiary verdict
about a claim, at a particular point in time, produced by a disclosed
and auditable procedure.

See [`docs/AUDIT.md`](docs/AUDIT.md) for the honest final report on what
in this repository is genuinely on-chain, genuinely backed by 0G
Storage, genuinely executed through 0G Compute with TEE attestation —
and what is not (yet).

## Layout

```
packages/protocol-core   pure domain logic — no network, fully tested
packages/zg-adapters     honest, mode-aware 0G Storage / Compute / Chain adapters
contracts/               MemoryWarRegistry.sol + Hardhat tests
apps/indexer             read-only query layer, rebuilt from chain events
apps/web                 frontend — claim/evidence/investigation/verdict/history views
demo/                    the two required demo scenarios + tamper detection
```

## Quickstart (local devnet — no 0G credentials required)

```bash
npm install

# 1. terminal A — local EVM devnet
npm run chain:node

# 2. terminal B — deploy the contract, then copy the printed address
#    into .env as MEMORY_WAR_CONTRACT_ADDRESS (cp .env.example .env first)
npm run chain:deploy:local

# 3. run the tests
npm test                # protocol-core + zg-adapters (vitest)
npm run test:contracts  # MemoryWarRegistry (hardhat)

# 4. run the demo end-to-end
npm run demo:full        # tamper detection, then scenarios A, B, C
npm run demo:c           # scenario C alone — pay-per-verification + portable investigator identity

# 5. or drive it from the browser
npm run demo:server      # terminal C — demo driver, :4401
npm run indexer:dev      # terminal D — read-only query API, :4400
npm run web:dev          # terminal E — frontend, :4402
```

## Connecting to the live 0G network

Copy `.env.example` to `.env` and fill in `CHAIN_RPC_URL` (0G Galileo
testnet), `CHAIN_PRIVATE_KEY` (a funded testnet wallet — see
`docs/AUDIT.md` for exactly what this repository has and hasn't
deployed live), `ZG_STORAGE_INDEXER_RPC`, and `ZG_STORAGE_MODE=live` /
`ZG_COMPUTE_MODE=live`. Every adapter falls back honestly to a labeled
local mode if live configuration is missing or fails — see
`packages/zg-adapters/src/storage.ts` and `compute.ts`.

## Design documents

The research and protocol design that preceded this implementation are
published separately as the ["Memory War Kill Test"](https://claude.ai/code/artifact/6969cce0-2488-4a5b-92ba-c9909546996a)
adversarial investment memo. This repository implements §27 of that
document (the revised protocol specification), not the original,
un-modified thesis.
