import test from "node:test";
import assert from "node:assert/strict";
import { plannerUserPrompt } from "../src/planner/planner_prompts.ts";

process.env.CEREBRAS_API_KEY = "";

test("PlannerService does not keep collecting logs for diamond progression when wood is already sufficient", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "mine for diamonds",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "crafting_table", count: 1 },
        { item: "planks", count: 16 },
        { item: "log", count: 14 },
        { item: "log", count: 9 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["oak_tree", "stone_outcrop"],
      nearbyBlocks: ["stone", "log", "crafting_table"],
      nearbyEntities: [],
      lineOfSightTarget: "stone",
      interactionHints: ["crafting_table_in_inventory", "stone_visible", "can_craft_sticks", "structured_perception_only"],
      goalProgress: 0.2,
    },
    [],
    {
      sceneSummary: "Trees and exposed stone are nearby.",
      visibleResources: ["oak_tree", "stone_outcrop"],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: ["stone_outcrop"],
      confidenceNotes: [],
    },
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.notEqual(proposal.candidateAction.name, "collect");
  assert.notEqual(String(proposal.candidateAction.arguments.block_type ?? ""), "oak_log");
});

test("PlannerService prefers crafting planks for building goals before wandering", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "build a hut",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "cave",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "log", count: 3 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["oak_tree"],
      nearbyBlocks: ["stone", "log"],
      nearbyEntities: [],
      lineOfSightTarget: "stone",
      interactionHints: ["tree_visible", "structured_perception_only"],
      goalProgress: 0.1,
    },
    [],
    {
      sceneSummary: "A cave with some logs nearby.",
      visibleResources: ["oak_tree"],
      terrainAffordances: ["tight_space"],
      hazards: [],
      reachableTargets: ["oak_tree"],
      confidenceNotes: [],
    },
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "craft");
  assert.equal(String(proposal.candidateAction.arguments.item ?? ""), "planks");
});

test("PlannerService chooses placement when the executor says a crafting table can be placed now", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "build a hut",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "crafting_table", count: 1 },
        { item: "planks", count: 8 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["oak_tree"],
      nearbyBlocks: ["grass", "dirt", "stone"],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: ["crafting_table_in_inventory", "can_place_crafting_table", "can_place_crafting_table_underfoot", "structured_perception_only"],
      goalProgress: 0.4,
    },
    [],
    {
      sceneSummary: "There is open ground nearby.",
      visibleResources: ["oak_tree"],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: ["open_ground"],
      confidenceNotes: [],
    },
    ["step 1 | action=explore | outcome=failed (stuck)"],
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "place");
  assert.equal(String(proposal.candidateAction.arguments.block_type ?? ""), "crafting_table");
  assert.equal(String(proposal.candidateAction.arguments.location ?? ""), "nearby");
});

test("PlannerService still returns a proposal after blocked scan, place, and collect history", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "place a crafting table",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "crafting_table", count: 1 },
        { item: "planks", count: 8 },
        { item: "log", count: 23 },
        { item: "stick", count: 16 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: [],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: ["crafting_table_in_inventory", "can_place_crafting_table_underfoot", "can_place_crafting_table"],
      goalProgress: 0.5,
    },
    [
      "scan previously degraded with prediction_error=0.62 in improve visibility before committing",
      "place previously degraded with failed in place the crafted workstation into the world",
    ],
    {
      sceneSummary: "Open area",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: [],
      confidenceNotes: [],
    },
    ["step 1 | action=collect | outcome=failed (stuck)"],
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "place");
  assert.equal(String(proposal.candidateAction.arguments.location ?? ""), "nearby");
});

test("PlannerService prefers placing a door once it has been crafted", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "craft a door and place it",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "wooden_door", count: 3 },
        { item: "planks", count: 2 },
        { item: "log", count: 23 },
        { item: "stick", count: 16 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["crafting_table", "grass", "dirt"],
      nearbyEntities: [],
      lineOfSightTarget: "crafting_table",
      interactionHints: [
        "wooden_door_in_inventory",
        "can_place_wooden_door",
        "crafting_table_nearby",
        "structured_perception_only",
      ],
      goalProgress: 0.7,
    },
    [],
    {
      sceneSummary: "A placed crafting table and open wall space are nearby.",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: ["crafting_table"],
      confidenceNotes: [],
    },
    ["step 3 | action=craft | outcome=success"],
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "place");
  assert.equal(String(proposal.candidateAction.arguments.block_type ?? ""), "wooden_door");
});

