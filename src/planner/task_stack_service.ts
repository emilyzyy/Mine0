import type { ActionOutcome } from "../contracts/action_outcome.ts";
import type { SubgoalIntent } from "../contracts/subgoal_intent.ts";
import type { WorldState } from "../contracts/world_state.ts";
import {
  buildWorkstationPrerequisiteSubtasks,
  countInventoryItem,
  craftFailureNeedsWorkstation,
  extractCraftItemFromFocus,
  prependWorkstationPrerequisites,
} from "./craft_prerequisites.ts";
import {
  collectFailureNeedsLocate,
  expandAccessPrerequisites,
  expandDestinationPrerequisites,
  expandGoalPrerequisites,
  expandObtainItemChain,
  inventoryHasItem,
  isTargetVisibleForItem,
  locateSearchSatisfied,
  parseGoalFromObjective,
  placeFailureNeedsLocateDestination,
  verificationNeedsLocateSubtask,
  inferDestinationRequirement,
} from "./goal_prerequisites.ts";
import type { VerificationResult } from "../verifier/verification_service.ts";
import {
  subtaskCompletesFromInventory,
  subtaskRequirementMet,
} from "./subtask_progress.ts";

export interface Subtask {
  id: string;
  description: string;
  planningFocus: string;
  compound: boolean;
  parentId?: string;
  expectedAction?: string;
  targetItem?: string;
  targetCount?: number;
  destination?: string;
}

export interface TaskTreeNode {
  id: string;
  description: string;
  planningFocus: string;
  status: "active" | "pending" | "completed";
  expectedAction?: string;
  children: TaskTreeNode[];
}

export interface TaskPlanningContext {
  rootObjective: string;
  activeSubtask: Subtask | null;
  pendingSubtasks: Subtask[];
  completedSubtasks: Subtask[];
  taskTree?: TaskTreeNode;
}

export interface TaskStackResetOptions {
  llmSubtasks?: Subtask[];
}

export interface TaskStackStepOptions {
  skipFailureHeuristics?: boolean;
}

const SMELT_FOCUS_RULES: Array<{ outputItem: string; keywords: string[] }> = [
  { outputItem: "iron_ingot", keywords: ["iron ore", "iron_ore", "iron ingot", "iron_ingot"] },
  { outputItem: "gold_ingot", keywords: ["gold ore", "gold_ore", "gold ingot", "gold_ingot"] },
  { outputItem: "glass", keywords: ["sand", "glass"] },
  { outputItem: "stone", keywords: ["smelt cobblestone", "smelt stone"] },
];

function inferSmeltOutputFromFocus(focus: string): string | null {
  const normalized = focus.toLowerCase();
  if (!normalized.includes("smelt")) {
    return null;
  }

  for (const rule of SMELT_FOCUS_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.outputItem;
    }
  }

  return null;
}

function inventoryMeetsFocus(focus: string, inventory: WorldState["inventory"], targetItem?: string | null): boolean {
  const normalized = focus.toLowerCase();

  if (targetItem && inventoryHasItem(inventory, targetItem)) {
    if (normalized.includes("place") || normalized.includes("plant") || normalized.includes("use")) {
      return true;
    }
    if (normalized.includes("collect") || normalized.includes("obtain")) {
      return true;
    }
  }

  if (normalized.includes("iron pickaxe")) {
    return countInventoryItem(inventory, "iron_pickaxe") >= 1;
  }

  if (normalized.includes("stone pickaxe")) {
    return countInventoryItem(inventory, "stone_pickaxe") >= 1;
  }

  if (normalized.includes("wooden pickaxe")) {
    return countInventoryItem(inventory, "wooden_pickaxe") >= 1;
  }

  if (normalized.includes("diamond")) {
    return countInventoryItem(inventory, "diamond") >= 1;
  }

  const parsed = parseGoalFromObjective(focus);
  if (parsed && (parsed.action === "collect" || parsed.action === "place" || parsed.action === "use")) {
    return inventoryHasItem(inventory, parsed.targetItem);
  }

  return false;
}

function taskIdPart(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase();
}

function normalizeObjectiveItem(value: string): string {
  const withoutArticle = value.trim().replace(/^(?:a|an|one|the)\s+/i, "");
  const itemPhrase = withoutArticle.split(/\s+(?:in|into|on|onto|at|near|by|beside|under)\s+/i)[0] ?? withoutArticle;
  return itemPhrase.trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/gi, "").toLowerCase();
}

