import type { WorldState } from "../contracts/index.ts";
import type { PerceptionResult } from "../perception/perception_service.ts";
import type { PlannerProposal } from "./planner_service.ts";

export const ACTION_ALLOWLIST = [
  "scan",
  "explore",
  "collect",
  "craft",
  "smelt",
  "equip",
  "place",
] as const;

export function worldStatePrompt(worldState: WorldState): string {
  return JSON.stringify(
    {
      objective: worldState.userObjective,
      position: worldState.position,
      region: worldState.biomeOrRegionHint,
      health: worldState.health,
      hunger: worldState.hunger,
      inventory: worldState.inventory,
      equipped: worldState.equippedItem,
      hazards: worldState.visibleHazards.slice(0, 5),
      resources: worldState.perceivedResources.slice(0, 8),
      blocks: worldState.nearbyBlocks.slice(0, 12),
      entities: worldState.nearbyEntities.slice(0, 6),
      sight: worldState.lineOfSightTarget,
      hints: worldState.interactionHints.slice(0, 16),
      progress: worldState.goalProgress,
    },
  );
}

export function perceptionSystemPrompt(): string {
  return [
    "You are the perception stage of a Minecraft planning system.",
    "Infer a compact scene model for planning from Mineflayer-native structured state only.",
    "Prioritize the structured Mineflayer signals such as nearby blocks, nearby entities, line of sight, and interaction hints.",
    "Do not invent exact block coordinates or a complete nearby block list.",
    "Return concise structured planning cues only.",
  ].join(" ");
}

export function perceptionUserPrompt(worldState: WorldState): string {
  return [
    "Produce a scene model for the current Minecraft step.",
    "Treat the inventory as the bot's full current inventory, including any items it may have already had when it joined the server.",
    "",
    worldStatePrompt(worldState),
  ].join("\n");
}

export function plannerSystemPrompt(style: string): string {
  return [
    `You choose one bounded Minecraft Java 1.8.8 action (${style}).`,
    `Only use this action allowlist: ${ACTION_ALLOWLIST.join(", ")}.`,
    "The task stack is a nested dependency tree. Solve only the active head subtask or its immediate blocker.",
    "Work recursively: if the active head needs an item, obtain it first; if obtainment needs a resource area, locate that area first; if the area is not visible, search/pathfind toward the correct domain before collecting or placing.",
    "Search domains: surface/overground for trees, saplings, sand, and grass; subterranean/deeper for ores; aquatic/water for boats and fishing; local for nearby stone and simple blocks.",
    "If the bot is underground but the active head needs surface resources, pathfind upward to the surface before surface search.",
    "Return one atomic, verifiable action using Mineflayer blocks, entities, sight, and interaction hints as truth.",
    "Use recent positions/actions to detect loops. For search, choose a useful frontier direction; change direction or depth after revisits.",
    "Respect access requirements such as line of sight, adjacency, support, standing room, and placed workstations; reposition or clear space when blocked.",
    "Use legacy item names. Place carried workstations before workstation-dependent crafts. Prefer nearby or underfoot for floor placement.",
    "Do not skip ahead in the queue, repeat completed work, or attempt a downstream action while an upstream prerequisite is still active.",
    "Do not wander horizontally for better positioning when the active subtask requires depth change; use the direction implied by the subtask (down, up, etc.).",
  ].join(" ");
}

function compactPerception(perception: PerceptionResult): string {
  return JSON.stringify({
    scene: perception.sceneSummary,
    resources: perception.visibleResources.slice(0, 6),
    terrain: perception.terrainAffordances.slice(0, 6),
    hazards: perception.hazards.slice(0, 4),
    reachable: perception.reachableTargets.slice(0, 6),
  });
}

function selectPlannerMemories(memorySummary: string[]): string[] {
  const diagnostics = memorySummary.filter((entry) =>
    entry.includes("issue_tags=") || entry.includes("suggested_fix="),
  );
  const selected = [...diagnostics.slice(-3), ...memorySummary.slice(-2)];
  return [...new Set(selected)].slice(-4);
}

function compactTaskTree(
  taskContext: import("./task_stack_service.ts").TaskPlanningContext | null,
): string {
  if (!taskContext?.taskTree) {
    return "none";
  }

  const summarize = (
    node: NonNullable<typeof taskContext.taskTree>,
    depth = 0,
  ): string => {
    const label = `${node.status}:${node.description}`;
    if (depth >= 1 || node.children.length === 0) {
      return label;
    }
    return `${label}[${node.children.slice(0, 4).map((child) => summarize(child, depth + 1)).join("; ")}]`;
  };

  return summarize(taskContext.taskTree);
}

