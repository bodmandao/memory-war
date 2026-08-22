import "dotenv/config";
import { runTamperDemo } from "./lib.js";
import { printTrace } from "./print.js";

runTamperDemo()
  .then(printTrace)
  .catch((err) => {
    console.error("Tamper demo failed:", err);
    process.exitCode = 1;
  });