function decomposeSequentialObjective(objective: string): Subtask[] {
  const clauses = objective.split(/\s*(?:,|\band then\b|\bthen\b|\band\b)\s*/i).filter(Boolean);
  const tasks: Subtask[] = [];
  let referencedItem: string | null = null;

  for (const clause of clauses) {
    const actionMatch = clause.trim().toLowerCase().match(/^(craft|make|place|put|collect|gather|mine|smelt|equip|use|plant|grow)\b\s*(.*)$/i);
    if (!actionMatch) {
      continue;
    }

    const rawAction = actionMatch[1]?.toLowerCase() ?? "";
    const remainder = actionMatch[2]?.trim() ?? "";
    const expectedAction = rawAction === "make"
      ? "craft"
      : rawAction === "put" || rawAction === "plant" || rawAction === "grow"
        ? "place"
        : rawAction === "gather" || rawAction === "mine"
          ? "collect"
          : rawAction;
    const targetItem: string = /^(?:it|them)\b/i.test(remainder) && referencedItem
      ? referencedItem
      : normalizeObjectiveItem(remainder);
    if (!targetItem) {
      continue;
    }

    if (["craft", "collect", "smelt"].includes(expectedAction)) {
      referencedItem = targetItem;
    }
    const destinationMatch = remainder.match(/\b(in|into|on|onto|at|near|by|beside|under)\s+(.+)$/i);
    const destination = destinationMatch ? `${destinationMatch[1]} ${destinationMatch[2]}` : undefined;
    const readableItem = targetItem.replace(/_/g, " ");
    const verb = expectedAction.charAt(0).toUpperCase() + expectedAction.slice(1);
    tasks.push({
      id: `sequence_${tasks.length + 1}_${expectedAction}_${taskIdPart(targetItem)}`,
      description: `${verb} ${readableItem}${destination ? ` ${destination}` : ""}`,
      planningFocus: `${expectedAction} one ${targetItem}${destination ? ` ${destination}` : ""}`,
      compound: false,
      parentId: "goal",
      expectedAction,
      targetItem,
      ...(destination ? { destination } : {}),
    });
  }

  return tasks.length >= 2 ? tasks : [];
}

function decomposeGenericObjective(objective: string): Subtask[] | null {
  const normalized = objective.toLowerCase();
  if (
    normalized.includes(" around ") ||
    normalized.includes("pickaxe") ||
    (normalized.includes("diamond") && normalized.includes("mine")) ||
    (normalized.includes("iron") && normalized.includes("ore") && normalized.includes("mine"))
  ) {
    return null;
  }

  const parsed = parseGoalFromObjective(objective);
  if (!parsed) {
    return null;
  }

  const readableItem = parsed.targetItem.replace(/_/g, " ");
  const verb =
    parsed.action === "place"
      ? "Place"
      : parsed.action === "craft"
        ? "Craft"
        : parsed.action === "collect"
          ? "Collect"
          : parsed.action === "smelt"
            ? "Smelt"
            : parsed.action.charAt(0).toUpperCase() + parsed.action.slice(1);

  return [
    {
      id: `goal_${parsed.action}_${taskIdPart(parsed.targetItem)}`,
      description: `${verb} ${readableItem}${parsed.destination ? ` ${parsed.destination}` : ""}`,
      planningFocus: `${parsed.action} one ${parsed.targetItem}${parsed.destination ? ` ${parsed.destination}` : ""}`,
      compound: false,
      parentId: "goal",
      expectedAction: parsed.action,
      targetItem: parsed.targetItem,
      ...(parsed.destination ? { destination: parsed.destination } : {}),
    },
  ];
}

function decomposeRootObjective(objective: string, worldState: WorldState): Subtask[] {
  const normalized = objective.toLowerCase();
  const sequentialTasks = decomposeSequentialObjective(objective);
  if (sequentialTasks.length > 0) {
    return sequentialTasks;
  }

  const genericTasks = decomposeGenericObjective(objective);
  if (genericTasks) {
    return genericTasks;
  }

  if (normalized.includes("iron pickaxe") || (normalized.includes("iron") && normalized.includes("pickaxe"))) {
    return [
      {
        id: "obtain_iron_pickaxe",
        description: "Obtain an iron pickaxe",
        planningFocus: "craft one iron pickaxe",
        compound: true,
      },
    ];
  }

  if (normalized.includes("door") && normalized.includes("around")) {
    const availableDoors = countInventoryItem(worldState.inventory, "wooden_door");
    const targetCount = Math.min(4, Math.max(availableDoors, 1));
    return Array.from({ length: targetCount }, (_, index) => ({
      id: `place_door_${index + 1}`,
      description: `Place wooden door ${index + 1} of ${targetCount} around yourself`,
      planningFocus: "place one wooden door nearby while standing clear of the opening",
      compound: false,
    }));
  }

  if (normalized.includes("diamond") && (normalized.includes("mine") || normalized.includes("get") || normalized.includes("obtain"))) {
    return [
      {
        id: "mine_diamond",
        description: "Mine a diamond",
        planningFocus: "mine a diamond ore block",
        compound: true,
      },
    ];
  }

  if (normalized.includes("door") && normalized.includes("place")) {
    return [
      {
        id: "place_door",
        description: "Place a wooden door",
        planningFocus: "place one wooden door nearby",
        compound: false,
      },
    ];
  }

  if (normalized.includes("crafting table") && normalized.includes("place")) {
    return [
      {
        id: "place_crafting_table",
        description: "Place a crafting table",
        planningFocus: "place the crafting table on nearby floor space",
        compound: false,
      },
    ];
  }

  return [
    {
      id: "root",
      description: objective,
      planningFocus: objective,
      compound: true,
    },
  ];
}

