import "dotenv/config";
import { runScenarioA } from "./lib.js";
import { printTrace } from "./print.js";

runScenarioA()
  .then(printTrace)
  .catch((err) => {
    console.error("Scenario A failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    // See run-all.ts — live 0G Compute leaves a background handle open
    // that this repo's own cleanup can't fully clear (SDK limitation,
    // not ours; see docs/AUDIT.md).
    process.exit(process.exitCode ?? 0);
  });
