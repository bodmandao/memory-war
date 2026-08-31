import "dotenv/config";
import { runTamperDemo } from "./lib.js";
import { printTrace } from "./print.js";

runTamperDemo()
  .then(printTrace)
  .catch((err) => {
    console.error("Tamper demo failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Tamper detection never touches 0G Compute, but keep this
    // consistent with the other entry points for predictable behavior.
    process.exit(process.exitCode ?? 0);
  });