test("PlannerService does not craft another table when one is already placed nearby", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "craft a door and place it",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "wooden_door", count: 3 },
        { item: "planks", count: 2 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["crafting_table"],
      nearbyEntities: [],
      lineOfSightTarget: "crafting_table",
      interactionHints: ["crafting_table_nearby", "wooden_door_in_inventory", "structured_perception_only"],
      goalProgress: 0.7,
    },
    [],
    {
      sceneSummary: "Crafting table is already placed nearby.",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: ["crafting_table"],
      confidenceNotes: [],
    },
    ["step 4 | action=craft | outcome=failed (No available recipe for crafting_table.)"],
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.notEqual(String(proposal.candidateAction.arguments.item ?? ""), "crafting_table");
});

test("PlannerService prefers placing a carried crafting table for placement objectives", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "place a crafting table",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "crafting_table", count: 1 },
        { item: "planks", count: 8 },
        { item: "log", count: 23 },
        { item: "stick", count: 16 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: [],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: ["crafting_table_in_inventory"],
      goalProgress: 0.5,
    },
    [],
    {
      sceneSummary: "Open area",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: [],
      confidenceNotes: [],
    },
    [],
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "place");
  assert.equal(String(proposal.candidateAction.arguments.location ?? ""), "nearby");
});

test("PlannerService prefers placing doors for place-doors-around objectives", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");
  const { TaskStackService } = await import("../src/planner/task_stack_service.ts");

  const stack = new TaskStackService();
  const worldState = {
    timestamp: new Date().toISOString(),
    userObjective: "place doors around yourself",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 20,
    inventory: [
      { item: "wooden_door", count: 3 },
      { item: "planks", count: 2 },
      { item: "log", count: 23 },
    ],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: ["grass", "dirt"],
    nearbyEntities: [],
    lineOfSightTarget: "grass",
    interactionHints: ["wooden_door_in_inventory", "can_place_wooden_door", "structured_perception_only"],
    goalProgress: 0.5,
  };
  stack.reset("place doors around yourself", worldState);

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    worldState,
    ["place previously degraded with failed in place the crafted door on a nearby wall opening"],
    {
      sceneSummary: "Open ground nearby.",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: [],
      confidenceNotes: [],
    },
    ["step 1 | action=place | outcome=failed (Unable to find a valid nearby door opening)"],
    stack.getContext(),
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "place");
  assert.equal(String(proposal.candidateAction.arguments.block_type ?? ""), "wooden_door");
  assert.notEqual(String(proposal.candidateAction.arguments.item ?? ""), "planks");
});

test("plannerUserPrompt includes recent run history", () => {
  const prompt = plannerUserPrompt(
    {
      timestamp: new Date().toISOString(),
      userObjective: "build a hut",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "cave",
      health: 20,
      hunger: 20,
      inventory: [{ item: "log", count: 3 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["oak_tree"],
      nearbyBlocks: ["stone", "log"],
      nearbyEntities: [],
      lineOfSightTarget: "stone",
      interactionHints: ["tree_visible", "structured_perception_only"],
      goalProgress: 0.1,
    },
    {
      sceneSummary: "A cave with some logs nearby.",
      visibleResources: ["oak_tree"],
      terrainAffordances: ["tight_space"],
      hazards: [],
      reachableTargets: ["oak_tree"],
      confidenceNotes: [],
    },
    ["step 1 | action=explore | outcome=failed (stuck)"],
    ["step 1 | action=explore | outcome=failed (stuck)"],
  );

  assert.match(prompt, /Recent run history/);
  assert.match(prompt, /explore/);
  assert.match(prompt, /Relevant memory\/issues/);
});

test("plannerUserPrompt bounds repeated context while retaining recent diagnostics and positions", () => {
  const prompt = plannerUserPrompt(
    {
      timestamp: new Date().toISOString(),
      userObjective: "obtain a resource",
      position: { x: 12, y: 28, z: -4 },
      biomeOrRegionHint: "underground",
      health: 20,
      hunger: 18,
      inventory: Array.from({ length: 20 }, (_, index) => ({ item: `item_${index}`, count: index + 1 })),
      equippedItem: "tool",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: Array.from({ length: 10 }, (_, index) => `hazard_${index}`),
      perceivedResources: Array.from({ length: 20 }, (_, index) => `resource_${index}`),
      nearbyBlocks: Array.from({ length: 30 }, (_, index) => `block_${index}`),
      nearbyEntities: Array.from({ length: 12 }, (_, index) => `entity_${index}`),
      lineOfSightTarget: "block_0",
      interactionHints: Array.from({ length: 30 }, (_, index) => `hint_${index}`),
      goalProgress: 0.4,
    },
    {
      sceneSummary: "A constrained underground route.",
      visibleResources: Array.from({ length: 12 }, (_, index) => `visible_${index}`),
      terrainAffordances: Array.from({ length: 12 }, (_, index) => `terrain_${index}`),
      hazards: Array.from({ length: 8 }, (_, index) => `perceived_hazard_${index}`),
      reachableTargets: Array.from({ length: 12 }, (_, index) => `target_${index}`),
      confidenceNotes: Array.from({ length: 20 }, (_, index) => `verbose_note_${index}`),
    },
    Array.from({ length: 10 }, (_, index) =>
      index === 8
        ? `memory_${index} issue_tags=stagnant_search suggested_fix=change_depth`
        : `memory_${index}`,
    ),
    Array.from({ length: 10 }, (_, index) => `step ${index + 1} | position=x=${index}, y=28, z=0`),
    {
      rootObjective: "obtain a resource",
      activeSubtask: { id: "active", description: "Reach the next frontier", planningFocus: "search down", compound: false },
      pendingSubtasks: Array.from({ length: 12 }, (_, index) => ({
        id: `pending_${index}`,
        description: `pending task ${index}`,
        planningFocus: `focus ${index}`,
        compound: false,
      })),
      completedSubtasks: Array.from({ length: 10 }, (_, index) => ({
        id: `done_${index}`,
        description: `completed task ${index}`,
        planningFocus: `done ${index}`,
        compound: false,
      })),
    },
  );

  assert.match(prompt, /stagnant_search/);
  assert.match(prompt, /step 10/);
  assert.doesNotMatch(prompt, /step 1 \|/);
  assert.doesNotMatch(prompt, /block_20/);
  assert.doesNotMatch(prompt, /verbose_note_0/);
  assert.ok(prompt.length < 3_500, `compact planner prompt was ${prompt.length} characters`);
});

test("PlannerService prefers placing a carried crafting table before tool crafts", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "craft one stone_pickaxe",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "crafting_table", count: 1 },
        { item: "cobblestone", count: 12 },
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
    [],
    {
      sceneSummary: "Open area",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: [],
      confidenceNotes: [],
    },
    [],
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "place");
  assert.equal(String(proposal.candidateAction.arguments.block_type ?? ""), "crafting_table");
});

