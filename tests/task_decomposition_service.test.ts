import test from "node:test";
import assert from "node:assert/strict";
import {
  filterSatisfiedSubtasks,
  normalizeLlmSubtasks,
} from "../src/planner/task_decomposition_service.ts";
import { TaskStackService } from "../src/planner/task_stack_service.ts";

function rawSubtask(
  partial: Omit<Parameters<typeof normalizeLlmSubtasks>[0][number], "targetCount"> & { targetCount?: number },
) {
  return { targetCount: 1, destination: "", ...partial };
}

test("normalizeLlmSubtasks maps LLM output into executable subtasks", () => {
  const subtasks = normalizeLlmSubtasks(
    [
      rawSubtask({
        id: "reach_surface",
        description: "Reach the surface",
        planningFocus: "explore up to reach the surface for saplings",
        expectedAction: "explore",
        targetItem: "",
        destination: "surface",
      }),
      rawSubtask({
        id: "obtain_sapling",
        description: "Obtain a sapling",
        planningFocus: "collect one sapling from leaves",
        expectedAction: "collect",
        targetItem: "sapling",
        destination: "surface",
      }),
      rawSubtask({
        id: "plant_sapling",
        description: "Plant the sapling",
        planningFocus: "place one sapling on grass",
        expectedAction: "place",
        targetItem: "sapling",
      }),
    ],
    "plant a sapling",
  );

  assert.equal(subtasks.length, 3);
  assert.equal(subtasks[0]?.expectedAction, "explore");
  assert.equal(subtasks[1]?.targetCount, 1);
  assert.equal(subtasks[1]?.targetItem, "sapling");
  assert.equal(subtasks[2]?.expectedAction, "place");
  assert.equal(subtasks.every((entry) => entry.compound === false), true);
});

test("filterSatisfiedSubtasks drops obtain work already in inventory", () => {
  const subtasks = normalizeLlmSubtasks(
    [
      rawSubtask({
        id: "obtain_boat",
        description: "Obtain a boat",
        planningFocus: "craft one boat",
        expectedAction: "craft",
        targetItem: "boat",
      }),
      rawSubtask({
        id: "locate_water",
        description: "Locate water",
        planningFocus: "explore toward water for boat placement",
        expectedAction: "explore",
        targetItem: "",
        destination: "aquatic",
      }),
      rawSubtask({
        id: "place_boat",
        description: "Place boat in water",
        planningFocus: "place one boat in water",
        expectedAction: "place",
        targetItem: "boat",
        destination: "aquatic",
      }),
    ],
    "place a boat in water",
  );

  const filtered = filterSatisfiedSubtasks(subtasks, {
    timestamp: new Date().toISOString(),
    userObjective: "place a boat in water",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "plains",
    health: 20,
    hunger: 20,
    inventory: [{ item: "boat", count: 3 }],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: ["grass"],
    nearbyEntities: [],
    lineOfSightTarget: "grass",
    interactionHints: [],
    goalProgress: 0,
  });

  assert.equal(filtered.some((entry) => entry.id === "obtain_boat"), false);
  assert.equal(filtered.some((entry) => entry.id === "locate_water"), true);
  assert.equal(filtered.some((entry) => entry.id === "place_boat"), true);
});

test("TaskStackService uses LLM subtasks without heuristic re-expansion", () => {
  const stack = new TaskStackService();
  stack.reset(
    "plant a sapling",
    {
      timestamp: new Date().toISOString(),
      userObjective: "plant a sapling",
      position: { x: 0, y: 32, z: 0 },
      biomeOrRegionHint: "underground",
      health: 20,
      hunger: 20,
      inventory: [],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["stone"],
      nearbyEntities: [],
      lineOfSightTarget: "stone",
      interactionHints: [],
      goalProgress: 0,
    },
    {
      llmSubtasks: normalizeLlmSubtasks(
        [
          rawSubtask({
            id: "reach_surface",
            description: "Reach the surface",
            planningFocus: "explore up to reach the surface",
            expectedAction: "explore",
            targetItem: "",
            destination: "surface",
          }),
          rawSubtask({
            id: "obtain_sapling",
            description: "Obtain a sapling",
            planningFocus: "collect one sapling",
            expectedAction: "collect",
            targetItem: "sapling",
          }),
          rawSubtask({
            id: "plant_sapling",
            description: "Plant the sapling",
            planningFocus: "place one sapling",
            expectedAction: "place",
            targetItem: "sapling",
          }),
        ],
        "plant a sapling",
      ),
    },
  );

  const context = stack.getContext();
  assert.equal(stack.isLlmPlanned(), true);
  assert.equal(context.activeSubtask?.id, "reach_surface");
  assert.deepEqual(
    context.pendingSubtasks.map((entry) => entry.id),
    ["reach_surface", "obtain_sapling", "plant_sapling"],
  );
});

