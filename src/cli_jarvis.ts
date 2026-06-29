// One-shot CLI for testing the remote JARVIS-VLA executor.
//
// Usage:
//   node --experimental-strip-types src/cli_jarvis.ts
//   node --experimental-strip-types src/cli_jarvis.ts "Kill the zombies"
//
// Config is read from environment / .env:
//   RUNPOD_HOST, RUNPOD_PORT, RUNPOD_USER, RUNPOD_KEY_PATH
//   JARVIS_REMOTE_REPO, JARVIS_BASE_URL, JARVIS_ENV_CONFIG, JARVIS_MAX_FRAMES
//
// Assumes the remote vLLM server is already running on port 8000.

import { readFile } from "node:fs/promises";
import { Mine0App } from "./app/decision_loop.ts";
import { loadJarvisConfig } from "./shared/config.ts";
import { type JarvisRemoteArtifacts } from "./executor/jarvis_remote_executor.ts";
import { projectPath } from "./shared/fs.ts";

// loadJarvisConfig() calls loadLocalEnv() internally, which populates process.env
// from .env before we apply the JARVIS-specific default below.
const config = loadJarvisConfig();

// Each JARVIS SSH rollout costs ~2 minutes.  Default to a single decision step
// so a demo run takes one rollout, not many.  Override with
// MINE0_MAX_DECISION_STEPS=N in .env or the shell to run more steps.
if (process.env["MINE0_MAX_DECISION_STEPS"] === undefined) {
  process.env["MINE0_MAX_DECISION_STEPS"] = "1";
}
const effectiveMaxSteps = Number(process.env["MINE0_MAX_DECISION_STEPS"]);

const objective = process.argv.slice(2).join(" ").trim() || "Kill zombies";

console.log("Mine0 — JARVIS remote executor");
console.log(`  host        : ${config.user}@${config.host}:${config.port}`);
console.log(`  key         : ${config.keyPath}`);
console.log(`  remote repo : ${config.remoteRepo}`);
console.log(`  env-config  : ${config.envConfig}`);
console.log(`  max-frames  : ${config.maxFrames}`);
console.log(`  max decisions: ${effectiveMaxSteps}  (set MINE0_MAX_DECISION_STEPS to change)`);
console.log(`  objective   : ${objective}`);
console.log("---");

const app = new Mine0App();
const trace = await app.runCycle({
  objective,
  executorKind: "jarvis-remote",
  mode: "greedy",
});

console.log("\n=== DecisionTrace ===");
console.log(JSON.stringify(trace, null, 2));

// Print the JARVIS-specific artifacts written by JarvisRemoteExecutor.execute().
// These are separate from the DecisionTrace because the ExecutorBackend interface
// returns only ActionOutcome — the extra remote detail lives in the artifact file.
try {
  const raw = await readFile(projectPath("artifacts", "logs", "jarvis_last_run.json"), "utf8");
  const artifacts = JSON.parse(raw) as JarvisRemoteArtifacts;
  console.log("\n=== JARVIS Remote Artifacts ===");
  console.log(`  remoteExecutionSucceeded : ${artifacts.remoteExecutionSucceeded}`);
  console.log(`  taskSucceeded            : ${artifacts.taskSucceeded ?? "null (no reward signal in stdout)"}`);
  console.log(`  exitCode                 : ${artifacts.exitCode}`);
  console.log(`  durationSeconds          : ${artifacts.durationSeconds}`);
  console.log(`  actionCount              : ${artifacts.actionCount}`);
  console.log(`  videoPath                : ${artifacts.videoPath ?? "(not found)"}`);
  if (artifacts.actions.length > 0) {
    console.log("  actions (first 10):");
    for (const action of artifacts.actions) {
      console.log(`    ${JSON.stringify(action)}`);
    }
  } else {
    console.log("  actions                  : (none parsed)");
  }
} catch {
  // execute() was not reached (e.g. SSH misconfigured or observe() threw).
}