test("PlannerService does not propose stone pickaxe craft without a nearby workstation", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
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
    [],
    {
      sceneSummary: "Open area",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: [],
      confidenceNotes: [],
    },
    ["step 8 | action=craft | outcome=failed (No available recipe for stone_pickaxe.)"],
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.notEqual(String(proposal.candidateAction.arguments.item ?? ""), "stone_pickaxe");
});

test("PlannerService switches to downward exploration when underground search is looping", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "collect diamond ore",
      position: { x: 2, y: 64, z: 3 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "iron_pickaxe", count: 1 },
        { item: "cobblestone", count: 41 },
        { item: "planks", count: 7 },
        { item: "stick", count: 12 },
      ],
      equippedItem: "iron_pickaxe",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["stone_outcrop"],
      nearbyBlocks: ["stone", "dirt", "grass"],
      nearbyEntities: [],
      lineOfSightTarget: "stone",
      interactionHints: ["holding_pickaxe", "stone_visible", "structured_perception_only"],
      goalProgress: 0.55,
    },
    [],
    {
      sceneSummary: "Surface stone is visible but no target ore is in sight.",
      visibleResources: ["stone_outcrop"],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: ["stone_outcrop"],
      confidenceNotes: [],
    },
    [
      'step 40 | action=scan | arguments={"direction":"forward_left"} | instruction=Scan forward_left for resources and hazards | outcome=success | position=x=0, y=64, z=0 | inventory=no inventory change | movement=dx=0, dy=0, dz=0',
      'step 41 | action=explore | arguments={"direction":"forward"} | instruction=Explore forward to improve position | outcome=success | position=x=0, y=64, z=0 | inventory=no inventory change | movement=dx=0.1, dy=0, dz=4.8',
      'step 42 | action=scan | arguments={"direction":"forward_left"} | instruction=Scan forward_left for resources and hazards | outcome=success | position=x=0, y=64, z=4.8 | inventory=no inventory change | movement=dx=0, dy=0, dz=0',
      'step 43 | action=explore | arguments={"direction":"forward"} | instruction=Explore forward to improve position | outcome=success | position=x=0.1, y=64, z=4.8 | inventory=no inventory change | movement=dx=0.1, dy=0, dz=4.9',
    ],
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "explore");
  assert.equal(String(proposal.candidateAction.arguments.direction ?? ""), "down");
});