export function plannerUserPrompt(
  worldState: WorldState,
  perception: PerceptionResult,
  memorySummary: string[],
  recentHistorySummary: string[],
  taskContext: import("./task_stack_service.ts").TaskPlanningContext | null = null,
): string {
  const pending = (taskContext?.pendingSubtasks ?? []).slice(0, 6).map((entry) => entry.description);
  const completed = (taskContext?.completedSubtasks ?? []).slice(-4).map((entry) => entry.description);
  return [
    "Generate exactly one proposal. Advance the active task or its immediate blocker only.",
    "Think in nested prerequisites: missing item -> locate resource area -> search/pathfind -> collect/craft -> final action.",
    "Use issues/history to avoid failed or stagnant repeats unless state changed materially.",
    `Root: ${taskContext?.rootObjective ?? worldState.userObjective}`,
    `Active: ${taskContext?.activeSubtask?.description ?? worldState.userObjective}`,
    `Focus: ${taskContext?.activeSubtask?.planningFocus ?? worldState.userObjective}`,
    `Expected action: ${taskContext?.activeSubtask?.expectedAction ?? "infer from focus"}`,
    `Target item: ${taskContext?.activeSubtask?.targetItem ?? "none"}`,
    `Target count: ${taskContext?.activeSubtask?.targetCount ?? 1}`,
    `Search domain: ${taskContext?.activeSubtask?.destination ?? "infer from focus"}`,
    `Queue: ${pending.join(" > ") || "none"}`,
    `Completed: ${completed.join("; ") || "none"}`,
    `Task tree: ${compactTaskTree(taskContext)}`,
    "The actionName MUST match the active subtask expectedAction. Do not place items during collect/explore subtasks.",
    "World:",
    worldStatePrompt(worldState),
    "Perception:",
    compactPerception(perception),
    `Relevant memory/issues: ${JSON.stringify(selectPlannerMemories(memorySummary))}`,
    `Recent run history: ${JSON.stringify(recentHistorySummary.slice(-4))}`,
  ].join("\n");
}

export function rolloutSystemPrompt(variantCount: number): string {
  return [
    "You are a future rollout engine for Minecraft.",
    `Generate exactly ${variantCount} structured imagined futures for the same candidate action.`,
    "Keep the candidate action aligned with the proposal and vary confidence, path assumptions, timing, and risk.",
    "Do not propose impossible inventory gains or unsupported actions.",
  ].join(" ");
}

export function rolloutUserPrompt(
  worldState: WorldState,
  perception: PerceptionResult,
  proposal: PlannerProposal,
  variantCount: number,
): string {
  return [
    `Generate ${variantCount} imagined futures for this proposal.`,
    "World:",
    worldStatePrompt(worldState),
    "Perception:",
    compactPerception(perception),
    "Proposal:",
    JSON.stringify(proposal),
  ].join("\n");
}

export function criticSystemPrompt(): string {
  return [
    "You are the planning critic.",
    "Assess each candidate future against objective progress, risk, time, and compatibility with retrieved memory.",
    "Return one small adjustment per branch in the range [-0.05, 0.05] plus brief rationale.",
    "Do not change branch ids.",
  ].join(" ");
}

export function criticUserPrompt(
  worldState: WorldState,
  memorySummary: string[],
  futures: unknown,
): string {
  return [
    "Evaluate the following imagined futures.",
    "World:",
    worldStatePrompt(worldState),
    `Relevant memory/issues: ${JSON.stringify(selectPlannerMemories(memorySummary))}`,
    "Futures:",
    JSON.stringify(futures),
  ].join("\n");
}

const SUBTASK_ACTION_ALLOWLIST = [
  "scan",
  "explore",
  "collect",
  "craft",
  "smelt",
  "equip",
  "place",
  "use",
] as const;

