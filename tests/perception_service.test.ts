import test from "node:test";
import assert from "node:assert/strict";
import { PerceptionService } from "../src/perception/perception_service.ts";

test("PerceptionService uses local structured perception by default", async () => {
  const service = new PerceptionService();
  const result = await service.perceive({
    timestamp: new Date().toISOString(),
    userObjective: "find a resource",
    position: { x: 0, y: 40, z: 0 },
    biomeOrRegionHint: "underground",
    health: 20,
    hunger: 20,
    inventory: [],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: ["iron_ore"],
    nearbyBlocks: ["stone", "iron_ore"],
    nearbyEntities: [],
    lineOfSightTarget: "iron_ore",
    interactionHints: ["reachable_target"],
    goalProgress: 0.2,
  });

  assert.equal(result.meta.label, "perception_local");
  assert.equal(result.meta.usage, null);
  assert.ok(result.result.reachableTargets.includes("iron_ore"));
});

test("PerceptionService reports Jarvis-specific structured cues when requested", async () => {
  const service = new PerceptionService();
  const result = await service.perceive(
    {
      timestamp: new Date().toISOString(),
      userObjective: "place a crafting table nearby",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "plains",
      health: 20,
      hunger: 20,
      inventory: [{ item: "crafting_table", count: 1 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["oak_tree"],
      nearbyBlocks: ["grass", "dirt"],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: ["can_place_crafting_table"],
      goalProgress: 0.5,
    },
    "jarvis",
  );

  assert.match(result.meta.warning ?? "", /JARVIS route/);
  assert.ok(result.result.confidenceNotes.some((entry) => entry.includes("JARVIS")));
});