function makeCraftSubtask(id: string, description: string, item: string): Subtask {
  return {
    id,
    description,
    planningFocus: `craft one ${item}`,
    compound: false,
    expectedAction: "craft",
    targetItem: item,
  };
}

function buildMissingPlacementPrerequisites(subtask: Subtask, worldState: WorldState): Subtask[] {
  const targetItem = subtask.targetItem?.toLowerCase();
  if (!targetItem || inventoryHasItem(worldState.inventory, targetItem)) {
    return [];
  }

  if (targetItem === "crafting_table") {
    const planks = countInventoryItem(worldState.inventory, "planks");
    const logs = countInventoryItem(worldState.inventory, "oak_log");
    const tasks: Subtask[] = [];
    if (planks < 4 && logs > 0) {
      tasks.push(makeCraftSubtask("craft_planks_for_workstation", "Craft planks for a crafting table", "planks"));
    }
    if (planks >= 4 || logs > 0) {
      tasks.push(makeCraftSubtask("craft_crafting_table", "Craft a crafting table", "crafting_table"));
    }
    return tasks;
  }

  return [];
}

function makeCollectSubtask(id: string, description: string, focus: string): Subtask {
  return {
    id,
    description,
    planningFocus: focus,
    compound: false,
    expectedAction: "collect",
  };
}

function makePlaceSubtask(id: string, description: string, focus: string, targetItem?: string): Subtask {
  return {
    id,
    description,
    planningFocus: focus,
    compound: false,
    expectedAction: "place",
    ...(targetItem ? { targetItem } : {}),
  };
}

function makeSmeltSubtask(id: string, description: string, focus: string): Subtask {
  return {
    id,
    description,
    planningFocus: focus,
    compound: false,
    expectedAction: "smelt",
  };
}

function assignPrerequisiteHierarchy(tasks: Subtask[], parentId: string): Subtask[] {
  const target = tasks.at(-1);
  if (!target) {
    return tasks;
  }

  target.parentId = parentId;
  for (const task of tasks.slice(0, -1)) {
    task.parentId ??= target.id;
  }
  return tasks;
}

function expandWoodenPickaxeChain(worldState: WorldState): Subtask[] {
  if (countInventoryItem(worldState.inventory, "wooden_pickaxe") >= 1) {
    return [];
  }

  const sticks = countInventoryItem(worldState.inventory, "stick");
  const planks = countInventoryItem(worldState.inventory, "planks");
  const tasks: Subtask[] = [];

  if (sticks < 2 && planks >= 2) {
    tasks.push(makeCraftSubtask("craft_sticks_for_tools", "Craft sticks for tools", "stick"));
  }

  tasks.push(makeCraftSubtask("craft_wooden_pickaxe", "Craft a wooden pickaxe", "wooden_pickaxe"));
  return prependWorkstationPrerequisites(worldState, tasks);
}

function expandStonePickaxeChain(worldState: WorldState): Subtask[] {
  if (countInventoryItem(worldState.inventory, "stone_pickaxe") >= 1) {
    return [];
  }

  const tasks: Subtask[] = [...expandWoodenPickaxeChain(worldState)];
  const cobblestone = countInventoryItem(worldState.inventory, "cobblestone");

  if (cobblestone < 3) {
    tasks.push(makeCollectSubtask("collect_cobblestone", "Collect cobblestone for a stone pickaxe", "collect stone for cobblestone"));
  }

  tasks.push(makeCraftSubtask("craft_stone_pickaxe", "Craft a stone pickaxe", "stone_pickaxe"));
  return prependWorkstationPrerequisites(worldState, tasks);
}

