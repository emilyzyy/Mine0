import test from "node:test";
import assert from "node:assert/strict";
import { parseWorldState } from "../src/contracts/world_state.ts";
import { parseSubgoalIntent } from "../src/contracts/subgoal_intent.ts";

test("parseWorldState accepts the canonical scaffold shape", () => {
  const worldState = parseWorldState({
    timestamp: new Date().toISOString(),
    userObjective: "Get me a wooden pickaxe",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 18,
    inventory: [{ item: "oak_log", count: 2 }],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: ["oak_tree"],
    nearbyBlocks: ["grass", "log"],
    nearbyEntities: [],
    lineOfSightTarget: "oak_tree",
    interactionHints: ["tree_visible", "structured_perception_only"],
    goalProgress: 0.1,
  });

  assert.equal(worldState.position.y, 64);
  assert.equal(worldState.inventory[0]?.item, "oak_log");
});

test("parseSubgoalIntent validates planner output", () => {
  const intent = parseSubgoalIntent({
    objective: "Get me a wooden pickaxe",
    instruction: "Collect three oak logs",
    candidateAction: {
      name: "collect",
      arguments: { block_type: "oak_log", count: 3 },
      reason: "Wood is required for tools.",
    },
    successCondition: { item: "oak_log", count: 3 },
    maximumSteps: 400,
  });

  assert.equal(intent.candidateAction.name, "collect");
  assert.equal(intent.successCondition.count, 3);
});
