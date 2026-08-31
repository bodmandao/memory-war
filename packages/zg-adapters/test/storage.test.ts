import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ZgStorageAdapter } from "../src/storage.js";

describe("ZgStorageAdapter (local mode — no network dependency)", () => {
  let dir: string;
  let adapter: ZgStorageAdapter;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mw-storage-"));
    adapter = new ZgStorageAdapter({ mode: "local", localDir: dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("uploads and is honestly labeled LOCAL_DEMO, never claims 0G_STORAGE_LIVE", async () => {
    const bytes = new TextEncoder().encode("Protocol X announcement: raised $40,000,000");
    const result = await adapter.upload(bytes);
    expect(result.mode).toBe("LOCAL_DEMO");
    expect(result.rootHash).toMatch(/^0x/);
  });

  it("round-trips bytes exactly", async () => {
    const bytes = new TextEncoder().encode("evidence artifact contents");
    const { rootHash } = await adapter.upload(bytes);
    const { bytes: downloaded } = await adapter.download(rootHash);
    expect(new TextDecoder().decode(downloaded)).toBe("evidence artifact contents");
  });

  it("verify() passes for untampered content and fails after the underlying file is tampered with", async () => {
    const bytes = new TextEncoder().encode("Protocol X raised $40,000,000");
    const { rootHash } = await adapter.upload(bytes);

    const before = await adapter.verify(rootHash);
    expect(before.ok).toBe(true);

    // Tamper directly with the persisted local file — simulates an
    // attacker who compromises the storage backend, per spec §19.
    const { writeFileSync } = await import("node:fs");
    const localPath = join(dir, rootHash.replace(/[^a-zA-Z0-9]/g, "") + ".bin");
    writeFileSync(localPath, Buffer.from("Protocol X raised $400,000,000"));

    const after = await adapter.verify(rootHash);
    expect(after.ok).toBe(false);
    expect(after.recomputedHash).not.toBe(rootHash);
  });

  /**
   * Regression for a real bug found by first exercising live 0G Storage
   * on mainnet (see docs/AUDIT.md): 0G's own network root hash (a
   * Merkle root over chunked/segmented data) is NOT the same value as
   * contentHashOf(bytes) — the protocol's own canonical identifier,
   * used everywhere else (Evidence.id, on-chain evidenceBundleHash).
   * upload() must always return the protocol's hash as `rootHash`, and
   * verify() must succeed against it, even when a live network root
   * exists and differs. This simulates that split without a live SDK
   * call, using the adapter's own persisted mapping mechanism directly.
   */
  it("verify() succeeds against the protocol's own content hash even when a different live-network root hash is recorded for the same content", async () => {
    const bytes = new TextEncoder().encode("Protocol X raised $40,000,000");
    const { rootHash: contentHash } = await adapter.upload(bytes);

    // Simulate what a live upload additionally records: 0G's own,
    // genuinely different, network-internal root hash for the same bytes.
    const fakeLive0gRootHash = "0x" + "ab".repeat(32);
    expect(fakeLive0gRootHash).not.toBe(contentHash);
    (adapter as unknown as { writeLiveMapping(h: string, r: string): void }).writeLiveMapping(contentHash, fakeLive0gRootHash);

    const result = await adapter.verify(contentHash);
    expect(result.ok).toBe(true);
    expect(result.recomputedHash).toBe(contentHash);
  });
});
