/**
 * Evidence bundles: content-addressed, order-independent, lockable.
 *
 * Spec §9: "ordering must be canonicalized... if evidence is added
 * after evidence lock, it must NOT silently modify the original
 * bundle. It should either be rejected, or create a new procedural
 * version with an explicit event. Prefer immutability."
 */
import { hashBytes, hashUtf8, merkleRoot } from "./ids.js";
import type { Evidence, EvidenceBundle, Hash, Timestamp } from "./types.js";

export function contentHashOf(bytes: Uint8Array): Hash {
  return hashBytes(bytes);
}

export function makeEvidence(input: {
  bytes: Uint8Array;
  sourceUrl?: string;
  sourceType: Evidence["sourceType"];
  submittedBy: `0x${string}`;
  submittedAt: Timestamp;
  bond?: string;
  storageUri?: string;
}): Evidence {
  const contentHash = contentHashOf(input.bytes);
  return {
    id: contentHash, // evidence IDs ARE content hashes — identical bytes always collapse to one id
    contentHash,
    storageUri: input.storageUri,
    sourceUrl: input.sourceUrl,
    sourceType: input.sourceType,
    submittedBy: input.submittedBy,
    submittedAt: input.submittedAt,
    bond: input.bond ?? "0",
  };
}

/** Build (or extend, pre-lock) a bundle. Order of `evidenceIds` given never matters. */
export function buildBundle(
  claimOrChallengeId: Hash,
  evidenceIds: Hash[],
  version = 1,
): EvidenceBundle {
  const canonical = [...new Set(evidenceIds)].sort();
  return {
    claimOrChallengeId,
    evidenceIds: canonical,
    root: merkleRoot(canonical),
    version,
  };
}

export class EvidenceLockError extends Error {
  constructor(bundleId: Hash) {
    super(`Evidence bundle for ${bundleId} is locked; cannot add evidence in place — open a new version instead.`);
    this.name = "EvidenceLockError";
  }
}

/** Locking is the only way a bundle transitions from mutable to immutable. */
export function lockBundle(bundle: EvidenceBundle, at: Timestamp): EvidenceBundle {
  if (bundle.lockedAt !== undefined) return bundle; // idempotent
  return { ...bundle, lockedAt: at };
}

/**
 * Attempting to add evidence to a locked bundle must fail loudly, or
 * (if the caller opts in) fork an explicit new bundle version rather
 * than silently mutating the one investigators already committed to.
 */
export function addEvidence(
  bundle: EvidenceBundle,
  newIds: Hash[],
  opts: { allowNewVersion?: boolean } = {},
): EvidenceBundle {
  if (bundle.lockedAt !== undefined) {
    if (!opts.allowNewVersion) throw new EvidenceLockError(bundle.claimOrChallengeId);
    return buildBundle(bundle.claimOrChallengeId, [...bundle.evidenceIds, ...newIds], bundle.version + 1);
  }
  return buildBundle(bundle.claimOrChallengeId, [...bundle.evidenceIds, ...newIds], bundle.version);
}

/**
 * The tamper-detection primitive demanded by spec §19/§21/§22: recompute
 * the hash of retrieved bytes and compare to the committed hash. This is
 * real regardless of which storage backend produced the bytes — it is
 * pure cryptography, not something that can be faked by a storage
 * adapter's "mode" flag.
 */
export function verifyIntegrity(committedHash: Hash, retrievedBytes: Uint8Array): {
  ok: boolean;
  recomputedHash: Hash;
} {
  const recomputedHash = contentHashOf(retrievedBytes);
  return { ok: recomputedHash === committedHash, recomputedHash };
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function hashText(text: string): Hash {
  return hashUtf8(text);
}
