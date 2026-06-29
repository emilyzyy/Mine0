import test from "node:test";
import assert from "node:assert/strict";
import { TaskStackService } from "../src/planner/task_stack_service.ts";
import { normalizeLlmSubtasks } from "../src/planner/task_decomposition_service.ts";

test("TaskStackService decomposes place doors around yourself into sequential door placements", () => {
  const stack = new TaskStackService();
  stack.reset("place doors around yourself", {
    timestamp: new Date().toISOString(),
    userObjective: "place doors around yourself",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 20,
    inventory: [{ item: "wooden_door", count: 3 }],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: [],
    nearbyEntities: [],
    lineOfSightTarget: null,
    interactionHints: [],
    goalProgress: 0,
  });

  const context = stack.getContext();
  assert.equal(context.pendingSubtasks.length, 3);
  assert.match(context.activeSubtask?.planningFocus ?? "", /door/i);
});

test("TaskStackService removes completed subtasks after a successful door placement", () => {
  const stack = new TaskStackService();
  stack.reset("place doors around yourself", {
    timestamp: new Date().toISOString(),
    userObjective: "place doors around yourself",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 20,
    inventory: [{ item: "wooden_door", count: 2 }],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: [],
    nearbyEntities: [],
    lineOfSightTarget: null,
    interactionHints: [],
    goalProgress: 0,
  });

  stack.onStepComplete(
    {
      objective: "place doors around yourself",
      instruction: "Place the wooden door on the nearest valid wall space",
      candidateAction: {
        name: "place",
        arguments: { block_type: "wooden_door", location: "nearby" },
        reason: "place one door",
      },
      successCondition: { item: "wooden_door", count: 1 },
      maximumSteps: 120,
    },
    {
      status: "success",
      positionDelta: { x: 0, y: 0, z: 0 },
      inventoryDelta: [{ item: "wooden_door", countChange: -1 }],
      failureReason: null,
    },
    {
      timestamp: new Date().toISOString(),
      userObjective: "place doors around yourself",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [{ item: "wooden_door", count: 1 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: [],
      nearbyEntities: [],
      lineOfSightTarget: null,
      interactionHints: [],
      goalProgress: 0.5,
    },
  );

  assert.equal(stack.getContext().completedSubtasks.length, 1);
  assert.equal(stack.getContext().pendingSubtasks.length, 1);
});

test("TaskStackService does not complete obtain iron pickaxe after crafting planks", () => {
  const stack = new TaskStackService();
  stack.reset("obtain an iron pickaxe", {
    timestamp: new Date().toISOString(),
    userObjective: "obtain an iron pickaxe",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 20,
    inventory: [
      { item: "planks", count: 18 },
      { item: "log", count: 19 },
      { item: "stick", count: 16 },
    ],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: [],
    nearbyEntities: [],
    lineOfSightTarget: null,
    interactionHints: [],
    goalProgress: 0,
  });

  stack.onStepComplete(
    {
      objective: "obtain an iron pickaxe",
      instruction: "Craft 4 planks",
      candidateAction: {
        name: "craft",
        arguments: { item: "planks", count: 4 },
        reason: "Need planks",
      },
      successCondition: { item: "planks", count: 4 },
      maximumSteps: 120,
    },
    {
      status: "success",
      positionDelta: { x: 0, y: 0, z: 0 },
      inventoryDelta: [{ item: "planks", countChange: 16 }],
      failureReason: null,
    },
    {
      timestamp: new Date().toISOString(),
      userObjective: "obtain an iron pickaxe",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "planks", count: 18 },
        { item: "log", count: 19 },
        { item: "stick", count: 16 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: [],
      nearbyEntities: [],
      lineOfSightTarget: null,
      interactionHints: [],
      goalProgress: 0.1,
    },
  );

  assert.equal(stack.isRootComplete("obtain an iron pickaxe", [{ item: "planks", count: 18 }], 0, false), false);
  assert.ok(stack.getContext().pendingSubtasks.length > 0);
  assert.notEqual(stack.getContext().activeSubtask?.planningFocus, "obtain an iron pickaxe");
});

test("TaskStackService inserts place-table work after a failed tool craft", () => {
  const stack = new TaskStackService();
  stack.reset("mine diamonds", {
    timestamp: new Date().toISOString(),
    userObjective: "mine diamonds",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 20,
    inventory: [
      { item: "crafting_table", count: 1 },
      { item: "cobblestone", count: 27 },
      { item: "stick", count: 14 },
      { item: "wooden_pickaxe", count: 1 },
    ],
    equippedItem: "wooden_pickaxe",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: ["grass", "dirt"],
    nearbyEntities: [],
    lineOfSightTarget: "grass",
    interactionHints: ["crafting_table_in_inventory", "can_place_crafting_table"],
    goalProgress: 0.4,
  });

  const activeBefore = stack.getContext().activeSubtask?.id;
  stack.onStepComplete(
    {
      objective: "mine diamonds",
      instruction: "Craft a stone pickaxe",
      candidateAction: {
        name: "craft",
        arguments: { item: "stone_pickaxe", count: 1 },
        reason: "Need stone tier",
      },
      successCondition: { item: "stone_pickaxe", count: 1 },
      maximumSteps: 180,
    },
    {
      status: "failed",
      positionDelta: { x: 0, y: 0, z: 0 },
      inventoryDelta: [],
      failureReason: "No available recipe for stone_pickaxe. Place a crafting table nearby first.",
    },
    {
      timestamp: new Date().toISOString(),
      userObjective: "mine diamonds",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "crafting_table", count: 1 },
        { item: "cobblestone", count: 27 },
        { item: "stick", count: 14 },
        { item: "wooden_pickaxe", count: 1 },
      ],
      equippedItem: "wooden_pickaxe",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["grass", "dirt"],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: ["crafting_table_in_inventory", "can_place_crafting_table"],
      goalProgress: 0.4,
    },
  );

  assert.equal(stack.getContext().activeSubtask?.id, "place_crafting_table");
  assert.ok(stack.getContext().pendingSubtasks.some((task) => task.id === activeBefore));
});

