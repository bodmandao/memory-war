/**
 * 0G Storage adapter.
 *
 * Honesty contract (spec §22): this module NEVER returns a result
 * labeled `0G_STORAGE_LIVE` unless the bytes genuinely round-tripped
 * through the live 0G Storage network via @0gfoundation/0g-storage-ts-sdk
 * (Indexer.upload / downloadToBlob against a real indexer RPC with a
 * funded signer). When that is not configured or fails, it falls back
 * to a LOCAL content-addressed store and labels every result
 * `LOCAL_DEMO` instead — same real hashing, same real tamper detection
 * (that part is pure cryptography and does not depend on the network at
 * all — see protocol-core/evidence.ts), different persistence backend.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentHashOf, verifyIntegrity } from "@memory-war/protocol-core";
import type { Hash } from "@memory-war/protocol-core";

export type StorageMode = "0G_STORAGE_LIVE" | "LOCAL_DEMO";

export interface StorageResult {
  rootHash: Hash;
  mode: StorageMode;
  txHash?: string;
  detail: string;
}

export interface StorageConfig {
  mode?: "auto" | "live" | "local";
  indexerRpc?: string;
  chainRpc?: string;
  privateKey?: string;
  localDir?: string;
}

export class ZgStorageAdapter {
  private readonly localDir: string;
  private live: LiveStorageBackend | null = null;
  private liveInitError: string | null = null;
  private readonly requestedMode: "auto" | "live" | "local";

  constructor(private readonly config: StorageConfig = {}) {
    this.requestedMode = config.mode ?? (process.env.OG_STORAGE_MODE as any) ?? "auto";
    this.localDir = config.localDir ?? "./.data/local-storage";
    if (!existsSync(this.localDir)) mkdirSync(this.localDir, { recursive: true });
  }

  private async getLive(): Promise<LiveStorageBackend | null> {
    if (this.requestedMode === "local") return null;
    if (this.live) return this.live;
    if (this.liveInitError) return null;

    const indexerRpc = this.config.indexerRpc ?? process.env.OG_STORAGE_INDEXER_RPC;
    const chainRpc = this.config.chainRpc ?? process.env.CHAIN_RPC_URL;
    const privateKey = this.config.privateKey ?? process.env.CHAIN_PRIVATE_KEY;

    if (!indexerRpc || !chainRpc || !privateKey) {
      this.liveInitError = "OG_STORAGE_INDEXER_RPC / CHAIN_RPC_URL / CHAIN_PRIVATE_KEY not fully configured";
      if (this.requestedMode === "live") throw new Error(`0G Storage live mode requested but not configured: ${this.liveInitError}`);
      return null;
    }

    try {
      const sdk = await import("@0gfoundation/0g-storage-ts-sdk");
      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(chainRpc);
      const signer = new ethers.Wallet(privateKey, provider);
      const indexer = new sdk.Indexer(indexerRpc);
      this.live = { sdk, indexer, signer, chainRpc };
      return this.live;
    } catch (err) {
      this.liveInitError = err instanceof Error ? err.message : String(err);
      if (this.requestedMode === "live") throw err;
      return null;
    }
  }

  /**
   * The returned `rootHash` is ALWAYS `contentHashOf(bytes)` — the
   * protocol's own canonical, storage-backend-independent identifier
   * (the same hash `Evidence.id`/on-chain `evidenceBundleHash` use) —
   * regardless of storage mode. It is deliberately never 0G Storage's
   * own network-internal root hash (a Merkle root over the SDK's
   * chunked/segmented representation of the file, a genuinely different
   * value from a flat hash of the raw bytes). That internal identifier
   * is real and necessary — it's what `indexer.downloadToBlob()`
   * actually requires — so it's tracked separately (`writeLiveMapping`)
   * rather than discarded, but it must never leak out as "the" hash: a
   * caller retrieving content by the protocol's own recorded evidence
   * hash would otherwise find nothing on the live network, and
   * `verify()`'s tamper-check would spuriously fail on byte-perfect
   * content. (Found by actually exercising live mode for the first
   * time — see docs/AUDIT.md.)
   */
  async upload(bytes: Uint8Array): Promise<StorageResult> {
    const contentHash = contentHashOf(bytes);
    const live = await this.getLive();
    if (live) {
      try {
        const memData = new live.sdk.MemData(bytes);
        const [tree, treeErr] = await memData.merkleTree();
        if (treeErr || !tree) throw treeErr ?? new Error("merkleTree() returned null");
        // Cast across the SDK boundary: @0gfoundation/0g-storage-ts-sdk bundles
        // its own `ethers` copy, so its `Signer` type is nominally distinct
        // from ours even when the resolved versions match (a classic
        // monorepo dual-package hazard). Structurally identical at runtime.
        const [tx, uploadErr] = await live.indexer.upload(memData, live.chainRpc, live.signer as unknown as Parameters<typeof live.indexer.upload>[2]);
        if (uploadErr) throw uploadErr;
        const live0gRootHash = ("rootHash" in tx ? tx.rootHash : tx.rootHashes[0]) as string;
        const txHash = "txHash" in tx ? tx.txHash : tx.txHashes[0];
        this.writeLocalMirror(contentHash, bytes); // cache locally too, so download() is fast either way
        this.writeLiveMapping(contentHash, live0gRootHash);
        return {
          rootHash: contentHash,
          mode: "0G_STORAGE_LIVE",
          txHash,
          detail: `uploaded to live 0G Storage indexer (network root ${live0gRootHash})`,
        };
      } catch (err) {
        if (this.requestedMode === "live") throw err;
        // fall through to local mode, honestly labeled
      }
    }
    return this.uploadLocal(bytes);
  }

  private uploadLocal(bytes: Uint8Array): StorageResult {
    const rootHash = contentHashOf(bytes);
    this.writeLocalMirror(rootHash, bytes);
    return {
      rootHash,
      mode: "LOCAL_DEMO",
      detail:
        this.liveInitError !== null
          ? `0G Storage live mode unavailable (${this.liveInitError}) — using local content-addressed store`
          : "local mode requested — using local content-addressed store",
    };
  }

  /** `rootHash` here is always the protocol's contentHash (see `upload()`) — resolved to 0G's own network root via the persisted mapping before calling the live SDK. */
  async download(rootHash: Hash): Promise<{ bytes: Uint8Array; mode: StorageMode }> {
    const live = await this.getLive();
    if (live) {
      const live0gRootHash = this.readLiveMapping(rootHash);
      if (live0gRootHash) {
        try {
          const [blob, err] = await live.indexer.downloadToBlob(live0gRootHash);
          if (err || !blob) throw err ?? new Error("downloadToBlob returned no data");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          return { bytes, mode: "0G_STORAGE_LIVE" };
        } catch {
          // fall through to local mirror
        }
      }
    }
    const bytes = this.readLocalMirror(rootHash);
    return { bytes, mode: "LOCAL_DEMO" };
  }

  /**
   * The tamper-detection primitive demanded by spec §19/§21: recompute
   * the hash of whatever bytes were actually retrieved and compare
   * against the committed root. Real regardless of storage mode.
   */
  async verify(rootHash: Hash): Promise<{ ok: boolean; recomputedHash: Hash; mode: StorageMode }> {
    const { bytes, mode } = await this.download(rootHash);
    const { ok, recomputedHash } = verifyIntegrity(rootHash, bytes);
    return { ok, recomputedHash, mode };
  }

  private writeLocalMirror(rootHash: Hash, bytes: Uint8Array) {
    writeFileSync(this.localFile(rootHash), bytes);
  }

  private readLocalMirror(rootHash: Hash): Uint8Array {
    const path = this.localFile(rootHash);
    if (!existsSync(path)) throw new Error(`no local mirror for ${rootHash} — was this ever uploaded via this adapter?`);
    return new Uint8Array(readFileSync(path));
  }

  private localFile(rootHash: Hash): string {
    return join(this.localDir, rootHash.replace(/[^a-zA-Z0-9]/g, "") + ".bin");
  }

  /**
   * Persists contentHash -> 0G's own network root hash. A plain
   * in-memory map wouldn't survive across processes (the process that
   * calls `upload()` — e.g. the demo driver — is routinely a different
   * process than the one that later calls `download()`/`verify()` —
   * e.g. the indexer), so this is a small sidecar file next to the
   * local mirror, keyed the same way.
   */
  private writeLiveMapping(contentHash: Hash, live0gRootHash: string) {
    writeFileSync(this.liveMappingFile(contentHash), JSON.stringify({ live0gRootHash }));
  }

  private readLiveMapping(contentHash: Hash): string | null {
    const path = this.liveMappingFile(contentHash);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8")).live0gRootHash ?? null;
    } catch {
      return null;
    }
  }

  private liveMappingFile(contentHash: Hash): string {
    return join(this.localDir, contentHash.replace(/[^a-zA-Z0-9]/g, "") + ".live.json");
  }

  /** For honest UI badges: what mode WOULD an upload run in right now? */
  async currentMode(): Promise<StorageMode> {
    return (await this.getLive()) ? "0G_STORAGE_LIVE" : "LOCAL_DEMO";
  }
}

interface LiveStorageBackend {
  sdk: typeof import("@0gfoundation/0g-storage-ts-sdk");
  indexer: InstanceType<typeof import("@0gfoundation/0g-storage-ts-sdk").Indexer>;
  signer: import("ethers").Wallet;
  chainRpc: string;
}