test("PlannerService prefers placing a carried furnace when the active subtask requires smelting", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");
  const { TaskStackService } = await import("../src/planner/task_stack_service.ts");

  const worldState = {
    timestamp: new Date().toISOString(),
    userObjective: "mine diamonds",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 20,
    inventory: [
      { item: "furnace", count: 1 },
      { item: "iron_ore", count: 5 },
      { item: "stone_pickaxe", count: 1 },
      { item: "crafting_table", count: 1 },
      { item: "stick", count: 12 },
    ],
    equippedItem: "stone_pickaxe",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: ["grass", "dirt"],
    nearbyEntities: [],
    lineOfSightTarget: "grass",
    interactionHints: ["furnace_in_inventory", "structured_perception_only"],
    goalProgress: 0.55,
  };

  const stack = new TaskStackService();
  stack.reset("obtain an iron pickaxe", worldState);
  stack.onStepComplete(
    {
      objective: "obtain an iron pickaxe",
      instruction: "Craft 1 furnace",
      candidateAction: {
        name: "craft",
        arguments: { item: "furnace", count: 1 },
        reason: "Need a furnace before smelting.",
      },
      successCondition: { item: "furnace", count: 1 },
      maximumSteps: 180,
    },
    {
      status: "success",
      positionDelta: { x: 0, y: 0, z: 0 },
      inventoryDelta: [{ item: "furnace", countChange: 1 }],
      failureReason: null,
    },
    worldState,
  );

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    worldState,
    [],
    {
      sceneSummary: "Open area nearby.",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: [],
      confidenceNotes: [],
    },
    [],
    stack.getContext(),
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "place");
  assert.equal(String(proposal.candidateAction.arguments.block_type ?? ""), "furnace");
});

test("PlannerService proposes smelting when the task stack is on iron ingots and a furnace is nearby", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "smelt iron ore into iron ingots",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "forest_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "iron_ore", count: 5 },
        { item: "furnace", count: 1 },
        { item: "planks", count: 7 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["furnace", "grass", "dirt"],
      nearbyEntities: [],
      lineOfSightTarget: "furnace",
      interactionHints: ["furnace_nearby", "can_smelt_iron_ore", "structured_perception_only"],
      goalProgress: 0.6,
    },
    [],
    {
      sceneSummary: "A furnace is placed nearby.",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: ["furnace"],
      confidenceNotes: [],
    },
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "smelt");
  assert.equal(String(proposal.candidateAction.arguments.item ?? ""), "iron_ingot");
});

test("PlannerService keeps smelting logic generic for similar furnace tasks", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");

  const planner = new PlannerService();
  const result = await planner.proposeCandidates(
    {
      timestamp: new Date().toISOString(),
      userObjective: "smelt sand into glass",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "desert_edge",
      health: 20,
      hunger: 20,
      inventory: [
        { item: "sand", count: 4 },
        { item: "furnace", count: 1 },
        { item: "planks", count: 7 },
      ],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: [],
      nearbyBlocks: ["furnace", "sand", "dirt"],
      nearbyEntities: [],
      lineOfSightTarget: "furnace",
      interactionHints: ["furnace_nearby", "can_smelt", "can_smelt_sand", "structured_perception_only"],
      goalProgress: 0.6,
    },
    [],
    {
      sceneSummary: "A furnace is placed nearby.",
      visibleResources: [],
      terrainAffordances: ["open_ground"],
      hazards: [],
      reachableTargets: ["furnace"],
      confidenceNotes: [],
    },
  );

  const proposal = result.proposals[0];
  assert.ok(proposal, "expected a proposal");
  assert.equal(proposal.candidateAction.name, "smelt");
  assert.equal(String(proposal.candidateAction.arguments.input_item ?? ""), "sand");
  assert.equal(String(proposal.candidateAction.arguments.item ?? ""), "glass");
});

test("PlannerService places an already-crafted generic item at its requested destination", async () => {
  const { PlannerService } = await import("../src/planner/planner_service.ts");
  const { TaskStackService } = await import("../src/planner/task_stack_service.ts");
  const worldState = {
    timestamp: new Date().toISOString(),
    userObjective: "craft a boat and place it in a body of water",
    position: { x: 0, y: 63, z: 0 },
    biomeOrRegionHint: "river_bank",
    health: 20,
    hunger: 20,
    inventory: [{ item: "boat", count: 1 }],
    equippedItem: "boat",
    timeOfDay: "day" as const,
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: ["water"],
    nearbyBlocks: ["water", "grass"],
    nearbyEntities: [],
    lineOfSightTarget: "water",
    interactionHints: [],
    goalProgress: 0.5,
  };
  const stack = new TaskStackService();
  stack.reset(worldState.userObjective, worldState);

  const result = await new PlannerService().proposeCandidates(
    worldState,
    [],
    {
      sceneSummary: "A river is directly ahead.",
      visibleResources: ["water"],
      terrainAffordances: ["river_bank"],
      hazards: [],
      reachableTargets: ["water"],
      confidenceNotes: [],
    },
    [],
    stack.getContext(),
  );

  const proposal = result.proposals[0];
  assert.equal(proposal?.candidateAction.name, "place");
  assert.equal(proposal?.candidateAction.arguments.block_type, "boat");
  assert.equal(proposal?.candidateAction.arguments.location, "body_of_water");
});