test("TaskStackService expands iron pickaxe progression through furnace and smelting prerequisites", () => {
  const stack = new TaskStackService();
  stack.reset("obtain an iron pickaxe", {
    timestamp: new Date().toISOString(),
    userObjective: "obtain an iron pickaxe",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 20,
    inventory: [
      { item: "crafting_table", count: 1 },
      { item: "stone_pickaxe", count: 1 },
      { item: "stick", count: 12 },
      { item: "cobblestone", count: 37 },
      { item: "iron_ore", count: 5 },
    ],
    equippedItem: "stone_pickaxe",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: ["grass", "dirt"],
    nearbyEntities: [],
    lineOfSightTarget: "grass",
    interactionHints: ["crafting_table_nearby", "structured_perception_only"],
    goalProgress: 0.45,
  });

  const context = stack.getContext();
  const pending = context.pendingSubtasks.map((task) => task.id);
  assert.ok(pending.includes("craft_furnace"));
  assert.ok(pending.includes("smelt_iron_ingots"));
  assert.ok(pending.includes("craft_iron_pickaxe"));
  const objectiveNode = context.taskTree?.children.find((node) => node.id === "obtain_iron_pickaxe");
  const craftNode = objectiveNode?.children.find((node) => node.id === "craft_iron_pickaxe");
  assert.ok(craftNode, "expected the target craft to be nested under the objective");
  assert.ok(craftNode.children.some((node) => node.id === "smelt_iron_ingots"));
});

test("TaskStackService drops stale upstream work when a later craft becomes achievable", () => {
  const stack = new TaskStackService();
  const baseState = {
    timestamp: new Date().toISOString(),
    userObjective: "mine diamonds",
    position: { x: 0, y: 32, z: 0 },
    biomeOrRegionHint: "underground",
    health: 20,
    hunger: 20,
    equippedItem: "stone_pickaxe",
    timeOfDay: "day" as const,
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: ["iron_ore", "stone"],
    nearbyEntities: [],
    lineOfSightTarget: "iron_ore",
    interactionHints: ["crafting_table_nearby", "furnace_nearby", "can_smelt_iron_ore"],
    goalProgress: 0.5,
  };

  stack.reset("mine diamonds", {
    ...baseState,
    inventory: [
      { item: "stone_pickaxe", count: 1 },
      { item: "stick", count: 12 },
      { item: "iron_ore", count: 5 },
    ],
  });
  assert.equal(stack.getContext().activeSubtask?.id, "smelt_iron_ingots");

  stack.onStepComplete(
    {
      objective: "mine diamonds",
      instruction: "Collect nearby material",
      candidateAction: { name: "collect", arguments: { block_type: "stone" }, reason: "continue" },
      successCondition: { item: "cobblestone", count: 1 },
      maximumSteps: 120,
    },
    {
      status: "success",
      positionDelta: { x: 1, y: 0, z: 0 },
      inventoryDelta: [{ item: "cobblestone", countChange: 1 }],
      failureReason: null,
    },
    {
      ...baseState,
      inventory: [
        { item: "stone_pickaxe", count: 1 },
        { item: "stick", count: 12 },
        { item: "iron_ingot", count: 5 },
        { item: "cobblestone", count: 1 },
      ],
    },
  );

  const context = stack.getContext();
  assert.equal(context.activeSubtask?.id, "craft_iron_pickaxe");
  assert.ok(!context.pendingSubtasks.some((task) => task.id === "collect_iron"));
  assert.ok(!context.pendingSubtasks.some((task) => task.id === "smelt_iron_ingots"));
});

