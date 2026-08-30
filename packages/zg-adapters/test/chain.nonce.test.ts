import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { ZgChainAdapter } from "../src/chain.js";

// Regression test for the nonce-timing race described in docs/AUDIT.md:
// ethers' AbstractProvider caches identical RPC calls (same method + same
// params) for `cacheTimeout` ms (250ms by default). Two writes from the
// same signer issued back-to-back both call
// eth_getTransactionCount(address, "pending") — inside that window the
// second call used to be handed the *same* cached value as the first,
// even though the first transaction had already consumed that nonce
// (Hardhat auto-mines instantly). That produced a spurious NONCE_EXPIRED
// on an otherwise entirely correct, non-concurrent call sequence.
//
// This spins up a real `hardhat node` over HTTP (the same transport the
// bug depends on — an in-process test network does not reproduce it) and
// fires two transactions from one ZgChainAdapter signer with no await
// between them, which is exactly the shape that used to collide.

const RPC_URL = "http://127.0.0.1:8555"; // dedicated port — do not collide with a dev chain:node on 8545
const DEVNET_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // hardhat account #0 — well-known, local-only
const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".slice(0, 42); // hardhat account #1 address, truncate defensively

let node: ChildProcess;

async function waitForRpc(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // node not up yet
    }
    await delay(200);
  }
  throw new Error(`hardhat node did not become ready on ${url} within ${timeoutMs}ms`);
}

describe("ZgChainAdapter — back-to-back sends from one signer (nonce-cache regression)", () => {
  beforeAll(async () => {
    node = spawn("npx", ["hardhat", "node", "--port", "8555"], {
      cwd: new URL("../../../contracts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      shell: true,
      stdio: "ignore",
    });
    await waitForRpc(RPC_URL, 30_000);
  }, 40_000);

  afterAll(async () => {
    // `spawn(..., { shell: true })` on Windows runs the target under an
    // intermediate cmd.exe; killing that wrapper process leaves the
    // actual `hardhat node` it launched running as an orphan. `taskkill
    // /t` kills the whole process tree; POSIX just needs the direct kill.
    if (node?.pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(node.pid), "/t", "/f"]);
      } else {
        node.kill("SIGKILL");
      }
    }
    await delay(200);
  });

  // Note on scope: this reproduces the actual bug shape used throughout
  // demo/lib.ts and demo/server.ts — every write in this codebase is
  // `await`-ed before the next one is issued from the same signer; there
  // is no call site that fires two sends from one signer with no `await`
  // at all between them. A genuinely simultaneous pair of sends (both
  // `sendTransaction()` calls started in the same tick, never awaited
  // individually) is a different, structurally unfixable problem without
  // a centralized nonce manager — out of scope per this pass — so it is
  // deliberately not asserted here.

  it("does not collide nonces when a second send is issued immediately after the first send call resolves, without waiting for its receipt", async () => {
    // MEMORY_WAR_CONTRACT_ADDRESS is only validated for presence by the
    // adapter's constructor — nothing here calls the contract, so an
    // undeployed placeholder address is fine.
    const adapter = new ZgChainAdapter({
      rpcUrl: RPC_URL,
      privateKey: DEVNET_KEY,
      contractAddress: "0x0000000000000000000000000000000000dEaD",
    });

    // This is the exact shape that used to race in practice (see
    // docs/AUDIT.md and the trace behind this fix): the first send is
    // awaited and its transaction object returned, then the second send
    // is issued right away — well within the old 250ms cache window —
    // without ever waiting for the first transaction's on-chain receipt.
    const tx1 = await adapter.signer.sendTransaction({ to: RECIPIENT, value: 0n });
    const tx2 = await adapter.signer.sendTransaction({ to: RECIPIENT, value: 0n });

    expect(tx2.nonce).toBe(tx1.nonce + 1);

    const [r1, r2] = await Promise.all([tx1.wait(), tx2.wait()]);
    expect(r1?.status).toBe(1);
    expect(r2?.status).toBe(1);

    adapter.provider.destroy();
  }, 20_000);

  it("does not collide nonces across ten strictly sequential sends (the ordinary demo-scenario shape)", async () => {
    const adapter = new ZgChainAdapter({
      rpcUrl: RPC_URL,
      privateKey: DEVNET_KEY,
      contractAddress: "0x0000000000000000000000000000000000dEaD",
    });

    const nonces: number[] = [];
    for (let i = 0; i < 10; i++) {
      const tx = await adapter.signer.sendTransaction({ to: RECIPIENT, value: 0n });
      const receipt = await tx.wait();
      expect(receipt?.status).toBe(1);
      nonces.push(tx.nonce);
    }

    const sorted = [...nonces].sort((a, b) => a - b);
    expect(new Set(nonces).size).toBe(10); // no nonce reused
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]).toBe(sorted[i - 1] + 1); // strictly consecutive, no gaps
    }

    adapter.provider.destroy();
  }, 30_000);
});
