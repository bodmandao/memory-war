import "dotenv/config";
import { runScenarioC } from "./lib.js";
import { printTrace } from "./print.js";

runScenarioC()
  .then(printTrace)
  .catch((err) => {
    console.error("Scenario C failed:", err);
    process.exitCode = 1;
  });