function expandIronPickaxeChain(worldState: WorldState): Subtask[] {
  if (countInventoryItem(worldState.inventory, "iron_pickaxe") >= 1) {
    return [];
  }

  const tasks: Subtask[] = [...expandStonePickaxeChain(worldState)];
  const ironIngots = countInventoryItem(worldState.inventory, "iron_ingot");
  const ironOre = countInventoryItem(worldState.inventory, "iron_ore");
  const sticks = countInventoryItem(worldState.inventory, "stick");
  const planks = countInventoryItem(worldState.inventory, "planks");
  const furnaces = countInventoryItem(worldState.inventory, "furnace");
  const furnaceNearby = worldState.interactionHints.includes("furnace_nearby");

  if (sticks < 2 && planks >= 2) {
    tasks.push(makeCraftSubtask("craft_sticks_for_iron_pickaxe", "Craft sticks for an iron pickaxe", "stick"));
  }

  if (ironIngots < 3 && ironOre < 3) {
    tasks.push(makeCollectSubtask("collect_iron", "Collect iron ore for an iron pickaxe", "collect iron ore"));
  }

  if (ironIngots < 3 && ironOre > 0) {
    if (furnaces < 1 && !furnaceNearby) {
      tasks.push(makeCraftSubtask("craft_furnace", "Craft a furnace", "furnace"));
    }
    if (furnaces > 0 && !furnaceNearby) {
      tasks.push(makePlaceSubtask("place_furnace", "Place a furnace within reach", "place one furnace nearby", "furnace"));
    }
    tasks.push(makeSmeltSubtask("smelt_iron_ingots", "Smelt iron ore into iron ingots", "smelt iron ore into iron ingots"));
  }

  tasks.push(makeCraftSubtask("craft_iron_pickaxe", "Craft an iron pickaxe", "iron_pickaxe"));
  return prependWorkstationPrerequisites(worldState, tasks);
}

function requiredToolForCollectionFocus(focus: string): "wooden_pickaxe" | "stone_pickaxe" | "iron_pickaxe" | null {
  if (focus.includes("diamond")) {
    return "iron_pickaxe";
  }

  if (focus.includes("iron ore") || focus.includes("iron_ore")) {
    return "stone_pickaxe";
  }

  if (
    focus.includes("stone") ||
    focus.includes("cobblestone") ||
    focus.includes("coal") ||
    focus.includes("ore")
  ) {
    return "wooden_pickaxe";
  }

  return null;
}

function expandToolChainForRequirement(
  requiredTool: "wooden_pickaxe" | "stone_pickaxe" | "iron_pickaxe",
  worldState: WorldState,
): Subtask[] {
  if (requiredTool === "wooden_pickaxe") {
    return expandWoodenPickaxeChain(worldState);
  }

  if (requiredTool === "stone_pickaxe") {
    return expandStonePickaxeChain(worldState);
  }

  return expandIronPickaxeChain(worldState);
}

function normalizeCollectionFocus(focus: string): string {
  if (focus.includes("diamond")) {
    return "collect diamond ore";
  }

  if (focus.includes("iron")) {
    return "collect iron ore";
  }

  if (focus.includes("stone") || focus.includes("cobblestone")) {
    return "collect stone for cobblestone";
  }

  return focus;
}

function expandCollectionChain(focus: string, worldState: WorldState): Subtask[] {
  const requiredTool = requiredToolForCollectionFocus(focus);
  const tasks = requiredTool ? expandToolChainForRequirement(requiredTool, worldState) : [];
  tasks.push({
    id: `collect_${normalizeCollectionFocus(focus).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")}`,
    description: normalizeCollectionFocus(focus),
    planningFocus: normalizeCollectionFocus(focus),
    compound: false,
  });
  return tasks;
}

