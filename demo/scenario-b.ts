import "dotenv/config";
import { runScenarioB } from "./lib.js";
import { printTrace } from "./print.js";

runScenarioB()
  .then(printTrace)
  .catch((err) => {
    console.error("Scenario B failed:", err);
    process.exitCode = 1;
  });