test("TaskStackService advances past inventory subtasks when targetCount is already met", () => {
  const stack = new TaskStackService();
  stack.reset(
    "build a house",
    {
      timestamp: new Date().toISOString(),
      userObjective: "build a house",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "plains",
      health: 20,
      hunger: 20,
      inventory: [{ item: "planks", count: 12 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["grass"],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: [],
      goalProgress: 0,
    },
    {
      llmSubtasks: normalizeLlmSubtasks(
        [
          rawSubtask({
            id: "gather_planks",
            description: "Gather planks for building",
            planningFocus: "collect planks for house walls",
            expectedAction: "collect",
            targetItem: "planks",
            targetCount: 8,
          }),
          rawSubtask({
            id: "place_table",
            description: "Place a crafting table",
            planningFocus: "place one crafting_table nearby",
            expectedAction: "place",
            targetItem: "crafting_table",
          }),
        ],
        "build a house",
      ),
    },
  );

  const context = stack.getContext();
  assert.equal(context.activeSubtask?.id, "place_table");
  assert.equal(context.completedSubtasks.some((entry) => entry.id === "gather_planks"), true);
});

test("TaskStackService prependSubtasks inserts LLM refinement before active head", () => {
  const stack = new TaskStackService();
  stack.reset(
    "place a boat in water",
    {
      timestamp: new Date().toISOString(),
      userObjective: "place a boat in water",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "plains",
      health: 20,
      hunger: 20,
      inventory: [{ item: "boat", count: 2 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["grass"],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: [],
      goalProgress: 0,
    },
    {
      llmSubtasks: normalizeLlmSubtasks(
        [
          rawSubtask({
            id: "place_boat",
            description: "Place boat in water",
            planningFocus: "place one boat in water",
            expectedAction: "place",
            targetItem: "boat",
            destination: "aquatic",
          }),
        ],
        "place a boat in water",
      ),
    },
  );

  stack.prependSubtasks(
    normalizeLlmSubtasks(
      [
        rawSubtask({
          id: "locate_water",
          description: "Locate water",
          planningFocus: "explore toward water",
          expectedAction: "explore",
          targetItem: "",
          destination: "aquatic",
        }),
      ],
      "place a boat in water",
    ),
  );

  const context = stack.getContext();
  assert.equal(context.activeSubtask?.id, "locate_water");
  assert.deepEqual(
    context.pendingSubtasks.map((entry) => entry.id),
    ["locate_water", "place_boat"],
  );
});

test("TaskStackService expands missing prerequisites for LLM-planned place subtasks", () => {
  const stack = new TaskStackService();
  stack.reset(
    "mine for diamonds",
    {
      timestamp: new Date().toISOString(),
      userObjective: "mine for diamonds",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "plains",
      health: 20,
      hunger: 20,
      inventory: [{ item: "planks", count: 36 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["grass"],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: ["can_place_crafting_table"],
      goalProgress: 0,
    },
    {
      llmSubtasks: normalizeLlmSubtasks(
        [
          rawSubtask({
            id: "place_crafting_table",
            description: "Place a crafting table to enable tool crafting",
            planningFocus: "place one crafting_table nearby",
            expectedAction: "place",
            targetItem: "crafting_table",
          }),
          rawSubtask({
            id: "craft_wooden_pickaxe",
            description: "Craft a wooden pickaxe",
            planningFocus: "craft one wooden_pickaxe",
            expectedAction: "craft",
            targetItem: "wooden_pickaxe",
          }),
        ],
        "mine for diamonds",
      ),
    },
  );

  const context = stack.getContext();
  assert.deepEqual(
    context.pendingSubtasks.slice(0, 3).map((entry) => entry.id),
    ["craft_crafting_table", "place_crafting_table", "craft_wooden_pickaxe"],
  );
});