function expandCompoundSubtask(
  subtask: Subtask,
  worldState: WorldState,
  satisfiedLocateIds: ReadonlySet<string> = new Set(),
): Subtask[] {
  const focus = subtask.planningFocus.toLowerCase();

  if (inventoryMeetsFocus(focus, worldState.inventory, subtask.targetItem)) {
    return [subtask];
  }

  const parsedGoal = parseGoalFromObjective(subtask.planningFocus);
  if (parsedGoal && (parsedGoal.action === "place" || parsedGoal.action === "use")) {
    const atomicGoal: Subtask = {
      ...subtask,
      compound: false,
      expectedAction: parsedGoal.action,
      targetItem: parsedGoal.targetItem,
      ...(parsedGoal.destination ? { destination: parsedGoal.destination } : {}),
      planningFocus: `${parsedGoal.action} one ${parsedGoal.targetItem}${parsedGoal.destination ? ` ${parsedGoal.destination}` : ""}`,
    };
    return expandGoalPrerequisites(atomicGoal, worldState, satisfiedLocateIds);
  }

  if (focus.includes("iron pickaxe")) {
    return [...assignPrerequisiteHierarchy(expandIronPickaxeChain(worldState), subtask.id), subtask];
  }

  if (
    focus.includes("collect") ||
    focus.includes("mine") ||
    focus.includes("ore")
  ) {
    return [...assignPrerequisiteHierarchy(expandCollectionChain(focus, worldState), subtask.id), subtask];
  }

  const craftItem = extractCraftItemFromFocus(subtask.planningFocus);
  if (craftItem) {
    return prependWorkstationPrerequisites(worldState, [subtask]);
  }

  if (subtask.expectedAction === "place" || subtask.expectedAction === "use") {
    return expandGoalPrerequisites(subtask, worldState, satisfiedLocateIds);
  }

  if (subtask.expectedAction === "collect" && subtask.targetItem) {
    return [...expandObtainItemChain(subtask.targetItem, worldState, subtask.parentId ?? subtask.id), subtask];
  }

  return [subtask];
}

function stepSatisfiesSubtask(
  subtask: Subtask,
  intent: SubgoalIntent,
  outcome: ActionOutcome,
  worldState: WorldState,
): boolean {
  if (outcome.status !== "success") {
    return false;
  }

  if (subtaskCompletesFromInventory(subtask, worldState)) {
    return true;
  }

  if (subtask.compound) {
    return inventoryMeetsFocus(subtask.planningFocus, worldState.inventory, subtask.targetItem);
  }

  const actionName = intent.candidateAction.name;

  if (
    (subtask.expectedAction === "explore" || /(locate|search|pathfind|reach)\b/.test(subtask.planningFocus.toLowerCase())) &&
    (actionName === "explore" || actionName === "scan")
  ) {
    if (subtask.targetItem && subtaskRequirementMet(subtask, worldState.inventory)) {
      return true;
    }
    return locateSearchSatisfied(subtask, outcome, worldState);
  }
  if (
    (subtask.expectedAction === "explore" || /(locate|search|pathfind|reach)\b/.test(subtask.planningFocus.toLowerCase())) &&
    actionName === "collect"
  ) {
    const targetItem = (subtask.targetItem ?? String(intent.candidateAction.arguments.block_type ?? "")).toLowerCase();
    if (!targetItem) {
      return false;
    }

    const matchedCollection = outcome.inventoryDelta.some((entry) =>
      entry.countChange > 0 && entry.item.toLowerCase() === targetItem,
    );
    return matchedCollection || isTargetVisibleForItem(worldState, targetItem);
  }
  const focus = subtask.planningFocus.toLowerCase();
  const craftItem = String(intent.candidateAction.arguments.item ?? "").toLowerCase();

  if (subtask.expectedAction === actionName) {
    if (actionName === "craft") {
      if (subtask.targetItem && craftItem !== subtask.targetItem) {
        return false;
      }
      return subtask.targetItem ? subtaskRequirementMet(subtask, worldState.inventory) : true;
    }
    if (actionName === "place") {
      const placedItem = String(intent.candidateAction.arguments.block_type ?? "").toLowerCase();
      if (subtask.targetItem && placedItem !== subtask.targetItem) {
        return false;
      }
      return true;
    }
    if (actionName === "collect" && subtask.targetItem) {
      return subtaskRequirementMet(subtask, worldState.inventory);
    }
    return true;
  }

  if (focus.includes("door") && focus.includes("place") && actionName === "place") {
    return /door/.test(String(intent.candidateAction.arguments.block_type ?? ""));
  }

  if (focus.includes("crafting table") && actionName === "place") {
    return String(intent.candidateAction.arguments.block_type ?? "") === "crafting_table";
  }

  if (focus.includes("furnace") && focus.includes("place") && actionName === "place") {
    return String(intent.candidateAction.arguments.block_type ?? "") === "furnace";
  }

  if (focus.includes("pickaxe") && actionName === "craft") {
    if (focus.includes("iron")) {
      return craftItem === "iron_pickaxe";
    }
    if (focus.includes("stone")) {
      return craftItem === "stone_pickaxe";
    }
    if (focus.includes("wooden")) {
      return craftItem === "wooden_pickaxe";
    }
  }

  if (focus.includes("craft") && actionName === "craft") {
    if (focus.includes("plank")) {
      return craftItem === "planks";
    }
    if (focus.includes("stick")) {
      return craftItem === "stick";
    }
    if (focus.includes("crafting table")) {
      return craftItem === "crafting_table";
    }
    if (focus.includes("furnace")) {
      return craftItem === "furnace";
    }
    const expected = extractCraftItemFromFocus(subtask.planningFocus);
    return expected ? craftItem === expected : focus.includes(craftItem);
  }

  if (focus.includes("smelt") && actionName === "smelt") {
    const outputItem = String(intent.candidateAction.arguments.item ?? "").toLowerCase();
    const expectedOutput = inferSmeltOutputFromFocus(focus);
    return expectedOutput ? outputItem === expectedOutput : outputItem.length > 0;
  }

  if (focus.includes("collect") && actionName === "collect") {
    if (subtask.targetItem) {
      return subtaskRequirementMet(subtask, worldState.inventory);
    }
    if (focus.includes("iron")) {
      return String(intent.candidateAction.arguments.block_type ?? "").includes("iron");
    }
    if (focus.includes("diamond")) {
      return String(intent.candidateAction.arguments.block_type ?? "").includes("diamond");
    }
    if (focus.includes("stone") || focus.includes("cobblestone")) {
      return /(stone|cobblestone)/.test(String(intent.candidateAction.arguments.block_type ?? ""));
    }
    if (focus.includes("sapling")) {
      return /sapling/.test(String(intent.candidateAction.arguments.block_type ?? ""));
    }
    return true;
  }

  if (focus.includes("mine") && actionName === "collect") {
    return subtask.targetItem
      ? subtaskRequirementMet(subtask, worldState.inventory)
      : true;
  }

  if (
    (focus.includes("gather") || focus.includes("obtain")) &&
    actionName === "collect" &&
    subtask.targetItem
  ) {
    return subtaskRequirementMet(subtask, worldState.inventory);
  }

  return false;
}

