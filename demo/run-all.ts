import "dotenv/config";
import { runScenarioA, runScenarioB, runScenarioC, runTamperDemo } from "./lib.js";
import { printTrace } from "./print.js";

async function main() {
  printTrace(await runTamperDemo());
  printTrace(await runScenarioA());
  printTrace(await runScenarioB());
  printTrace(await runScenarioC());
}

main().catch((err) => {
  console.error("Demo run failed:", err);
  process.exitCode = 1;
});