export function taskDecompositionSystemPrompt(): string {
  return [
    "You decompose Minecraft Java 1.8.8 objectives into an ordered prerequisite queue of atomic subtasks.",
    `Each subtask must use one expectedAction from: ${SUBTASK_ACTION_ALLOWLIST.join(", ")}.`,
    "Every resource-oriented subtask MUST set targetItem and targetCount: the total quantity required in inventory to mark that subtask complete.",
    "Compute targetCount from the objective and subtract what is already in inventory; omit subtasks whose targetCount would be zero.",
    "Do not combine search and collection in one subtask. Use explore/scan to locate an area, then a separate collect/craft/smelt subtask with targetCount.",
    "Think recursively for every goal: missing item -> locate resource area -> search/pathfind -> collect or craft -> final action.",
    "Missing destination (water, surface, ore depth) -> locate/explore in the correct search domain before place/use/collect.",
    "Search domains for destination field: surface (trees, saplings, sand), subterranean (ores, deep stone), aquatic (water, boats), local (nearby stone/simple blocks).",
    "If underground and surface resources are needed, insert reach-surface explore/pathfind before surface search.",
    "Workstation-dependent crafts (tools, doors, furnace items) need place crafting_table before the craft when no table is accessible.",
    "Smelting chains need furnace placement and fuel when not already available.",
    "Use legacy item ids with underscores (oak_log, iron_ingot, boat, sapling, crafting_table, planks).",
    "Pick targetItem to match what the queue actually needs (for example planks if building, not logs, when planks are the consumed material).",
    "Return subtasks in execution order: prerequisites first, root goal last.",
    "Each subtask is atomic and verifiable. Use stable snake_case ids (obtain_sapling, locate_water, craft_stone_pickaxe).",
    "Use empty string for targetItem or destination when not applicable; use targetCount 1 for non-quantity subtasks like a single placement.",
    "Do not repeat work already satisfied by inventory counts or listed completed subtasks.",
  ].join(" ");
}

export function taskDecompositionUserPrompt(
  objective: string,
  worldState: WorldState,
  memorySummary: string[] = [],
): string {
  const inventorySummary = worldState.inventory.map((stack) => `${stack.item} x${stack.count}`).join(", ");
  return [
    "Decompose this objective into the full ordered subtask queue including all prerequisites.",
    `Root objective: ${objective}`,
    `Current inventory totals: ${inventorySummary || "empty"}`,
    `Recent planning memory: ${JSON.stringify(memorySummary.slice(-6))}`,
    "Current world:",
    worldStatePrompt(worldState),
  ].join("\n");
}

export function taskRefinementSystemPrompt(): string {
  return [
    "You repair a blocked Minecraft task plan by inserting prerequisite subtasks before the active subtask.",
    `Each inserted subtask must use one expectedAction from: ${SUBTASK_ACTION_ALLOWLIST.join(", ")}.`,
    "Each inserted subtask MUST include targetItem and targetCount when it involves inventory quantities.",
    "Only insert what is still missing given inventory, hints, and the failure reason.",
    "Do not repeat completed or queued work. Do not replace the active subtask.",
    "Use legacy item ids with underscores. Use empty string for unused targetItem or destination; targetCount 1 for one-shot steps.",
    "Return prerequisiteSubtasks in execution order (earliest first). Return an empty array if no new prerequisites are needed.",
  ].join(" ");
}

export function taskRefinementUserPrompt(
  objective: string,
  worldState: WorldState,
  taskContext: import("./task_stack_service.ts").TaskPlanningContext,
  failureReason: string,
  failedAction: string,
): string {
  const pending = taskContext.pendingSubtasks.slice(0, 8).map((entry) => ({
    id: entry.id,
    description: entry.description,
    planningFocus: entry.planningFocus,
    expectedAction: entry.expectedAction ?? "",
    targetItem: entry.targetItem ?? "",
    targetCount: entry.targetCount ?? 1,
  }));
  const completed = taskContext.completedSubtasks.slice(-6).map((entry) => entry.description);

  return [
    "The bot failed while executing the active subtask. Insert only the missing prerequisite subtasks.",
    `Root objective: ${objective}`,
    `Active subtask: ${taskContext.activeSubtask?.description ?? "unknown"}`,
    `Active focus: ${taskContext.activeSubtask?.planningFocus ?? "unknown"}`,
    `Failed action: ${failedAction}`,
    `Failure reason: ${failureReason}`,
    `Pending queue: ${JSON.stringify(pending)}`,
    `Completed: ${completed.join("; ") || "none"}`,
    "World:",
    worldStatePrompt(worldState),
  ].join("\n");
}
