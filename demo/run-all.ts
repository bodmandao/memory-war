import "dotenv/config";
import { runScenarioA, runScenarioB, runScenarioC, runTamperDemo } from "./lib.js";
import { printTrace } from "./print.js";

async function main() {
  printTrace(await runTamperDemo());
  printTrace(await runScenarioA());
  printTrace(await runScenarioB());
  printTrace(await runScenarioC());
}

main()
  .catch((err) => {
    console.error("Demo run failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Live 0G Compute (via @0gfoundation/0g-compute-ts-sdk) leaves a
    // background handle open that this repo's own `provider.destroy()`
    // cleanup (see compute.ts) doesn't fully clear — a real limitation
    // of the third-party SDK, not something fixable from this side (see
    // docs/AUDIT.md). Explicit exit is the accepted pattern for a
    // one-shot CLI script against a library with a known handle leak.
    process.exit(process.exitCode ?? 0);
  });
