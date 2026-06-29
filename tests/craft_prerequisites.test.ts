import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkstationPrerequisiteSubtasks,
  craftFailureNeedsWorkstation,
  prependWorkstationPrerequisites,
  requiresPlacedCraftingTable,
} from "../src/planner/craft_prerequisites.ts";

const baseWorldState = {
  timestamp: new Date().toISOString(),
  userObjective: "mine diamonds",
  position: { x: 0, y: 64, z: 0 },
  biomeOrRegionHint: "forest_edge",
  health: 20,
  hunger: 20,
  inventory: [],
  equippedItem: "air",
  timeOfDay: "day",
  sceneSummary: null,
  visibleHazards: [],
  perceivedResources: [],
  nearbyBlocks: [],
  nearbyEntities: [],
  lineOfSightTarget: null,
  interactionHints: ["can_place_crafting_table"],
  goalProgress: 0,
};

test("requiresPlacedCraftingTable distinguishes inventory-only crafts", () => {
  assert.equal(requiresPlacedCraftingTable("planks"), false);
  assert.equal(requiresPlacedCraftingTable("stick"), false);
  assert.equal(requiresPlacedCraftingTable("crafting_table"), false);
  assert.equal(requiresPlacedCraftingTable("stone_pickaxe"), true);
  assert.equal(requiresPlacedCraftingTable("wooden_door"), true);
});

test("buildWorkstationPrerequisiteSubtasks asks to place a carried crafting table", () => {
  const tasks = buildWorkstationPrerequisiteSubtasks(
    {
      ...baseWorldState,
      inventory: [
        { item: "crafting_table", count: 1 },
        { item: "cobblestone", count: 12 },
        { item: "stick", count: 8 },
      ],
    },
    "stone_pickaxe",
  );

  assert.deepEqual(
    tasks.map((task) => task.id),
    ["place_crafting_table"],
  );
});

test("buildWorkstationPrerequisiteSubtasks rebuilds a workstation when the bot walked away", () => {
  const tasks = buildWorkstationPrerequisiteSubtasks(
    {
      ...baseWorldState,
      inventory: [
        { item: "planks", count: 12 },
        { item: "cobblestone", count: 12 },
        { item: "stick", count: 8 },
      ],
    },
    "stone_pickaxe",
  );

  assert.deepEqual(
    tasks.map((task) => task.id),
    ["craft_crafting_table", "place_crafting_table"],
  );
});

test("craftFailureNeedsWorkstation detects missing workstation access", () => {
  assert.equal(
    craftFailureNeedsWorkstation(
      "stone_pickaxe",
      "No available recipe for stone_pickaxe. Place a crafting table nearby first.",
      {
        ...baseWorldState,
        inventory: [{ item: "cobblestone", count: 12 }, { item: "stick", count: 8 }],
      },
    ),
    true,
  );
});

test("prependWorkstationPrerequisites inserts place-table work before tool crafts", () => {
  const expanded = prependWorkstationPrerequisites(
    {
      ...baseWorldState,
      inventory: [
        { item: "crafting_table", count: 1 },
        { item: "planks", count: 8 },
        { item: "stick", count: 8 },
      ],
    },
    [
      {
        id: "craft_stone_pickaxe",
        description: "Craft a stone pickaxe",
        planningFocus: "craft one stone_pickaxe",
        compound: false,
      },
    ],
  );

  assert.equal(expanded[0]?.id, "place_crafting_table");
  assert.equal(expanded.at(-1)?.id, "craft_stone_pickaxe");
});

test("extractCraftItemFromFocus ignores place-focused door subtasks", async () => {
  const { extractCraftItemFromFocus } = await import("../src/planner/craft_prerequisites.ts");
  assert.equal(
    extractCraftItemFromFocus("place one wooden door nearby while standing clear of the opening"),
    null,
  );
});
