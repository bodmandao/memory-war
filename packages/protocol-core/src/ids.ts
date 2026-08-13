/**
 * Deterministic, canonical hashing.
 *
 * Every content-derived ID in the protocol (claim IDs, evidence bundle
 * roots, procedure hashes, report commitments) goes through this module
 * so that the SAME logical content always produces the SAME hash,
 * independent of key ordering or submission order — and so that the
 * exact same function used here is what the Solidity contract's
 * `keccak256(abi.encodePacked(...))` calls are checked against in
 * cross-layer tests (see contracts/test).
 */
import { keccak256, toUtf8Bytes, getBytes, hexlify, concat } from "ethers";
import type { Hash } from "./types.js";

/** Canonical JSON: sorted keys, no whitespace, stable for hashing. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function hashUtf8(text: string): Hash {
  return keccak256(toUtf8Bytes(text)) as Hash;
}

export function hashBytes(bytes: Uint8Array): Hash {
  return keccak256(bytes) as Hash;
}

export function hashJson(value: unknown): Hash {
  return hashUtf8(canonicalJson(value));
}

/** Combine two 32-byte hashes into one, the way a Merkle tree pairs nodes. */
export function hashPair(a: Hash, b: Hash): Hash {
  const [x, y] = a <= b ? [a, b] : [b, a]; // order-independent pairing
  return keccak256(concat([getBytes(x), getBytes(y)])) as Hash;
}

/**
 * A minimal Merkle tree over an arbitrary list of leaf hashes.
 * Leaves are SORTED before tree construction, so the resulting root
 * is invariant to submission order — required by the spec ("if the
 * same evidence set is represented in a different order, it should
 * not accidentally produce a different logical bundle commitment").
 */
export function merkleRoot(leaves: Hash[]): Hash {
  if (leaves.length === 0) return hashUtf8("EMPTY_BUNDLE");
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: Hash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? level[i]!; // duplicate last if odd
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return level[0]!;
}

export function shortHash(h: Hash, len = 10): string {
  return `${h.slice(0, len)}…`;
}

export function asHash(hex: string): Hash {
  return hexlify(getBytes(hex)) as Hash;
}
