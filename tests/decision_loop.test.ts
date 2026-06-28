import test from "node:test";
import assert from "node:assert/strict";
import { Mine0App } from "../src/app/decision_loop.ts";

test("Mine0App runs a complete mocked cycle", async () => {
  const app = new Mine0App();
  const trace = await app.runCycle({
    objective: "Gather wood and make a crafting table",
    executorKind: "mineflayer",
    mode: "multiverse",
  });

  assert.equal(trace.objective, "Gather wood and make a crafting table");
  assert.ok(trace.selectedIntent.instruction.length > 0);
  assert.ok(trace.plannedFuture.strategy.length > 0);
  assert.ok(["success", "partial_success", "failed", "timeout"].includes(trace.actionOutcome.status));
  assert.ok(trace.planner.callLog.length >= 1);
  assert.ok(trace.planner.callLog.length <= 2);
});
