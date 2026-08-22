import type { DemoTrace } from "./lib.js";

export function printTrace(trace: DemoTrace) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  MEMORY WAR — ${trace.scenario}`);
  console.log(`${"═".repeat(72)}\n`);
  trace.steps.forEach((step, i) => {
    console.log(`[${i + 1}] ${step.label}`);
    console.log(`    ${step.detail}`);
    if (step.data) console.log(`    ${JSON.stringify(step.data, replacer, 2).split("\n").join("\n    ")}`);
    console.log("");
  });
  console.log(trace.ok ? "RESULT: ok\n" : "RESULT: FAILED — see steps above\n");
}

function replacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
