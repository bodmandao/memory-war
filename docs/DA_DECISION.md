# Why 0G DA is not in the runtime

**Short answer:** MEMORY WAR's evidence and claim state don't have a
data-availability problem today, and no official 0G DA TypeScript
client exists to integrate against for real even if they did.

## What DA actually solves

0G DA answers "can I trust that this data was published and is
retrievable, without downloading all of it myself" — the problem an
optimistic/ZK rollup has with its L2 transaction batches. It is a
sampling-based availability guarantee over a large, continuously
growing dataset that many light clients need to trust without
re-downloading.

## Why MEMORY WAR doesn't have that problem today

Every evidence artifact is already individually content-addressed and
stored in 0G Storage, with its own retrievability commitment (PoRA).
Every claim/challenge/investigation state transition is already an
individual, cheap on-chain event. There is no batch of undifferentiated
data that a light client would otherwise have to trust blindly — the
protocol's whole design principle (spec §5) is that everything is
already individually, cheaply verifiable. Uploading evidence to DA
"because it's a 0G product" would be decoration, not engineering — the
exact failure mode the original kill-test explicitly warned against.

## Where DA genuinely could help — a real, tested mechanism, not wired in

At high agent-driven throughput — many claims, challenges, and
investigator reports per block — committing every single event
individually to 0G Chain stops being the cheapest option. Batching
events, submitting the batch to DA, and posting one availability
commitment on-chain amortizes that cost. `packages/protocol-core/src/daBatch.ts`
implements exactly that: `computeBatchCommitment()` (a real,
order-independent Merkle commitment over a batch of events, tested)
and `shouldBatchForDA()` (the actual throughput heuristic, as code, not
a fixed opinion).

## What stops here, and why

There is no `submitToDa()` call. As of this build, 0G has not published
an official TypeScript DA SDK — the two packages the compute and
storage adapters are built on
(`@0gfoundation/0g-compute-ts-sdk`, `@0gfoundation/0g-storage-ts-sdk`)
have a `@0gfoundation/*`-scoped DA counterpart nowhere on npm; the only
DA client found was an unofficial third-party wrapper
(`@foundryprotocol/0gkit-da`) with no way to verify its correctness
against 0G's own protocol. Building a critical-path integration on an
unverified community package, or worse, writing a network call that
can't actually be exercised, would be exactly the kind of fake
integration spec §22 exists to prevent. The commitment math above is
real and ready; the network leg is the honest gap, and it stays a gap
until 0G ships (or clearly endorses) a public client.
