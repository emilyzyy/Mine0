import test from "node:test";
import assert from "node:assert/strict";
import {
  expandGoalPrerequisites,
  expandObtainItemChain,
  parseGoalFromObjective,
  placeFailureNeedsLocateDestination,
} from "../src/planner/goal_prerequisites.ts";
import { TaskStackService } from "../src/planner/task_stack_service.ts";

test("parseGoalFromObjective maps plant requests to place goals", () => {
  assert.deepEqual(parseGoalFromObjective("plant a sapling"), {
    action: "place",
    targetItem: "sapling",
  });
});

test("expandObtainItemChain inserts locate work when saplings are not visible", () => {
  const tasks = expandObtainItemChain("sapling", {
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
    nearbyBlocks: ["stone", "dirt"],
    nearbyEntities: [],
    lineOfSightTarget: "stone",
    interactionHints: [],
    goalProgress: 0,
  }, "goal_place_sapling");

  assert.deepEqual(
    tasks.map((task) => task.id),
    ["reach_surface_for_sapling", "locate_sapling", "obtain_sapling"],
  );
});

test("expandGoalPrerequisites nests obtain work before place goals", () => {
  const expanded = expandGoalPrerequisites(
    {
      id: "goal_place_sapling",
      description: "Place sapling",
      planningFocus: "place one sapling",
      compound: false,
      expectedAction: "place",
      targetItem: "sapling",
      parentId: "goal",
    },
    {
      timestamp: new Date().toISOString(),
      userObjective: "plant a sapling",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "plains",
      health: 20,
      hunger: 20,
      inventory: [],
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
  );

  assert.equal(expanded.at(-1)?.expectedAction, "place");
  assert.ok(expanded.some((task) => task.id === "locate_sapling"));
  assert.ok(expanded.some((task) => task.id === "obtain_sapling"));
});

test("TaskStackService decomposes plant a sapling into nested obtain-before-place work", () => {
  const stack = new TaskStackService();
  stack.reset("plant a sapling", {
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
  });

  const context = stack.getContext();
  assert.equal(context.activeSubtask?.id, "reach_surface_for_sapling");
  assert.ok(context.pendingSubtasks.some((task) => task.id === "obtain_sapling"));
  assert.ok(context.pendingSubtasks.some((task) => task.id === "goal_place_sapling"));
});

test("expandGoalPrerequisites inserts locate water before placing a boat in water", () => {
  const expanded = expandGoalPrerequisites(
    {
      id: "goal_place_boat",
      description: "Place boat in water",
      planningFocus: "place one boat in water",
      compound: false,
      expectedAction: "place",
      targetItem: "boat",
      destination: "in water",
      parentId: "goal",
    },
    {
      timestamp: new Date().toISOString(),
      userObjective: "place a boat in water",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "plains",
      health: 20,
      hunger: 20,
      inventory: [{ item: "boat", count: 15 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["grass", "dirt"],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: [],
      goalProgress: 0.5,
    },
  );

  assert.equal(expanded[0]?.id, "locate_water");
  assert.equal(expanded.at(-1)?.expectedAction, "place");
});

test("placeFailureNeedsLocateDestination detects missing water for boat placement", () => {
  assert.equal(
    placeFailureNeedsLocateDestination(
      "No reachable water target is available for boat.",
      {
        id: "goal_place_boat",
        description: "Place boat in water",
        planningFocus: "place one boat in water",
        compound: false,
        expectedAction: "place",
        targetItem: "boat",
        destination: "in water",
      },
      {
        timestamp: new Date().toISOString(),
        userObjective: "place a boat in water",
        position: { x: 0, y: 64, z: 0 },
        biomeOrRegionHint: "plains",
        health: 20,
        hunger: 20,
        inventory: [{ item: "boat", count: 15 }],
        equippedItem: "air",
        timeOfDay: "day",
        sceneSummary: null,
        visibleHazards: [],
        perceivedResources: [],
        nearbyBlocks: ["grass"],
        nearbyEntities: [],
        lineOfSightTarget: "grass",
        interactionHints: [],
        goalProgress: 0.5,
      },
    ),
    true,
  );
});

test("TaskStackService decomposes place a boat in water into locate-then-place work", () => {
  const stack = new TaskStackService();
  stack.reset("place a boat in water", {
    timestamp: new Date().toISOString(),
    userObjective: "place a boat in water",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "plains",
    health: 20,
    hunger: 20,
    inventory: [{ item: "boat", count: 15 }],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: ["grass", "dirt"],
    nearbyEntities: [],
    lineOfSightTarget: "grass",
    interactionHints: [],
    goalProgress: 0.5,
  });

  assert.equal(stack.getContext().activeSubtask?.id, "locate_water");
  assert.ok(stack.getContext().pendingSubtasks.some((task) => task.id === "goal_place_boat"));
});

test("TaskStackService inserts locate water after a failed boat placement", () => {
  const stack = new TaskStackService();
  const worldState = {
    timestamp: new Date().toISOString(),
    userObjective: "place a boat in water",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "plains",
    health: 20,
    hunger: 20,
    inventory: [{ item: "boat", count: 15 }],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: ["grass"],
    nearbyEntities: [],
    lineOfSightTarget: "grass",
    interactionHints: [],
    goalProgress: 0.5,
  };

  stack.reset("place a boat in water", worldState);
  stack.onStepComplete(
    {
      objective: "place a boat in water",
      instruction: "Explore forward to locate water",
      candidateAction: { name: "explore", arguments: { direction: "forward" }, reason: "locate water" },
      successCondition: { item: "water", count: 1 },
      maximumSteps: 160,
    },
    {
      status: "success",
      positionDelta: { x: 3, y: 0, z: 2 },
      inventoryDelta: [],
      failureReason: null,
    },
    worldState,
  );
  assert.equal(stack.getContext().activeSubtask?.id, "goal_place_boat");

  stack.onStepComplete(
    {
      objective: "place a boat in water",
      instruction: "Place boat at body_of_water",
      candidateAction: { name: "place", arguments: { block_type: "boat", location: "body_of_water" }, reason: "place boat" },
      successCondition: { item: "boat", count: 1 },
      maximumSteps: 180,
    },
    {
      status: "failed",
      positionDelta: { x: 0, y: 0, z: 0 },
      inventoryDelta: [],
      failureReason: "No reachable water target is available for boat.",
    },
    worldState,
  );

  assert.equal(stack.getContext().activeSubtask?.id, "locate_water");
});

test("TaskStackService advances to place after sapling is obtained", () => {
  const stack = new TaskStackService();
  const baseState = {
    timestamp: new Date().toISOString(),
    userObjective: "plant a sapling",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 20,
    inventory: [{ item: "sapling", count: 1 }],
    equippedItem: "air",
    timeOfDay: "day" as const,
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: ["oak_tree"],
    nearbyBlocks: ["grass", "sapling"],
    nearbyEntities: [],
    lineOfSightTarget: "grass",
    interactionHints: ["tree_visible", "sapling_visible"],
    goalProgress: 0.5,
  };

  stack.reset("plant a sapling", baseState);
  assert.equal(stack.getContext().activeSubtask?.expectedAction, "place");
  assert.equal(stack.getContext().activeSubtask?.targetItem, "sapling");
});
