import "dotenv/config";
import { runScenarioA } from "./lib.js";
import { printTrace } from "./print.js";

runScenarioA()
  .then(printTrace)
  .catch((err) => {
    console.error("Scenario A failed:", err);
    process.exitCode = 1;
  });
