import { Mine0App } from "./app/decision_loop.ts";

const objective =
  process.argv.slice(2).join(" ").trim() ||
  "Gather wood, craft a crafting table, and obtain a wooden pickaxe";

const app = new Mine0App();
const trace = await app.runCycle({
  objective,
  executorKind: "jarvis",
  mode: "multiverse",
});

console.log(JSON.stringify(trace, null, 2));
