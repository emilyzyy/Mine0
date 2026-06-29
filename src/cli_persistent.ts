// One-shot CLI for the persistent JARVIS executor.
//
// Requires the worker already running on RunPod:
//   npm run jarvis:worker start
//
// Then:
//   npm run jarvis:persistent
//   npm run jarvis:persistent -- "Move toward the zombie and attack"
//
// Set MINE0_MAX_DECISION_STEPS to control how many goals are sent to the
// same persistent Minecraft session (default 2 for the MVP two-call test).

import { readFile } from "node:fs/promises";
import { Mine0App } from "./app/decision_loop.ts";
import { loadJarvisConfig } from "./shared/config.ts";
import {
  type JarvisPersistentArtifacts,
  PERSISTENT_LAST_RUN_PATH,
} from "./executor/jarvis_persistent_executor.ts";
import { projectPath } from "./shared/fs.ts";

// loadJarvisConfig() triggers loadLocalEnv() so .env vars are in process.env
// before we apply the JARVIS-specific default below.
const config = loadJarvisConfig();

// Default to 2 decision steps so we exercise persistence across two calls
// without over-spending SSH/rollout time.  Override with MINE0_MAX_DECISION_STEPS.
if (process.env["MINE0_MAX_DECISION_STEPS"] === undefined) {
  process.env["MINE0_MAX_DECISION_STEPS"] = "2";
}
const effectiveMaxSteps = Number(process.env["MINE0_MAX_DECISION_STEPS"]);

const objective = process.argv.slice(2).join(" ").trim() || "Kill zombies";

console.log("Mine0 — JARVIS persistent executor");
console.log(`  host          : ${config.user}@${config.host}:${config.port}`);
console.log(`  worker port   : ${config.workerPort}`);
console.log(`  env-config    : ${config.envConfig}`);
console.log(`  max-frames/goal: ${config.maxFrames}`);
console.log(`  max decisions : ${effectiveMaxSteps}  (set MINE0_MAX_DECISION_STEPS to change)`);
console.log(`  objective     : ${objective}`);
console.log("---");

const app = new Mine0App();
const trace = await app.runCycle({
  objective,
  executorKind: "jarvis-persistent",
  mode: "greedy",
});

console.log("\n=== DecisionTrace ===");
console.log(JSON.stringify(trace, null, 2));

// Print the last run's persistent artifacts (written by execute() each step).
try {
  const raw = await readFile(
    projectPath("artifacts", "logs", "jarvis_persistent_last_run.json"),
    "utf8",
  );
  const art = JSON.parse(raw) as JarvisPersistentArtifacts;
  console.log("\n=== JARVIS Persistent Artifacts (last step) ===");
  console.log(`  sessionId             : ${art.sessionId}`);
  console.log(`  reusedSession         : ${art.reusedSession}`);
  console.log(`  cumulativeStepBefore  : ${art.cumulativeStepBefore}`);
  console.log(`  cumulativeStepAfter   : ${art.cumulativeStepAfter}`);
  console.log(`  remoteExecutionSucceeded: ${art.remoteExecutionSucceeded}`);
  console.log(`  taskSucceeded         : ${art.taskSucceeded ?? "null (no reward signal)"}`);
  console.log(`  actionCount           : ${art.actionCount}`);
  console.log(`  durationSeconds       : ${art.durationSeconds}`);
  console.log(`  latestScreenshotPath  : ${art.latestScreenshotPath ?? "(none)"}`);
  if (art.actions.length > 0) {
    console.log("  actions (first 5):");
    for (const a of art.actions.slice(0, 5)) {
      console.log(`    ${JSON.stringify(a)}`);
    }
  }
} catch {
  // execute() was not reached (e.g. worker not running, SSH error).
}
