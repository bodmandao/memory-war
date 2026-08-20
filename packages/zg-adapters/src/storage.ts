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
    this.requestedMode = config.mode ?? (process.env.ZG_STORAGE_MODE as any) ?? "auto";
    this.localDir = config.localDir ?? "./.data/local-storage";
    if (!existsSync(this.localDir)) mkdirSync(this.localDir, { recursive: true });
  }

  private async getLive(): Promise<LiveStorageBackend | null> {
    if (this.requestedMode === "local") return null;
    if (this.live) return this.live;
    if (this.liveInitError) return null;

    const indexerRpc = this.config.indexerRpc ?? process.env.ZG_STORAGE_INDEXER_RPC;
    const chainRpc = this.config.chainRpc ?? process.env.CHAIN_RPC_URL;
    const privateKey = this.config.privateKey ?? process.env.CHAIN_PRIVATE_KEY;

    if (!indexerRpc || !chainRpc || !privateKey) {
      this.liveInitError = "ZG_STORAGE_INDEXER_RPC / CHAIN_RPC_URL / CHAIN_PRIVATE_KEY not fully configured";
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

  async upload(bytes: Uint8Array): Promise<StorageResult> {
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
        const rootHash = ("rootHash" in tx ? tx.rootHash : tx.rootHashes[0]) as string;
        const txHash = "txHash" in tx ? tx.txHash : tx.txHashes[0];
        this.writeLocalMirror(rootHash as Hash, bytes); // cache locally too, so download() is fast either way
        return { rootHash: rootHash as Hash, mode: "0G_STORAGE_LIVE", txHash, detail: `uploaded to live 0G Storage indexer` };
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

  async download(rootHash: Hash): Promise<{ bytes: Uint8Array; mode: StorageMode }> {
    const live = await this.getLive();
    if (live) {
      try {
        const [blob, err] = await live.indexer.downloadToBlob(rootHash);
        if (err || !blob) throw err ?? new Error("downloadToBlob returned no data");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return { bytes, mode: "0G_STORAGE_LIVE" };
      } catch {
        // fall through to local mirror
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
