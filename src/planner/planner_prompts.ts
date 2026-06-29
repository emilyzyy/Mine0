import type { WorldState } from "../contracts/index.ts";
import type { ExecutorKind } from "../executor/executor_interface.ts";
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

function isJarvisRoute(executorKind: ExecutorKind): boolean {
  return executorKind === "jarvis" || executorKind === "jarvis-persistent";
}

const COMBAT_OBJECTIVE_RE = /\b(zombie|zombies|attack|fight|kill|sword|mob|hostile|combat)\b/i;

function isCombatObjective(objective: string): boolean {
  return COMBAT_OBJECTIVE_RE.test(objective);
}

function executorRouteLabel(executorKind: ExecutorKind): string {
  return isJarvisRoute(executorKind) ? "JARVIS-VLA visual-control route" : "Mineflayer structured-control route";
}

function executorPromptNotes(executorKind: ExecutorKind): string[] {
  if (isJarvisRoute(executorKind)) {
    return [
      "The active executor is JARVIS-VLA style visual control.",
      "Prefer subtasks and actions grounded in nearby, visible, and reachable affordances rather than Mineflayer-specific API assumptions.",
      "Use the structured observation snapshot as a compact planner-facing abstraction over what JARVIS currently knows.",
    ];
  }

  return [
    "The active executor is Mineflayer structured control.",
    "Prioritize Mineflayer-native structured signals such as nearby blocks, nearby entities, line of sight, and interaction hints.",
  ];
}

export function perceptionSystemPrompt(executorKind: ExecutorKind): string {
  return [
    "You are the perception stage of a Minecraft planning system.",
    ...executorPromptNotes(executorKind),
    "Do not invent exact block coordinates or a complete nearby block list.",
    "Return concise structured planning cues only.",
  ].join(" ");
}

export function perceptionUserPrompt(worldState: WorldState, executorKind: ExecutorKind): string {
  return [
    "Produce a scene model for the current Minecraft step.",
    `Executor route: ${executorRouteLabel(executorKind)}.`,
    "Treat the inventory as the bot's full current inventory, including any items it may have already had when it joined the server.",
    "",
    worldStatePrompt(worldState),
  ].join("\n");
}

