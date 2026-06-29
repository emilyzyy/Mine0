import { Mine0App } from "./app/decision_loop.ts";
import { loadPlannerConfig } from "./shared/config.ts";
import type { ExecutorKind } from "./executor/index.ts";

const args = process.argv.slice(2);
const executorArg = args.find((entry) => entry.startsWith("--executor="));
const modeArg = args.find((entry) => entry.startsWith("--mode="));
const objective = args
  .filter((entry) => !entry.startsWith("--executor=") && !entry.startsWith("--mode="))
  .join(" ")
  .trim() || "Gather wood, craft a crafting table, and obtain a wooden pickaxe";
const config = loadPlannerConfig();
const executorKind = resolveExecutorKind(
  executorArg?.slice("--executor=".length),
  config.mineflayer.enabled,
);
const mode = modeArg?.slice("--mode=".length) === "greedy" ? "greedy" : "multiverse";

const app = new Mine0App();
const trace = await app.runCycle({
  objective,
  executorKind,
  mode,
});

console.log(JSON.stringify(trace, null, 2));

function resolveExecutorKind(value: string | undefined, liveMineflayerEnabled: boolean): ExecutorKind {
  if (value === "jarvis" || value === "mineflayer") {
    return value;
  }

  return liveMineflayerEnabled ? "mineflayer" : "jarvis";
}