test("TaskStackService reconciles equivalent prerequisite chains from current inventory", () => {
  const stack = new TaskStackService();
  const state = {
    timestamp: new Date().toISOString(),
    userObjective: "mine iron ore",
    position: { x: 0, y: 40, z: 0 },
    biomeOrRegionHint: "underground",
    health: 20,
    hunger: 20,
    inventory: [
      { item: "wooden_pickaxe", count: 1 },
      { item: "stick", count: 4 },
    ],
    equippedItem: "wooden_pickaxe",
    timeOfDay: "day" as const,
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: ["stone"],
    nearbyEntities: [],
    lineOfSightTarget: "stone",
    interactionHints: ["crafting_table_nearby"],
    goalProgress: 0.2,
  };

  stack.reset("mine iron ore", state);
  assert.equal(stack.getContext().activeSubtask?.id, "collect_cobblestone");

  stack.reconcile({
    ...state,
    inventory: [...state.inventory, { item: "cobblestone", count: 3 }],
  });

  assert.equal(stack.getContext().activeSubtask?.id, "craft_stone_pickaxe");
  assert.ok(!stack.getContext().pendingSubtasks.some((task) => task.id === "collect_cobblestone"));
});

test("TaskStackService advances a generic craft-then-place objective after one craft", () => {
  const stack = new TaskStackService();
  const state = {
    timestamp: new Date().toISOString(),
    userObjective: "craft a boat and place it in a body of water",
    position: { x: 0, y: 63, z: 0 },
    biomeOrRegionHint: "river_bank",
    health: 20,
    hunger: 20,
    inventory: [{ item: "planks", count: 12 }],
    equippedItem: "air",
    timeOfDay: "day" as const,
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: ["water"],
    nearbyBlocks: ["grass", "water"],
    nearbyEntities: [],
    lineOfSightTarget: "water",
    interactionHints: ["crafting_table_nearby"],
    goalProgress: 0,
  };

  stack.reset(state.userObjective, state);
  assert.equal(stack.getContext().activeSubtask?.expectedAction, "craft");
  assert.equal(stack.getContext().activeSubtask?.targetItem, "boat");

  stack.onStepComplete(
    {
      objective: state.userObjective,
      instruction: "Craft 1 boat",
      candidateAction: { name: "craft", arguments: { item: "boat", count: 1 }, reason: "craft it once" },
      successCondition: { item: "boat", count: 1 },
      maximumSteps: 120,
    },
    {
      status: "success",
      positionDelta: { x: 0, y: 0, z: 0 },
      inventoryDelta: [{ item: "boat", countChange: 1 }],
      failureReason: null,
    },
    {
      ...state,
      inventory: [
        { item: "planks", count: 7 },
        { item: "boat", count: 1 },
      ],
    },
  );

  const context = stack.getContext();
  assert.equal(context.activeSubtask?.expectedAction, "place");
  assert.equal(context.activeSubtask?.targetItem, "boat");
  assert.equal(context.completedSubtasks.filter((task) => task.expectedAction === "craft").length, 1);
  assert.equal(context.taskTree.children[0]?.status, "completed");
  assert.equal(context.taskTree.children[1]?.status, "active");
});

test("TaskStackService skips generic craft work when its artifact already exists", () => {
  const stack = new TaskStackService();
  stack.reset("craft a boat and place it in a body of water", {
    timestamp: new Date().toISOString(),
    userObjective: "craft a boat and place it in a body of water",
    position: { x: 0, y: 63, z: 0 },
    biomeOrRegionHint: "river_bank",
    health: 20,
    hunger: 20,
    inventory: [{ item: "boat", count: 13 }],
    equippedItem: "boat",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: ["water"],
    nearbyBlocks: ["water"],
    nearbyEntities: [],
    lineOfSightTarget: "water",
    interactionHints: [],
    goalProgress: 0.5,
  });

  assert.equal(stack.getContext().activeSubtask?.expectedAction, "place");
  assert.equal(stack.getContext().completedSubtasks.filter((task) => task.expectedAction === "craft").length, 1);
});