export class TaskStackService {
  private rootObjective = "";
  private rootSubtasks: Subtask[] = [];
  private pending: Subtask[] = [];
  private completed: Subtask[] = [];
  private readonly catalog = new Map<string, Subtask>();
  private satisfiedDestinationLocates = new Set<string>();
  private llmPlanned = false;

  reset(objective: string, worldState: WorldState, options: TaskStackResetOptions = {}): void {
    this.rootObjective = objective;
    this.llmPlanned = Boolean(options.llmSubtasks?.length);
    this.rootSubtasks = (options.llmSubtasks?.length
      ? options.llmSubtasks
      : decomposeRootObjective(objective, worldState)
    ).map((task) => ({
      ...task,
      parentId: task.parentId ?? "goal",
      compound: this.llmPlanned ? false : task.compound,
    }));
    this.pending = [];
    this.completed = [];
    this.catalog.clear();
    this.satisfiedDestinationLocates.clear();
    this.registerTasks(this.rootSubtasks);
    this.reconcile(worldState);
  }

  isLlmPlanned(): boolean {
    return this.llmPlanned;
  }

  prependSubtasks(subtasks: Subtask[]): void {
    if (subtasks.length === 0) {
      return;
    }

    const active = this.pending[0];
    const existingIds = new Set(this.pending.map((subtask) => subtask.id));
    const normalized = subtasks.map((subtask) => ({
      ...subtask,
      compound: false,
      parentId: subtask.parentId ?? active?.parentId ?? "goal",
    })).filter((subtask) => !existingIds.has(subtask.id));
    if (normalized.length === 0) {
      return;
    }
    this.registerTasks(normalized);
    this.pending = [...normalized, ...this.pending];
  }

  reconcile(worldState: WorldState): void {
    const completedIds = new Set(this.completed.map((subtask) => subtask.id));
    const rebuilt = this.rootSubtasks.flatMap((rootSubtask) => {
      if (completedIds.has(rootSubtask.id)) {
        return [];
      }

      if (this.llmPlanned || !rootSubtask.compound) {
        return [rootSubtask];
      }

      return expandCompoundSubtask(rootSubtask, worldState, this.satisfiedDestinationLocates);
    });
    this.registerTasks(rebuilt);

    const seen = new Set<string>();
    this.pending = rebuilt.filter((subtask) => {
      if (completedIds.has(subtask.id) || seen.has(subtask.id)) {
        return false;
      }
      seen.add(subtask.id);
      return true;
    });
    this.expandPendingHead(worldState);
    this.advanceInventorySatisfiedHeads(worldState);
  }