export function plannerSystemPrompt(style: string, executorKind: ExecutorKind): string {
  return [
    `You choose one bounded Minecraft Java 1.8.8 action for the ${executorRouteLabel(executorKind)} (${style}).`,
    `Only use this action allowlist: ${ACTION_ALLOWLIST.join(", ")}.`,
    "The task stack is a nested dependency tree. Solve only the active head subtask or its immediate blocker.",
    "Work recursively: if the active head needs an item, obtain it first; if obtainment needs a resource area, locate that area first; if the area is not visible, search/pathfind toward the correct domain before collecting or placing.",
    "Search domains: surface/overground for trees, saplings, sand, and grass; subterranean/deeper for ores; aquatic/water for boats and fishing; local for nearby stone and simple blocks.",
    "If the bot is underground but the active head needs surface resources, pathfind upward to the surface before surface search.",
    isJarvisRoute(executorKind)
      ? "Return one atomic, verifiable action using visible, nearby, and reachable cues as truth. Do not depend on Mineflayer-only implementation details."
      : "Return one atomic, verifiable action using Mineflayer blocks, entities, sight, and interaction hints as truth.",
    "Use equipped item, inventory, and interaction hints to reason about tool suitability before proposing collection. If the current tool cannot harvest the visible target, first equip or obtain the correct tool instead of collecting unchanged.",
    "Use recent positions/actions to detect loops. For search, choose a useful frontier direction; change direction or depth after revisits.",
    "If recent collect attempts produced no inventory gain, treat that as evidence of a wrong tool, unreachable target, or wrong target block and recalibrate instead of repeating the same collect.",
    "If the active subtask is locate/search/explore and its target item is already visible and reachable, stop searching and choose collect immediately.",
    "Do not spend extra moves 'finalizing' a search phase once the target is already in sight.",
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
  executorKind: ExecutorKind = "mineflayer",
): string {
  const pending = (taskContext?.pendingSubtasks ?? []).slice(0, 6).map((entry) => entry.description);
  const completed = (taskContext?.completedSubtasks ?? []).slice(-4).map((entry) => entry.description);
  const activeSubtask = taskContext?.activeSubtask ?? null;
  const activeFocus = activeSubtask?.planningFocus?.toLowerCase() ?? "";
  const locateStyleSubtask =
    activeSubtask?.expectedAction === "explore" ||
    activeSubtask?.expectedAction === "scan" ||
    /\b(locate|search|pathfind|reach|find)\b/.test(activeFocus);
  const activeTargetVisible =
    locateStyleSubtask &&
    activeSubtask?.targetItem
      ? [
          ...worldState.perceivedResources,
          ...worldState.nearbyBlocks,
          ...perception.visibleResources,
          ...perception.reachableTargets,
          worldState.lineOfSightTarget ?? "",
        ]
          .filter(Boolean)
          .some((entry) => entry.toLowerCase().includes(activeSubtask.targetItem!.toLowerCase().replace(/_/g, " ")))
      : false;
  const actionGuidance =
    locateStyleSubtask && activeTargetVisible
      ? "collect now; target is already visible"
      : activeSubtask?.expectedAction ?? "infer from focus";
  const combatPlannerNote =
    isJarvisRoute(executorKind) && isCombatObjective(taskContext?.rootObjective ?? worldState.userObjective)
      ? "COMBAT MODE: Root objective is zombie/combat. Propose combat actions (scan, orient, approach, attack) only. Do NOT propose wood/tool/crafting steps."
      : null;
  return [
    "Generate exactly one proposal. Advance the active task or its immediate blocker only.",
    `Executor route: ${executorRouteLabel(executorKind)}.`,
    ...(combatPlannerNote ? [combatPlannerNote] : []),
    "Think in nested prerequisites: missing item -> locate resource area -> search/pathfind -> collect/craft -> final action.",
    "Use issues/history to avoid failed or stagnant repeats unless state changed materially.",
    `Root: ${taskContext?.rootObjective ?? worldState.userObjective}`,
    `Active: ${taskContext?.activeSubtask?.description ?? worldState.userObjective}`,
    `Focus: ${taskContext?.activeSubtask?.planningFocus ?? worldState.userObjective}`,
    `Expected action: ${taskContext?.activeSubtask?.expectedAction ?? "infer from focus"}`,
    `Immediate action guidance: ${actionGuidance}`,
    `Target item: ${taskContext?.activeSubtask?.targetItem ?? "none"}`,
    `Target count: ${taskContext?.activeSubtask?.targetCount ?? 1}`,
    `Search domain: ${taskContext?.activeSubtask?.destination ?? "infer from focus"}`,
    `Queue: ${pending.join(" > ") || "none"}`,
    `Completed: ${completed.join("; ") || "none"}`,
    `Task tree: ${compactTaskTree(taskContext)}`,
    "The actionName should match the active subtask expectedAction unless the active subtask is a locate/search/explore step whose target is already visible and reachable; in that case choose collect immediately.",
    "Read interaction hints carefully for tool suitability, workstation access, harvestability, and destination access before choosing collect or craft.",
    "Do not place items during collect/explore subtasks.",
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

export function taskDecompositionSystemPrompt(executorKind: ExecutorKind): string {
  return [
    "You decompose Minecraft Java 1.8.8 objectives into an ordered prerequisite queue of atomic subtasks.",
    `Plan specifically for the ${executorRouteLabel(executorKind)}.`,
    `Each subtask must use one expectedAction from: ${SUBTASK_ACTION_ALLOWLIST.join(", ")}.`,
    "Every resource-oriented subtask MUST set targetItem and targetCount: the total quantity required in inventory to mark that subtask complete.",
    "Compute targetCount from the objective and subtract what is already in inventory; omit subtasks whose targetCount would be zero.",
    "Do not combine search and collection in one subtask. Use explore/scan to locate an area, then a separate collect/craft/smelt subtask with targetCount.",
    "Think recursively for every goal: if the current head is not atomic or is blocked, break it into earlier prerequisite subtasks until each returned subtask is individually executable and verifiable.",
    "Infer prerequisites from Minecraft context, the current inventory, visible world state, nearby affordances, and the failure reason. Do not rely on canned routes or always assume the same crafting chain.",
    "Use equipped item, inventory tools, and harvestability cues to decide whether a collect subtask is executable now or requires equip/obtain-tool prerequisites first.",
    "If recent attempts failed without increasing inventory, treat that as evidence that the previous collect/tool assumption was wrong and adjust the prerequisite chain.",
    "When a craft or smelt is blocked, name the actual missing prerequisite items or access conditions needed by the current recipe or workstation, based on the provided context.",
    "Missing destination (water, surface, ore depth) -> locate/explore in the correct search domain before place/use/collect.",
    "Search domains for destination field: surface (trees, saplings, sand), subterranean (ores, deep stone), aquatic (water, boats), local (nearby stone/simple blocks).",
    "Use legacy item ids with underscores (oak_log, iron_ingot, boat, sapling, crafting_table, planks).",
    "Pick targetItem to match what the queue actually needs (for example planks if building, not logs, when planks are the consumed material).",
    isJarvisRoute(executorKind)
      ? [
          "For JARVIS, prefer subtasks that can be verified from visible scene changes, nearby affordances, inventory deltas, and explicit workstation setup.",
          "IMPORTANT: For JARVIS combat objectives (zombie, attack, fight, kill, sword, mob, hostile): produce ONLY combat-oriented subtasks such as scan_for_zombie, orient_to_zombie, approach_zombie, attack_zombie, verify_zombie_outcome.",
          "Do NOT add locate_trees, collect_logs, craft_sword, or any wood/tool/crafting prerequisites for combat objectives.",
        ].join(" ")
      : "For Mineflayer, use the structured nearby-block and interaction hints to keep subtasks grounded.",
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
  executorKind: ExecutorKind = "mineflayer",
  taskContext: import("./task_stack_service.ts").TaskPlanningContext | null = null,
  recentHistorySummary: string[] = [],
  activeSubtaskOnly = false,
): string {
  const inventorySummary = worldState.inventory.map((stack) => `${stack.item} x${stack.count}`).join(", ");
  const combatHint =
    isJarvisRoute(executorKind) && isCombatObjective(objective)
      ? [
          "CRITICAL — COMBAT OBJECTIVE DETECTED: This objective involves combat or zombie killing.",
          "You MUST produce ONLY combat subtasks: scan_for_zombie, orient_to_zombie, approach_zombie, attack_zombie, verify_zombie_outcome.",
          "Do NOT output locate_trees, collect_logs, craft_planks, craft_sword, place_crafting_table, or any wood/tool/crafting subtask.",
          "Assume the player already has or can find what they need to fight. Focus on the combat sequence only.",
        ].join(" ")
      : null;
  return [
    activeSubtaskOnly
      ? "Decompose the current active subtask into a full ordered child queue including any missing prerequisites before retrying the blocked or non-atomic head."
      : "Decompose this objective into the full ordered subtask queue including all prerequisites.",
    `Executor route: ${executorRouteLabel(executorKind)}.`,
    ...(combatHint ? [combatHint] : []),
    `Root objective: ${taskContext?.rootObjective ?? objective}`,
    `Decomposition target: ${taskContext?.activeSubtask?.description ?? objective}`,
    `Decomposition focus: ${taskContext?.activeSubtask?.planningFocus ?? objective}`,
    `Expected action: ${taskContext?.activeSubtask?.expectedAction ?? "infer from focus"}`,
    `Target item: ${taskContext?.activeSubtask?.targetItem ?? "none"}`,
    `Target count: ${taskContext?.activeSubtask?.targetCount ?? 1}`,
    `Search domain: ${taskContext?.activeSubtask?.destination ?? "infer from focus"}`,
    `Current inventory totals: ${inventorySummary || "empty"}`,
    `Recent planning memory: ${JSON.stringify(memorySummary.slice(-6))}`,
    `Pending queue: ${JSON.stringify((taskContext?.pendingSubtasks ?? []).slice(0, 8).map((entry) => ({
      id: entry.id,
      description: entry.description,
      planningFocus: entry.planningFocus,
      expectedAction: entry.expectedAction ?? "",
      targetItem: entry.targetItem ?? "",
      targetCount: entry.targetCount ?? 1,
      destination: entry.destination ?? "",
    })))}`,
    `Completed tasks: ${JSON.stringify((taskContext?.completedSubtasks ?? []).slice(-8).map((entry) => entry.description))}`,
    `Task tree: ${compactTaskTree(taskContext)}`,
    `Recent run history: ${JSON.stringify(recentHistorySummary.slice(-6))}`,
    "Current world:",
    worldStatePrompt(worldState),
  ].join("\n");
}

export function taskRefinementSystemPrompt(executorKind: ExecutorKind): string {
  return [
    "You repair a blocked Minecraft task plan by inserting prerequisite subtasks before the active subtask.",
    `Repair the plan specifically for the ${executorRouteLabel(executorKind)}.`,
    `Each inserted subtask must use one expectedAction from: ${SUBTASK_ACTION_ALLOWLIST.join(", ")}.`,
    "Each inserted subtask MUST include targetItem and targetCount when it involves inventory quantities.",
    "Only insert what is still missing given inventory, hints, and the failure reason.",
    "Do not repeat completed or queued work. Do not replace the active subtask.",
    "Use legacy item ids with underscores. Use empty string for unused targetItem or destination; targetCount 1 for one-shot steps.",
    "Infer prerequisites from the current Minecraft state instead of following canned crafting or mining routes.",
    "If a recipe, station, path, destination, or tool is missing, name the actual missing prerequisite item or access step needed now.",
    "If the failed step was collect and inventory did not increase, reconsider tool suitability, reachability, and target choice before retrying collect.",
    isJarvisRoute(executorKind)
      ? "For JARVIS, bias toward nearby setup, visibility recovery, and explicit workstation or destination access before retrying the blocked action."
      : "For Mineflayer, bias toward prerequisite subtasks that make structured-state affordances available before retrying.",
    "Return prerequisiteSubtasks in execution order (earliest first). Return an empty array if no new prerequisites are needed.",
  ].join(" ");
}

export function taskRefinementUserPrompt(
  objective: string,
  worldState: WorldState,
  taskContext: import("./task_stack_service.ts").TaskPlanningContext,
  failureReason: string,
  failedAction: string,
  executorKind: ExecutorKind = "mineflayer",
  recentHistorySummary: string[] = [],
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
    `Executor route: ${executorRouteLabel(executorKind)}.`,
    `Root objective: ${objective}`,
    `Active subtask: ${taskContext.activeSubtask?.description ?? "unknown"}`,
    `Active focus: ${taskContext.activeSubtask?.planningFocus ?? "unknown"}`,
    `Failed action: ${failedAction}`,
    `Failure reason: ${failureReason}`,
    `Pending queue: ${JSON.stringify(pending)}`,
    `Completed: ${completed.join("; ") || "none"}`,
    `Task tree: ${compactTaskTree(taskContext)}`,
    `Recent run history: ${JSON.stringify(recentHistorySummary.slice(-6))}`,
    "World:",
    worldStatePrompt(worldState),
  ].join("\n");
}
