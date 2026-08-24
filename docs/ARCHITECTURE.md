# Architecture

## On-chain / 0G Storage / 0G Compute / indexer boundary

| Layer | Holds | Package |
|---|---|---|
| 0G Chain (`MemoryWarRegistry.sol`) | Claim/Challenge IDs, predicate & text hashes, evidence bundle roots, bond escrow, state machine transitions, verdict commitments, supersession pointers, appeal records | `contracts/` |
| 0G Storage | Full claim text, evidence artifacts, investigator reasoning text | `packages/zg-adapters/src/storage.ts` |
| 0G Compute | Investigator execution; TEE-signed reports bound to a committed evidence bundle hash | `packages/zg-adapters/src/compute.ts` |
| Indexer (NOT authoritative) | Rebuilds the full claim graph by replaying on-chain events; hydrates text via the storage adapter | `apps/indexer/` |

Nothing in the indexer is a source of truth. `apps/indexer/src/eventStore.ts`
is a pure function `(logs) -> state`; delete `.data/` and restart, and
the exact same state is rebuilt by replaying the chain's own event log.

## Predicate disambiguation gate

`packages/protocol-core/src/predicate.ts` is the one place in the
system that decides whether two claims may fight each other
economically. `classifyRelationship` is pure and deterministic:

```
extractRuleBased(text) -> StructuredPredicate  (subject, metric, value, qualifiers)
classifyRelationship(a, b) -> { relation, requiresChallenge }
```

Only `CONTRADICTS` sets `requiresChallenge: true`. Everything else
(`RELATES_TO`, `REFINES`, `NARROWS`, `EXTENDS`) resolves into a free,
unstaked relationship edge recorded via `recordRelationship` on-chain —
the contract itself rejects `CONTRADICTS` at that entry point
(`NotContradiction` revert), so the safe path is enforced at the
protocol layer, not merely by the frontend.

## Mechanical resolution

`packages/protocol-core/src/resolution.ts`'s `DefaultResolutionProcedure`
is a pure function over `Report[]`. It requires ≥2 reports from ≥2
distinct model providers before it will return anything but
`INCONCLUSIVE` — the model-monoculture mitigation is enforced in code,
not left as an operational hope. Disagreement always resolves to
`CONTESTED` with the minority report preserved in full — there is no
majority-vote code path that discards a dissenting report.

## Honesty contract for 0G integration labels

`packages/zg-adapters` never upgrades a label past what actually
happened:

- `0G_STORAGE_LIVE` only if bytes round-tripped through the live 0G
  Storage indexer via `@0gfoundation/0g-storage-ts-sdk`.
- `0G_COMPUTE_TEE` + `verified: true` only if
  `broker.inference.processResponse(...)` returned `true` for that
  exact response.
- Otherwise: `LOCAL_DEMO` / `LOCAL_LLM` / `SIMULATED`, in that order of
  degradation, each explicitly labeled in every report, event, and UI
  badge that touches it.

See `docs/AUDIT.md` for which mode this repository actually ran in.