  private advanceInventorySatisfiedHeads(worldState: WorldState): void {
    while (this.pending[0] && subtaskCompletesFromInventory(this.pending[0], worldState)) {
      this.completed.push(this.pending.shift() as Subtask);
    }
  }

  getContext(): TaskPlanningContext {
    return {
      rootObjective: this.rootObjective,
      activeSubtask: this.pending[0] ?? null,
      pendingSubtasks: [...this.pending],
      completedSubtasks: [...this.completed],
      taskTree: this.buildTaskTree(),
    };
  }

  getActivePlanningFocus(): string {
    return this.pending[0]?.planningFocus ?? this.rootObjective;
  }

  onStepComplete(
    intent: SubgoalIntent,
    outcome: ActionOutcome,
    worldState: WorldState,
    verification: VerificationResult | null = null,
    options: TaskStackStepOptions = {},
  ): void {
    const current = this.pending[0];
    if (!current) {
      return;
    }

    if (stepSatisfiesSubtask(current, intent, outcome, worldState)) {
      if (current.id.startsWith("locate_")) {
        this.satisfiedDestinationLocates.add(current.id);
      }
      this.completed.push(this.pending.shift() as Subtask);
      this.reconcile(worldState);
      this.advanceInventorySatisfiedHeads(worldState);
      return;
    }

    if (outcome.status === "failed" && !options.skipFailureHeuristics) {
      const craftItem = String(intent.candidateAction.arguments.item ?? "");
      if (
        intent.candidateAction.name === "craft" &&
        craftFailureNeedsWorkstation(craftItem, outcome.failureReason, worldState)
      ) {
        const prereqs = buildWorkstationPrerequisiteSubtasks(worldState, craftItem);
        if (prereqs.length > 0) {
          this.pending = [...prereqs, current, ...this.pending.slice(1)];
          return;
        }
      }

      const collectTarget = current.targetItem ?? String(intent.candidateAction.arguments.block_type ?? "");
      if (
        intent.candidateAction.name === "collect" &&
        collectFailureNeedsLocate(collectTarget, outcome.failureReason, worldState)
      ) {
        const locateTasks = expandAccessPrerequisites(
          { ...current, expectedAction: "collect", targetItem: collectTarget },
          worldState,
        );
        if (locateTasks.length > 0) {
          this.registerTasks(locateTasks);
          this.pending = [...locateTasks, current, ...this.pending.slice(1)];
          return;
        }
      }

      if (
        intent.candidateAction.name === "place" &&
        placeFailureNeedsLocateDestination(outcome.failureReason, current, worldState)
      ) {
        const destinationSpec = inferDestinationRequirement(current);
        if (destinationSpec) {
          this.satisfiedDestinationLocates.delete(`locate_${destinationSpec.id}`);
        }
        const locateTasks = expandDestinationPrerequisites(current, worldState, this.satisfiedDestinationLocates);
        if (locateTasks.length > 0) {
          this.registerTasks(locateTasks);
          this.pending = [...locateTasks, current, ...this.pending.slice(1)];
          return;
        }
      }

      if (current.compound) {
        this.pending = [...expandCompoundSubtask(current, worldState, this.satisfiedDestinationLocates), ...this.pending.slice(1)];
        return;
      }
    }

    if (verification && !options.skipFailureHeuristics) {
      const locateTasks = verificationNeedsLocateSubtask(
        verification.issueTags,
        current,
        worldState,
        this.satisfiedDestinationLocates,
      );
      if (locateTasks.length > 0) {
        this.registerTasks(locateTasks);
        this.pending = [...locateTasks, current, ...this.pending.slice(1)];
        return;
      }
    }

    // Inventory and world changes can satisfy a downstream requirement even when
    // the executed action did not match the stale head of the task stack.
    this.reconcile(worldState);
  }

  isRootComplete(
    objective: string,
    inventory: WorldState["inventory"],
    placedDoorCount: number,
    placedCraftingTable: boolean,
  ): boolean {
    const normalized = objective.toLowerCase();

    if (normalized.includes("iron pickaxe") || (normalized.includes("iron") && normalized.includes("pickaxe"))) {
      return countInventoryItem(inventory, "iron_pickaxe") >= 1;
    }

    if (normalized.includes("diamond") && (normalized.includes("mine") || normalized.includes("get") || normalized.includes("obtain"))) {
      return countInventoryItem(inventory, "diamond") >= 1;
    }

    if (normalized.includes("door") && normalized.includes("around")) {
      return this.pending.length === 0 && this.completed.length > 0;
    }

    if (normalized.includes("door") && normalized.includes("place")) {
      return placedDoorCount >= 1;
    }

    if (normalized.includes("crafting table") && normalized.includes("place")) {
      return placedCraftingTable;
    }

    return this.pending.length === 0 && this.completed.length > 0;
  }