test("TaskStackService keeps downstream LLM subtasks pending until earlier ones finish", () => {
  const stack = new TaskStackService();
  stack.reset(
    "mine for diamonds",
    {
      timestamp: new Date().toISOString(),
      userObjective: "mine for diamonds",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [{ item: "planks", count: 36 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["oak_tree"],
      nearbyBlocks: ["grass", "log"],
      nearbyEntities: [],
      lineOfSightTarget: "oak_tree",
      interactionHints: ["tree_visible"],
      goalProgress: 0,
    },
    {
      llmSubtasks: normalizeLlmSubtasks(
        [
          {
            id: "locate_logs",
            description: "Find nearby trees to obtain logs for sticks",
            planningFocus: "find nearby trees to obtain logs for sticks",
            expectedAction: "explore",
            targetItem: "oak_log",
            targetCount: 2,
            destination: "surface",
          },
          {
            id: "collect_logs",
            description: "Collect logs for crafting sticks",
            planningFocus: "collect logs for crafting sticks",
            expectedAction: "collect",
            targetItem: "oak_log",
            targetCount: 2,
            destination: "surface",
          },
          {
            id: "craft_sticks",
            description: "Craft sticks from planks",
            planningFocus: "craft sticks from planks",
            expectedAction: "craft",
            targetItem: "stick",
            targetCount: 2,
            destination: "",
          },
        ],
        "mine for diamonds",
      ),
    },
  );

  const context = stack.getContext();
  assert.equal(context.activeSubtask?.id, "locate_logs");
  assert.equal(context.completedSubtasks.some((task) => task.id === "collect_logs"), false);
  assert.equal(context.completedSubtasks.some((task) => task.id === "craft_sticks"), false);
});

test("TaskStackService advances from locate to collect after successful collection proves visibility", () => {
  const stack = new TaskStackService();
  stack.reset(
    "mine for diamonds",
    {
      timestamp: new Date().toISOString(),
      userObjective: "mine for diamonds",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [{ item: "planks", count: 36 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["oak_tree"],
      nearbyBlocks: ["grass", "log"],
      nearbyEntities: [],
      lineOfSightTarget: "oak_tree",
      interactionHints: ["tree_visible"],
      goalProgress: 0,
    },
    {
      llmSubtasks: normalizeLlmSubtasks(
        [
          {
            id: "locate_logs",
            description: "Find nearby trees to obtain logs for sticks",
            planningFocus: "find nearby trees to obtain logs for sticks",
            expectedAction: "explore",
            targetItem: "oak_log",
            targetCount: 2,
            destination: "surface",
          },
          {
            id: "collect_logs",
            description: "Collect logs for crafting sticks",
            planningFocus: "collect logs for crafting sticks",
            expectedAction: "collect",
            targetItem: "oak_log",
            targetCount: 2,
            destination: "surface",
          },
        ],
        "mine for diamonds",
      ),
    },
  );

  stack.onStepComplete(
    {
      objective: "mine for diamonds",
      instruction: "Collect oak_log",
      candidateAction: {
        name: "collect",
        arguments: { block_type: "oak_log", count: 1 },
        reason: "visible tree",
      },
      successCondition: { item: "oak_log", count: 1 },
      maximumSteps: 120,
    },
    {
      status: "success",
      positionDelta: { x: 0, y: 0, z: 1 },
      inventoryDelta: [{ item: "oak_log", countChange: 1 }],
      failureReason: null,
    },
    {
      timestamp: new Date().toISOString(),
      userObjective: "mine for diamonds",
      position: { x: 1, y: 64, z: 1 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "planks", count: 36 },
        { item: "oak_log", count: 1 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["oak_tree"],
      nearbyBlocks: ["grass", "log"],
      nearbyEntities: [],
      lineOfSightTarget: "oak_tree",
      interactionHints: ["tree_visible"],
      goalProgress: 0.1,
    },
  );

  const context = stack.getContext();
  assert.equal(context.completedSubtasks.some((task) => task.id === "locate_logs"), true);
  assert.equal(context.activeSubtask?.id, "collect_logs");
});