  private isSatisfiedByWorld(subtask: Subtask, worldState: WorldState): boolean {
    if (subtaskCompletesFromInventory(subtask, worldState)) {
      return true;
    }

    if (!subtask.targetItem) {
      return false;
    }

    if (
      (subtask.expectedAction === "craft" || subtask.expectedAction === "collect") &&
      subtaskRequirementMet(subtask, worldState.inventory)
    ) {
      return true;
    }

    if (
      (subtask.expectedAction === "place" || subtask.expectedAction === "use") &&
      inventoryHasItem(worldState.inventory, subtask.targetItem)
    ) {
      return false;
    }

    return false;
  }

  private registerTasks(tasks: Subtask[]): void {
    for (const task of tasks) {
      this.catalog.set(task.id, { ...this.catalog.get(task.id), ...task });
    }
  }

  private buildTaskTree(): TaskTreeNode {
    const activeId = this.pending[0]?.id;
    const pendingIds = new Set(this.pending.map((task) => task.id));
    const completedIds = new Set(this.completed.map((task) => task.id));
    const childrenByParent = new Map<string, Subtask[]>();

    for (const task of this.catalog.values()) {
      const parentId = task.parentId ?? "goal";
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(task);
      childrenByParent.set(parentId, siblings);
    }

    const makeNode = (task: Subtask, ancestors: Set<string>): TaskTreeNode => {
      const nextAncestors = new Set(ancestors).add(task.id);
      const children = (childrenByParent.get(task.id) ?? [])
        .filter((child) => !nextAncestors.has(child.id))
        .map((child) => makeNode(child, nextAncestors));
      const descendantActive = children.some((child) => child.status === "active");
      return {
        id: task.id,
        description: task.description,
        planningFocus: task.planningFocus,
        status: task.id === activeId || descendantActive
          ? "active"
          : completedIds.has(task.id)
            ? "completed"
            : pendingIds.has(task.id)
              ? "pending"
              : "pending",
        ...(task.expectedAction ? { expectedAction: task.expectedAction } : {}),
        children,
      };
    };

    return {
      id: "goal",
      description: this.rootObjective,
      planningFocus: this.rootObjective,
      status: activeId ? "active" : "completed",
      children: (childrenByParent.get("goal") ?? []).map((task) => makeNode(task, new Set())),
    };
  }

  private expandPendingHead(worldState: WorldState): void {
    while (this.pending[0]?.compound) {
      const head = this.pending[0];
      if (!head) {
        return;
      }

      if (inventoryMeetsFocus(head.planningFocus, worldState.inventory, head.targetItem)) {
        this.completed.push(this.pending.shift() as Subtask);
        continue;
      }

      const expanded = expandCompoundSubtask(head, worldState, this.satisfiedDestinationLocates);
      this.registerTasks(expanded);
      if (expanded.length === 1 && expanded[0]?.id === head.id) {
        return;
      }

      this.pending = [...expanded, ...this.pending.slice(1)];
      if (this.pending[0]?.compound) {
        continue;
      }
      return;
    }

    const head = this.pending[0];
    if (!head) {
      return;
    }

    const accessPrerequisites = expandAccessPrerequisites(head, worldState);
    if (accessPrerequisites.length > 0) {
      this.registerTasks(accessPrerequisites);
      this.pending = [...accessPrerequisites, ...this.pending.slice(1)];
      return;
    }

    if (head.expectedAction === "place" || head.expectedAction === "use") {
      const missingPlacementPrerequisites = buildMissingPlacementPrerequisites(head, worldState);
      if (missingPlacementPrerequisites.length > 0) {
        this.registerTasks(missingPlacementPrerequisites);
        this.pending = [...missingPlacementPrerequisites, ...this.pending];
        return;
      }

      const withObtain = expandGoalPrerequisites(head, worldState, this.satisfiedDestinationLocates);
      if (withObtain.length > 1) {
        this.registerTasks(withObtain);
        this.pending = [...withObtain, ...this.pending.slice(1)];
        return;
      }
    }

    const craftItem = extractCraftItemFromFocus(head.planningFocus);
    if (!craftItem) {
      return;
    }

    const withPrerequisites = prependWorkstationPrerequisites(worldState, [head]);
    if (withPrerequisites.length > 1) {
      this.registerTasks(withPrerequisites);
      this.pending = [...withPrerequisites, ...this.pending.slice(1)];
    }
  }
}
