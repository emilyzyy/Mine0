import type { CandidateAction, WorldState } from "../contracts/index.ts";
import type { PredictedFuture } from "../contracts/index.ts";
import type { PerceptionResult } from "../perception/perception_service.ts";
import type { TaskPlanningContext } from "./task_stack_service.ts";
import { actionAllowedForActiveSubtask, remainingSubtaskCount } from "./subtask_progress.ts";
import { makeId } from "../shared/ids.ts";
import {
  CerebrasClient,
  type ProviderCallMeta,
} from "./cerebras_client.ts";
import {
  plannerSystemPrompt,
  plannerUserPrompt,
} from "./planner_prompts.ts";
import { plannerProposalSchema } from "./planner_schemas.ts";

export interface PlannerProposal {
  plannerId: string;
  strategy: string;
  instruction: string;
  candidateAction: CandidateAction;
  successCondition: {
    item: string;
    count: number;
  };
  maximumSteps: number;
}

interface PlannerProposalResponse {
  plannerId: string;
  strategy: string;
  instruction: string;
  actionName: string;
  blockType: string;
  item: string;
  count: number;
  direction: string;
  location: string;
  reason: string;
  successItem: string;
  successCount: number;
  maximumSteps: number;
}

function countItem(worldState: WorldState, item: string): number {
  const aliases =
    item === "oak_log"
      ? ["oak_log", "log"]
      : item === "oak_planks"
        ? ["oak_planks", "planks"]
        : item === "wooden_door"
          ? ["wooden_door", "door"]
          : [item];

  return worldState.inventory
    .filter((stack) => aliases.includes(stack.item))
    .reduce((sum, stack) => sum + stack.count, 0);
}

function dedupeByAction(proposals: PlannerProposal[]): PlannerProposal[] {
  const seen = new Set<string>();
  return proposals.filter((proposal) => {
    const key = JSON.stringify({
      name: proposal.candidateAction.name,
      arguments: proposal.candidateAction.arguments,
    });
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function hasRecentFailedScan(memorySummary: string[]): boolean {
  return memorySummary.some((entry) =>
    entry.includes("scan") && entry.includes("degraded"),
  );
}

function hasRecentFailedPlace(memorySummary: string[]): boolean {
  return memorySummary.some((entry) =>
    entry.includes("place") && entry.includes("degraded"),
  );
}

function hasRecentFailedExplore(memorySummary: string[]): boolean {
  return memorySummary.some((entry) =>
    entry.includes("explore") && entry.includes("degraded"),
  );
}

interface RecentActionSnapshot {
  action: string;
  direction: string | null;
  item: string | null;
  blockType: string | null;
  inventoryChanged: boolean;
  position: { x: number; y: number; z: number } | null;
  movement: { x: number; y: number; z: number } | null;
}

type SearchDomain = "surface" | "subterranean" | "local";

interface FocusProfile {
  focus: string;
  normalizedFocus: string;
  craftItem: string | null;
  smeltPlan: { inputItem: string; outputItem: string } | null;
  placementBlock: string | null;
  collectBlock: string | null;
  searchDomain: SearchDomain;
}

const SMELT_RECIPES: Array<{ inputItem: string; outputItem: string; keywords: string[] }> = [
  { inputItem: "iron_ore", outputItem: "iron_ingot", keywords: ["iron ore", "iron_ore", "iron ingot", "iron_ingot"] },
  { inputItem: "gold_ore", outputItem: "gold_ingot", keywords: ["gold ore", "gold_ore", "gold ingot", "gold_ingot"] },
  { inputItem: "sand", outputItem: "glass", keywords: ["sand", "glass"] },
  { inputItem: "cobblestone", outputItem: "stone", keywords: ["cobblestone", "stone"] },
];

function parseRecentActionSnapshots(recentHistorySummary: string[]): RecentActionSnapshot[] {
  return recentHistorySummary.map((entry) => {
    const action = entry.match(/action=([^|]+)/)?.[1]?.trim() ?? "unknown";
    const argumentsRaw = entry.match(/arguments=(\{.*?\})(?:\s*\||$)/)?.[1]?.trim();
    let parsedArguments: Record<string, string> = {};
    if (argumentsRaw) {
      try {
        parsedArguments = JSON.parse(argumentsRaw) as Record<string, string>;
      } catch {
        parsedArguments = {};
      }
    }
    const positionMatch = entry.match(/position=x=([-0-9.]+), y=([-0-9.]+), z=([-0-9.]+)/);
    const movementMatch = entry.match(/movement=dx=([-0-9.]+), dy=([-0-9.]+), dz=([-0-9.]+)/);
    const inventoryChanged = !entry.includes("inventory=no inventory change");
    return {
      action,
      direction: parsedArguments.direction ?? null,
      item: parsedArguments.item ?? null,
      blockType: parsedArguments.block_type ?? null,
      inventoryChanged,
      position: positionMatch
        ? {
            x: Number(positionMatch[1]),
            y: Number(positionMatch[2]),
            z: Number(positionMatch[3]),
          }
        : null,
      movement: movementMatch
        ? {
            x: Number(movementMatch[1]),
            y: Number(movementMatch[2]),
            z: Number(movementMatch[3]),
          }
        : null,
    };
  });
}

function inferCollectBlock(normalizedFocus: string): string | null {
  if (normalizedFocus.includes("sapling")) return "sapling";
  if (normalizedFocus.includes("diamond")) return "diamond_ore";
  if (normalizedFocus.includes("iron")) return "iron_ore";
  if (normalizedFocus.includes("coal")) return "coal_ore";
  if (normalizedFocus.includes("sand")) return "sand";
  if (normalizedFocus.includes("cobblestone") || normalizedFocus.includes("stone")) return "stone";
  if (normalizedFocus.includes("log") || normalizedFocus.includes("wood")) return "oak_log";
  return null;
}

function inferPlacementBlock(normalizedFocus: string): string | null {
  if (!normalizedFocus.includes("place")) {
    return null;
  }
  if (normalizedFocus.includes("crafting table") || normalizedFocus.includes("crafting_table")) return "crafting_table";
  if (normalizedFocus.includes("furnace")) return "furnace";
  if (normalizedFocus.includes("door")) return "wooden_door";
  const match = normalizedFocus.match(/place(?:\s+one|\s+a|\s+an|\s+the)?\s+([a-z0-9_]+)/);
  return match?.[1] ?? null;
}

function inferPlacementLocation(normalizedFocus: string): string {
  if (/\b(?:water|river|lake|ocean|pond)\b/.test(normalizedFocus)) {
    return "body_of_water";
  }
  return "nearby";
}

function inferSmeltPlan(normalizedFocus: string): { inputItem: string; outputItem: string } | null {
  if (!normalizedFocus.includes("smelt")) {
    return null;
  }

  for (const recipe of SMELT_RECIPES) {
    if (recipe.keywords.some((keyword) => normalizedFocus.includes(keyword))) {
      return {
        inputItem: recipe.inputItem,
        outputItem: recipe.outputItem,
      };
    }
  }

  return null;
}

function inferSearchDomain(
  normalizedFocus: string,
  collectBlock: string | null,
  activeSubtask: TaskPlanningContext["activeSubtask"],
): SearchDomain {
  if (activeSubtask?.destination && /\b(water|river|lake|ocean|pond)\b/.test(activeSubtask.destination.toLowerCase())) {
    return "aquatic";
  }

  if (activeSubtask?.destination === "surface" || activeSubtask?.destination === "subterranean" || activeSubtask?.destination === "aquatic" || activeSubtask?.destination === "local") {
    return activeSubtask.destination;
  }

  if (/(locate|search|pathfind|reach)\b/.test(normalizedFocus)) {
    if (/\b(surface|overground|trees?|forest|wood|sapling)\b/.test(normalizedFocus)) {
      return "surface";
    }
    if (/\b(underground|deeper|below|ore|cave|mine)\b/.test(normalizedFocus)) {
      return "subterranean";
    }
    if (/\b(water|river|lake|ocean|pond)\b/.test(normalizedFocus)) {
      return "aquatic";
    }
  }

  if (
    normalizedFocus.includes("ore") ||
    normalizedFocus.includes("underground") ||
    normalizedFocus.includes("deeper") ||
    normalizedFocus.includes("below") ||
    /\b(dig down|y level|depth|descend|spawning depth)\b/.test(normalizedFocus)
  ) {
    return "subterranean";
  }

  if (collectBlock && /(diamond_ore|iron_ore|coal_ore)/.test(collectBlock)) {
    return "subterranean";
  }

  if (collectBlock === "oak_log" || collectBlock === "sapling" || collectBlock === "sand") {
    return "surface";
  }

  return "local";
}

function inferFocusProfile(focus: string, activeSubtask: TaskPlanningContext["activeSubtask"] = null): FocusProfile {
  const normalizedFocus = focus.toLowerCase();
  const craftItem = extractCraftItemFromFocus(normalizedFocus);
  let collectBlock = inferCollectBlock(normalizedFocus);
  if (!collectBlock && activeSubtask?.targetItem) {
    collectBlock = findItemObtainSpec(activeSubtask.targetItem)?.collectBlock ?? activeSubtask.targetItem;
  }
  const locateSpec = activeSubtask ? inferLocateSpec(activeSubtask) : null;
  return {
    focus,
    normalizedFocus,
    craftItem,
    smeltPlan: inferSmeltPlan(normalizedFocus),
    placementBlock:
      inferPlacementBlock(normalizedFocus) ??
      (activeSubtask?.expectedAction === "place" || activeSubtask?.expectedAction === "use"
        ? activeSubtask.targetItem ?? null
        : null),
    collectBlock,
    searchDomain: locateSpec?.searchDomain ?? inferSearchDomain(normalizedFocus, collectBlock, activeSubtask),
  };
}

function recentActionsShowLoop(history: RecentActionSnapshot[]): boolean {
  const relevant = history.filter((entry) => entry.action === "explore" || entry.action === "scan").slice(-4);
  if (relevant.length < 3) {
    return false;
  }

  const stagnantSearches = relevant.filter((entry) => {
    const movement = entry.movement;
    if (!movement) {
      return false;
    }
    return Math.abs(movement.x) + Math.abs(movement.y) + Math.abs(movement.z) <= 6.5 && !entry.inventoryChanged;
  });
  const repeatedDirections = new Set(relevant.map((entry) => entry.direction).filter(Boolean));
  const clusteredPositions = relevant.every((entry) => {
    if (!entry.position || !relevant[0]?.position) {
      return false;
    }
    const dx = entry.position.x - relevant[0].position.x;
    const dy = entry.position.y - relevant[0].position.y;
    const dz = entry.position.z - relevant[0].position.z;
    return Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 12;
  });

  return stagnantSearches.length >= 3 && (repeatedDirections.size <= 2 || clusteredPositions);
}

function recentPlaceFailureForDestination(recentHistorySummary: string[], destinationId: string): boolean {
  const needle = destinationId.toLowerCase();
  return recentHistorySummary.some((entry) => {
    const lower = entry.toLowerCase();
    return (
      lower.includes("place") &&
      lower.includes("failed") &&
      (lower.includes("no reachable water") ||
        lower.includes("unable to find a valid nearby placement") ||
        lower.includes(needle))
    );
  });
}

function destinationReadyForPlacement(
  worldState: WorldState,
  activeSubtask: TaskPlanningContext["activeSubtask"],
  normalizedFocus: string,
): boolean {
  const destinationSpec = inferDestinationRequirement({
    planningFocus: activeSubtask?.planningFocus ?? normalizedFocus,
    destination: activeSubtask?.destination,
  });
  if (!destinationSpec) {
    return true;
  }
  return isDestinationAccessible(destinationSpec, worldState);
}

function chooseSearchDirection(
  worldState: WorldState,
  history: RecentActionSnapshot[],
  searchDomain: SearchDomain,
  planningFocus = "",
): string {
  const normalizedFocus = planningFocus.toLowerCase();
  const wantsDepth =
    searchDomain === "subterranean" ||
    /\b(dig down|deeper|y level|depth|below|descend|spawning depth)\b/.test(normalizedFocus);

  if (wantsDepth && worldState.position.y > 12) {
    return "down";
  }

  if (searchDomain === "surface" && worldState.position.y < 58) {
    const recentUp = history.slice(-3).some((entry) => entry.direction === "up");
    if (!recentUp) {
      return "up";
    }
  }

  if (searchDomain === "subterranean" && worldState.position.y > 16) {
    const recentSearchCount = history.slice(-4).filter((entry) => entry.action === "explore" || entry.action === "scan").length;
    if (recentActionsShowLoop(history) || recentSearchCount >= 2) {
      return "down";
    }
  }

  const recentlyUsed = history
    .filter((entry) => entry.action === "explore" || entry.action === "scan")
    .map((entry) => entry.direction)
    .filter((entry): entry is string => Boolean(entry))
    .slice(-4);
  const candidates =
    searchDomain === "subterranean"
      ? ["forward_left", "forward_right", "left", "right", "forward", "down"]
      : searchDomain === "aquatic"
        ? ["forward_left", "forward_right", "left", "right", "forward", "backward"]
        : ["forward_left", "forward_right", "left", "right", "forward", "backward"];
  const unexplored = candidates.find((direction) => !recentlyUsed.includes(direction));
  if (unexplored) {
    return unexplored;
  }

  const offsetIndex = Math.abs(Math.round(worldState.position.x + worldState.position.z)) % candidates.length;
  return candidates[offsetIndex] ?? "forward";
}

function shouldScanBeforeSearch(
  memorySummary: string[],
  history: RecentActionSnapshot[],
  profile: FocusProfile,
): boolean {
  if (profile.searchDomain === "subterranean") {
    return false;
  }

  if (hasRecentFailedScan(memorySummary) || recentActionsShowLoop(history)) {
    return false;
  }

  const lastSearch = history.slice(-2).some((entry) => entry.action === "scan");
  return !lastSearch;
}

function blockAliases(blockType: string): string[] {
  switch (blockType) {
    case "sapling":
      return ["sapling", "oak_sapling", "spruce_sapling", "birch_sapling", "leaves", "leaves2"];
    case "oak_log":
      return ["oak_log", "log", "log2", "oak_tree"];
    case "stone":
      return ["stone", "cobblestone", "stone_outcrop"];
    case "diamond_ore":
      return ["diamond_ore", "diamond"];
    case "iron_ore":
      return ["iron_ore", "iron"];
    case "coal_ore":
      return ["coal_ore", "coal"];
    case "furnace":
      return ["furnace"];
    default:
      return [blockType];
  }
}

function canSeeTargetBlock(worldState: WorldState, blockType: string): boolean {
  const aliases = blockAliases(blockType);
  const haystack = [
    ...worldState.perceivedResources,
    ...worldState.nearbyBlocks,
    worldState.lineOfSightTarget ?? "",
  ].map((entry) => entry.toLowerCase());
  return aliases.some((alias) => haystack.some((entry) => entry.includes(alias)));
}

function totalWoodResources(worldState: WorldState): number {
  return countItem(worldState, "oak_log") + countItem(worldState, "oak_planks");
}

function hasEnoughWoodForEarlyTools(worldState: WorldState): boolean {
  const planks = countItem(worldState, "oak_planks");
  const logs = countItem(worldState, "oak_log");
  const sticks = countItem(worldState, "stick");
  return logs >= 3 || planks >= 8 || (planks >= 3 && sticks >= 2) || totalWoodResources(worldState) >= 8;
}

function wantsCraftingTablePlacement(objective: string): boolean {
  const normalized = objective.toLowerCase();
  const mentionsTable = normalized.includes("crafting table") || normalized.includes("crafting_table");
  return mentionsTable && (normalized.includes("place") || normalized.includes("put down"));
}

function objectiveWantsDoor(objective: string): boolean {
  return objective.toLowerCase().includes("door");
}

function objectiveWantsDoorPlacement(objective: string): boolean {
  const normalized = objective.toLowerCase();
  return normalized.includes("door") && (normalized.includes("place") || normalized.includes("put down") || normalized.includes("around"));
}

function objectiveWantsDoorsAround(objective: string): boolean {
  const normalized = objective.toLowerCase();
  return normalized.includes("door") && normalized.includes("around");
}

import {
  buildWorkstationPrerequisiteSubtasks,
  canPlaceCraftingTable,
  countInventoryItem,
  extractCraftItemFromFocus,
  hasCraftingTableInInventory,
  hasNearbyCraftingTable,
  requiresPlacedCraftingTable,
} from "./craft_prerequisites.ts";
import {
  findItemObtainSpec,
  inferDestinationRequirement,
  inferLocateSpec,
  inventoryHasItem,
  isDestinationAccessible,
  isTargetVisibleForItem,
} from "./goal_prerequisites.ts";

function canPlaceDoorNearby(worldState: WorldState): boolean {
  return (
    worldState.interactionHints.includes("can_place_wooden_door") ||
    worldState.interactionHints.includes("can_place_door")
  );
}

function canPlaceFurnaceNearby(worldState: WorldState): boolean {
  return worldState.interactionHints.includes("can_place_furnace");
}

function recentCraftFailureFor(recentHistorySummary: string[], item: string): boolean {
  const needle = item.toLowerCase();
  return recentHistorySummary.some((entry) => {
    const lower = entry.toLowerCase();
    return lower.includes("craft") && lower.includes("failed") && lower.includes(needle);
  });
}

function shouldProposeCraftingTable(worldState: WorldState, recentHistorySummary: string[]): boolean {
  if (
    recentCraftFailureFor(recentHistorySummary, "crafting_table") ||
    hasNearbyCraftingTable(worldState) ||
    hasCraftingTableInInventory(worldState)
  ) {
    return false;
  }

  return countItem(worldState, "crafting_table") < 1;
}

function shouldProposePlaceCraftingTable(worldState: WorldState, blockPlace: boolean): boolean {
  if (blockPlace || hasNearbyCraftingTable(worldState) || !hasCraftingTableInInventory(worldState)) {
    return false;
  }

  return canPlaceCraftingTable(worldState);
}

function shouldProposeToolCraft(
  worldState: WorldState,
  item: string,
  recentHistorySummary: string[],
): boolean {
  if (recentCraftFailureFor(recentHistorySummary, item)) {
    return false;
  }

  if (!requiresPlacedCraftingTable(item)) {
    return true;
  }

  return hasNearbyCraftingTable(worldState);
}

function canPlaceCraftingTableOnFloor(worldState: WorldState): boolean {
  return (
    worldState.interactionHints.includes("can_place_crafting_table_underfoot") ||
    worldState.interactionHints.includes("can_place_crafting_table")
  );
}

function shouldBlockDoorPlace(memorySummary: string[], worldState: WorldState): boolean {
  if (!hasRecentFailedPlace(memorySummary)) {
    return false;
  }

  if (objectiveWantsDoor(worldState.userObjective) && countItem(worldState, "wooden_door") >= 1) {
    return false;
  }

  return true;
}

function shouldBlockCraftingTablePlace(memorySummary: string[], worldState: WorldState): boolean {
  if (!hasRecentFailedPlace(memorySummary)) {
    return false;
  }

  if (wantsCraftingTablePlacement(worldState.userObjective) && canPlaceCraftingTableOnFloor(worldState)) {
    return false;
  }

  return true;
}

function makePlaceCraftingTableProposal(
  plannerId: string,
  strategy: string,
  instruction: string,
  reason: string,
): PlannerProposal {
  return {
    plannerId,
    strategy,
    instruction,
    candidateAction: {
      name: "place",
      arguments: { block_type: "crafting_table", location: "nearby" },
      reason,
    },
    successCondition: { item: "crafting_table", count: 1 },
    maximumSteps: 120,
  };
}

function makePlaceDoorProposal(
  plannerId: string,
  strategy: string,
  instruction: string,
  reason: string,
): PlannerProposal {
  return {
    plannerId,
    strategy,
    instruction,
    candidateAction: {
      name: "place",
      arguments: { block_type: "wooden_door", location: "nearby" },
      reason,
    },
    successCondition: { item: "wooden_door", count: 1 },
    maximumSteps: 120,
  };
}

function makePlaceFurnaceProposal(
  plannerId: string,
  strategy: string,
  instruction: string,
  reason: string,
): PlannerProposal {
  return {
    plannerId,
    strategy,
    instruction,
    candidateAction: {
      name: "place",
      arguments: { block_type: "furnace", location: "nearby" },
      reason,
    },
    successCondition: { item: "furnace", count: 1 },
    maximumSteps: 120,
  };
}

function makeCraftDoorProposal(planks: number): PlannerProposal {
  return {
    plannerId: "planner_craft_door",
    strategy: "craft a wooden door at the nearby workstation",
    instruction: "Craft one wooden door",
    candidateAction: {
      name: "craft",
      arguments: { item: "wooden_door", count: 1 },
      reason: "Minecraft 1.8.8 uses the item name wooden_door, and one recipe consumes six planks.",
    },
    successCondition: { item: "wooden_door", count: 1 },
    maximumSteps: 120,
  };
}

function buildActiveSubtaskFallback(
  taskContext: TaskPlanningContext | null,
  worldState: WorldState,
  recentHistorySummary: string[],
): PlannerProposal | null {
  const active = taskContext?.activeSubtask;
  if (!active?.expectedAction) {
    return null;
  }

  const history = parseRecentActionSnapshots(recentHistorySummary);
  const profile = inferFocusProfile(active.planningFocus, active);
  const direction = chooseSearchDirection(worldState, history, profile.searchDomain, active.planningFocus);
  const successItem = active.targetItem ?? profile.collectBlock ?? profile.placementBlock ?? "progress";
  const successCount = active.targetCount ?? 1;

  switch (active.expectedAction) {
    case "explore":
      return {
        plannerId: "planner_subtask_explore",
        strategy: active.description,
        instruction: active.planningFocus,
        candidateAction: {
          name: "explore",
          arguments: { direction },
          reason: `Advance the active subtask: ${active.description}`,
        },
        successCondition: { item: successItem, count: successCount },
        maximumSteps: profile.searchDomain === "subterranean" ? 240 : 160,
      };
    case "scan":
      return {
        plannerId: "planner_subtask_scan",
        strategy: active.description,
        instruction: active.planningFocus,
        candidateAction: {
          name: "scan",
          arguments: { direction },
          reason: `Advance the active subtask: ${active.description}`,
        },
        successCondition: { item: successItem, count: successCount },
        maximumSteps: 80,
      };
    case "collect":
      return {
        plannerId: "planner_subtask_collect",
        strategy: active.description,
        instruction: active.planningFocus,
        candidateAction: {
          name: "collect",
          arguments: {
            block_type: active.targetItem ?? profile.collectBlock ?? "resource",
            count: Math.max(1, remainingSubtaskCount(active, worldState.inventory)),
          },
          reason: `Advance the active subtask: ${active.description}`,
        },
        successCondition: { item: successItem, count: successCount },
        maximumSteps: 180,
      };
    case "craft":
      return {
        plannerId: "planner_subtask_craft",
        strategy: active.description,
        instruction: active.planningFocus,
        candidateAction: {
          name: "craft",
          arguments: {
            item: active.targetItem ?? profile.craftItem ?? "item",
            count: successCount,
          },
          reason: `Advance the active subtask: ${active.description}`,
        },
        successCondition: { item: successItem, count: successCount },
        maximumSteps: 180,
      };
    case "place":
    case "use":
      return {
        plannerId: "planner_subtask_place",
        strategy: active.description,
        instruction: active.planningFocus,
        candidateAction: {
          name: "place",
          arguments: {
            block_type: active.targetItem ?? profile.placementBlock ?? "block",
            location: active.destination ?? "nearby",
          },
          reason: `Advance the active subtask: ${active.description}`,
        },
        successCondition: { item: successItem, count: successCount },
        maximumSteps: 180,
      };
    default:
      return null;
  }
}

function ensureHeuristicFallback(
  proposals: PlannerProposal[],
  taskContext: TaskPlanningContext | null,
  worldState: WorldState,
  recentHistorySummary: string[],
): PlannerProposal[] {
  if (proposals.length > 0) {
    return proposals;
  }

  const fallback = buildActiveSubtaskFallback(taskContext, worldState, recentHistorySummary);
  return fallback ? [fallback] : proposals;
}

function prioritizeHeuristicProposals(
  proposals: PlannerProposal[],
  worldState: WorldState,
): PlannerProposal[] {
  const objective = worldState.userObjective.toLowerCase();
  const wantsTablePlacement = wantsCraftingTablePlacement(objective);
  const wantsDoorPlacement = objectiveWantsDoorPlacement(objective);
  const craftingTables = countItem(worldState, "crafting_table");
  const doors = countItem(worldState, "wooden_door");
  const furnaces = countItem(worldState, "furnace");
  const canPlaceTable = canPlaceCraftingTableOnFloor(worldState);
  const canPlaceDoor = canPlaceDoorNearby(worldState);

  const score = (proposal: PlannerProposal): number => {
    const actionName = proposal.candidateAction.name;
    const blockType = String(proposal.candidateAction.arguments.block_type ?? "");
    const craftItem = String(proposal.candidateAction.arguments.item ?? "");
    const destinationSpec = inferDestinationRequirement({ planningFocus: objective });
    if (destinationSpec && !isDestinationAccessible(destinationSpec, worldState)) {
      if (actionName === "explore" || actionName === "scan") {
        return 0;
      }
      if (actionName === "place") {
        return 20;
      }
    }
    if (actionName === "place" && wantsDoorPlacement && doors >= 1 && blockType.includes("door")) {
      return 0;
    }
    if (/\b(locate|search|pathfind|reach)\b/.test(objective) && actionName === "explore") {
      return 0;
    }
    if (/\b(locate|search|pathfind|reach)\b/.test(objective) && actionName === "scan") {
      return 1;
    }
    if (
      actionName === "place" &&
      blockType.includes("crafting_table") &&
      hasCraftingTableInInventory(worldState) &&
      !hasNearbyCraftingTable(worldState)
    ) {
      return 1;
    }
    if (actionName === "place" && wantsTablePlacement && hasCraftingTableInInventory(worldState)) {
      return 2;
    }
    if (actionName === "place" && blockType.includes("furnace") && furnaces >= 1) {
      return 2;
    }
    if (actionName === "place") {
      return 3;
    }
    if (actionName === "craft" && objectiveWantsDoor(objective) && doors < 1 && craftItem.includes("door")) {
      return 2;
    }
    if (actionName === "smelt") {
      return 4;
    }
    if (actionName === "place" && canPlaceDoor && blockType.includes("door")) {
      return 3;
    }
    if (actionName === "place" && canPlaceTable) {
      return 4;
    }
    if (actionName === "craft" && craftItem === "crafting_table") {
      return 8;
    }
    if (actionName === "craft") {
      return 5;
    }
    if (actionName === "collect") {
      return 6;
    }
    if (actionName === "explore") {
      return 7;
    }
    if (actionName === "scan") {
      return 9;
    }
    return 10;
  };

  return [...proposals].sort((left, right) => score(left) - score(right));
}

function filterProposalsForActiveSubtask(
  proposals: PlannerProposal[],
  taskContext: TaskPlanningContext | null,
  worldState: WorldState,
): PlannerProposal[] {
  const active = taskContext?.activeSubtask ?? null;
  if (!active?.expectedAction) {
    return proposals;
  }

  return proposals.filter((proposal) =>
    actionAllowedForActiveSubtask(proposal.candidateAction.name, active, worldState),
  );
}

function finalizeHeuristicProposals(
  proposals: PlannerProposal[],
  worldState: WorldState,
  memorySummary: string[],
  taskContext: TaskPlanningContext | null,
  recentHistorySummary: string[],
): PlannerProposal[] {
  let deduped = ensureHeuristicFallback(
    dedupeByAction(proposals),
    taskContext,
    worldState,
    recentHistorySummary,
  );

  if (hasRecentFailedScan(memorySummary)) {
    deduped = deduped.sort((left, right) =>
      left.candidateAction.name === "explore" ? -1 : right.candidateAction.name === "explore" ? 1 : 0,
    );
  } else if (hasRecentFailedPlace(memorySummary)) {
    const objective = worldState.userObjective.toLowerCase();
    const doors = countItem(worldState, "wooden_door");
    if (objectiveWantsDoor(objective) && doors >= 1) {
      deduped = prioritizeHeuristicProposals(deduped, worldState);
    } else {
      deduped = deduped.sort((left, right) => {
        if (left.candidateAction.name === "place") {
          return -1;
        }
        if (right.candidateAction.name === "place") {
          return 1;
        }
        if (left.candidateAction.name === "explore") {
          return -1;
        }
        if (right.candidateAction.name === "explore") {
          return 1;
        }
        return 0;
      });
    }
  } else if (hasRecentFailedExplore(memorySummary)) {
    deduped = deduped.sort((left, right) =>
      left.candidateAction.name === "craft" ? -1 : right.candidateAction.name === "craft" ? 1 : 0,
    );
  } else if (memorySummary.some((entry) => entry.includes("collect") && entry.includes("degraded"))) {
    deduped = deduped.sort((left, right) =>
      left.candidateAction.name === "scan" ? -1 : right.candidateAction.name === "scan" ? 1 : 0,
    );
  }

  return prioritizeHeuristicProposals(deduped, worldState);
}

export class PlannerService {
  private readonly client = new CerebrasClient();

  async plan(
    worldState: WorldState,
    memorySummary: string[],
    perception: PerceptionResult,
    recentHistorySummary: string[] = [],
  ): Promise<{ proposal: PlannerProposal; meta: ProviderCallMeta[] }> {
    const proposed = await this.proposeCandidates(worldState, memorySummary, perception, recentHistorySummary);
    const fallback = this.heuristicPlan(worldState, memorySummary, recentHistorySummary)[0];
    if (!fallback) {
      throw new Error("Planner heuristic fallback did not produce any proposals.");
    }
    return {
      proposal: proposed.proposals[0] ?? fallback,
      meta: proposed.meta,
    };
  }

  async proposeCandidates(
    worldState: WorldState,
    memorySummary: string[],
    perception: PerceptionResult,
    recentHistorySummary: string[] = [],
    taskContext: TaskPlanningContext | null = null,
  ): Promise<{ proposals: PlannerProposal[]; meta: ProviderCallMeta[] }> {
    const planningObjective = taskContext?.activeSubtask?.planningFocus ?? worldState.userObjective;
    const planningState: WorldState = {
      ...worldState,
      userObjective: planningObjective,
    };

    if (this.client.config.provider === "mock") {
      return {
        proposals: this.heuristicPlan(planningState, memorySummary, recentHistorySummary, taskContext).slice(0, 1),
        meta: [
          {
            label: "planner",
            provider: "mock",
            model: "mock",
            status: "skipped",
            latencyMs: 0,
            usage: null,
            timeInfo: null,
            warning: "Using heuristic planner because CEREBRAS_API_KEY is not configured.",
          },
        ],
      };
    }

    const heuristic = this.heuristicPlan(planningState, memorySummary, recentHistorySummary, taskContext);
    const result = await this.client.requestStructured<PlannerProposalResponse>({
      label: "planner",
      schemaName: "mine0_planner",
      schema: plannerProposalSchema,
      messages: [
        {
          role: "system",
          content: plannerSystemPrompt("choose one bounded first action only"),
        },
        {
          role: "user",
          content: plannerUserPrompt(worldState, perception, memorySummary, recentHistorySummary, taskContext),
        },
      ],
      maxOutputTokens: 600,
      temperature: 0.15,
    });
    const liveProposal = result.data ? this.fromStructured(result.data) : null;
    const liveProposals =
      liveProposal && !this.shouldOverrideStructuredProposal(planningState, liveProposal, memorySummary, taskContext)
        ? [liveProposal]
        : [];
    const logs = countItem(planningState, "oak_log");
    const proposals = finalizeHeuristicProposals(
      filterProposalsForActiveSubtask(
        [...liveProposals, ...heuristic],
        taskContext,
        planningState,
      ),
      planningState,
      memorySummary,
      taskContext,
      recentHistorySummary,
    ).slice(0, 1);

    return {
      proposals,
      meta: [result.meta],
    };
  }

  private heuristicPlan(
    worldState: WorldState,
    memorySummary: string[],
    recentHistorySummary: string[] = [],
    taskContext: TaskPlanningContext | null = null,
  ): PlannerProposal[] {
    const objective = worldState.userObjective.toLowerCase();
    const activeFocus = taskContext?.activeSubtask?.planningFocus ?? worldState.userObjective;
    const profile = inferFocusProfile(activeFocus, taskContext?.activeSubtask ?? null);
    const history = parseRecentActionSnapshots(recentHistorySummary);
    const logs = countItem(worldState, "oak_log");
    const planks = countItem(worldState, "oak_planks");
    const sticks = countItem(worldState, "stick");
    const doors = countItem(worldState, "wooden_door");
    const furnaces = countItem(worldState, "furnace");
    const proposals: PlannerProposal[] = [];
    const wantsTablePlacement = profile.placementBlock === "crafting_table" || wantsCraftingTablePlacement(objective);
    const wantsDoor = objectiveWantsDoor(objective) || profile.placementBlock === "wooden_door" || profile.craftItem === "wooden_door";
    const wantsDoorPlacement = profile.placementBlock === "wooden_door" || objectiveWantsDoorPlacement(objective);
    const wantsFurnacePlacement = profile.placementBlock === "furnace";
    const canPlaceCraftingTable = canPlaceCraftingTableOnFloor(worldState);
    const canPlaceFurnace = canPlaceFurnaceNearby(worldState) || furnaces > 0;
    const blockCraftingTablePlace = shouldBlockCraftingTablePlace(memorySummary, worldState);
    const recentFailedCollect = recentHistorySummary.some((entry) =>
      entry.includes("collect") && entry.includes("failed"),
    );
    const proposeCraftingTable = shouldProposeCraftingTable(worldState, recentHistorySummary);
    const activeSubtask = taskContext?.activeSubtask ?? null;
    const destinationSpec = inferDestinationRequirement({
      planningFocus: activeFocus,
      destination: activeSubtask?.destination,
    });
    const destinationAccessible = destinationReadyForPlacement(worldState, activeSubtask, profile.normalizedFocus);
    const isLocateSubtask =
      activeSubtask?.expectedAction === "explore" ||
      /\b(locate|search|pathfind|reach)\b/.test(activeFocus.toLowerCase());

    if (isLocateSubtask || (destinationSpec && !destinationAccessible)) {
      const searchDomain = isLocateSubtask ? profile.searchDomain : (destinationSpec?.searchDomain ?? "aquatic");
      const direction = chooseSearchDirection(worldState, history, searchDomain, activeFocus);
      const activeExploreCopy = activeSubtask?.expectedAction === "explore";
      if (shouldScanBeforeSearch(memorySummary, history, profile) && !activeExploreCopy) {
        proposals.push({
          plannerId: "planner_scan_for_locate",
          strategy: `scan toward ${searchDomain} before moving to locate the target area`,
          instruction:
            direction === "up"
              ? "Scan upward and outward for a path to the surface"
              : `Scan ${direction} for the next search frontier`,
          candidateAction: {
            name: "scan",
            arguments: { direction },
            reason: destinationSpec
              ? `The placement destination (${destinationSpec.id}) must be found before attempting placement again.`
              : "The active subtask is to locate a resource area, so visibility should improve before pathfinding.",
          },
          successCondition: { item: profile.collectBlock ?? profile.placementBlock ?? "water", count: 1 },
          maximumSteps: 80,
        });
      }

      proposals.push({
        plannerId: "planner_locate_frontier",
        strategy: activeExploreCopy && activeSubtask
          ? activeSubtask.description
          : direction === "up"
            ? "pathfind upward to the surface before searching for the target resource area"
            : destinationSpec
              ? `pathfind toward ${destinationSpec.id} before attempting the placement`
              : `pathfind toward a ${searchDomain} frontier for the active subtask`,
        instruction: activeExploreCopy && activeSubtask
          ? activeSubtask.planningFocus
          : direction === "up"
            ? "Explore upward toward the surface"
            : direction === "down"
              ? "Explore downward to open a deeper search path"
              : destinationSpec
                ? `Explore ${direction} to locate ${destinationSpec.id} for the pending placement`
                : `Explore ${direction} toward a less-revisited ${searchDomain} frontier`,
        candidateAction: {
          name: "explore",
          arguments: { direction },
          reason: activeExploreCopy && activeSubtask
            ? `Advance the active subtask: ${activeSubtask.description}`
            : destinationSpec
              ? `The placement destination (${destinationSpec.id}) is not reachable from here yet, so the bot must locate it first.`
              : direction === "up"
                ? "The active subtask needs surface resources, but the bot is too deep underground to see them yet."
                : direction === "down"
                  ? "The active subtask requires going deeper before the next step can succeed."
                  : "The active subtask is to locate a resource area that is not visible from the current position.",
        },
        successCondition: {
          item: activeSubtask?.targetItem ?? profile.collectBlock ?? profile.placementBlock ?? "water",
          count: activeSubtask?.targetCount ?? 1,
        },
        maximumSteps: searchDomain === "subterranean" ? 240 : 160,
      });
    }

    if (
      profile.collectBlock &&
      !profile.smeltPlan &&
      !isLocateSubtask &&
      isTargetVisibleForItem(worldState, profile.collectBlock) &&
      actionAllowedForActiveSubtask("collect", activeSubtask, worldState)
    ) {
      const remaining = activeSubtask?.targetItem
        ? remainingSubtaskCount(activeSubtask, worldState.inventory)
        : inventoryHasItem(worldState.inventory, profile.collectBlock)
          ? 0
          : 1;
      if (remaining > 0) {
        proposals.push({
          plannerId: `planner_collect_visible_${profile.collectBlock}`,
          strategy: `collect the visible ${profile.collectBlock} for the active subtask`,
          instruction: `Collect ${remaining} ${profile.collectBlock}`,
          candidateAction: {
            name: "collect",
            arguments: { block_type: profile.collectBlock, count: remaining },
            reason: "The required resource is already visible, so collection is the direct next step in the dependency tree.",
          },
          successCondition: { item: profile.collectBlock, count: remaining },
          maximumSteps: 180,
        });
      }
    }

    if (shouldProposePlaceCraftingTable(worldState, blockCraftingTablePlace)) {
      proposals.push(
        makePlaceCraftingTableProposal(
          "planner_place_workstation",
          "place a crafting table within reach before advanced crafting",
          "Place the crafting table on the ground beside you",
          "Tool and door recipes require a placed crafting table within reach, not just one in inventory.",
        ),
      );
    }

    if (wantsDoorPlacement && doors >= 1 && !shouldBlockDoorPlace(memorySummary, worldState)) {
      proposals.push(
        makePlaceDoorProposal(
          "planner_place_door",
          "place the crafted door on a nearby wall opening",
          "Place the wooden door on the nearest valid wall space",
          "The door is already crafted, so the remaining objective step is to place it in the world.",
        ),
      );
    }

    if (wantsFurnacePlacement && furnaces >= 1 && canPlaceFurnace) {
      proposals.push(
        makePlaceFurnaceProposal(
          "planner_place_furnace",
          "place the furnace needed by the active task-stack prerequisite",
          "Place the furnace on the ground beside you",
          "The active subtask requires a reachable furnace before smelting can proceed, and the executor can clear a nearby spot if needed.",
        ),
      );
    }

    if (
      profile.placementBlock &&
      !["crafting_table", "wooden_door", "furnace"].includes(profile.placementBlock) &&
      countItem(worldState, profile.placementBlock) >= 1 &&
      destinationAccessible &&
      !(destinationSpec && recentPlaceFailureForDestination(recentHistorySummary, destinationSpec.id)) &&
      actionAllowedForActiveSubtask("place", activeSubtask, worldState)
    ) {
      const location = inferPlacementLocation(profile.normalizedFocus);
      proposals.push({
        plannerId: `planner_place_${profile.placementBlock}`,
        strategy: `place the carried ${profile.placementBlock} to complete the active subtask`,
        instruction: `Place ${profile.placementBlock} at ${location}`,
        candidateAction: {
          name: "place",
          arguments: { block_type: profile.placementBlock, location },
          reason: "The requested item is already carried, so placement is the next unresolved action in the task tree.",
        },
        successCondition: { item: profile.placementBlock, count: 1 },
        maximumSteps: 180,
      });
    }

    if (wantsDoor && doors < 1 && planks >= 6 && hasNearbyCraftingTable(worldState) && !recentCraftFailureFor(recentHistorySummary, "wooden_door")) {
      proposals.push(makeCraftDoorProposal(planks));
    }

    if (
      wantsDoor &&
      doors < 1 &&
      !hasNearbyCraftingTable(worldState) &&
      canPlaceCraftingTable &&
      hasCraftingTableInInventory(worldState) &&
      !blockCraftingTablePlace
    ) {
      proposals.push(
        makePlaceCraftingTableProposal(
          "planner_place_table_for_door",
          "place a crafting table before crafting the door",
          "Place the crafting table on the ground beside you",
          "A door must be crafted at a workstation before it can be placed.",
        ),
      );
    }

    if (canPlaceCraftingTable && hasCraftingTableInInventory(worldState) && !hasNearbyCraftingTable(worldState) && !blockCraftingTablePlace) {
      proposals.push(
        makePlaceCraftingTableProposal(
          "planner_place_table",
          "place the crafting table on nearby floor space",
          "Place the crafting table on the ground beside you",
          "Tool and door recipes require a placed crafting table within reach, not just one in inventory.",
        ),
      );
    }

    if (
      logs > 0 &&
      planks < 4 &&
      !profile.smeltPlan &&
      !recentCraftFailureFor(recentHistorySummary, "planks") &&
      !(objectiveWantsDoor(objective) && doors >= 1)
    ) {
      proposals.push({
        plannerId: "planner_make_planks",
        strategy: "turn carried logs into planks before trying anything more complex",
        instruction: "Craft planks from the carried logs",
        candidateAction: {
          name: "craft",
          arguments: { item: "planks", count: Math.min(4, Math.max(1, logs)) },
          reason: "Logs need to become planks before tables, sticks, and most build steps.",
        },
        successCondition: { item: "planks", count: Math.max(planks, 4) },
        maximumSteps: 120,
      });
    }

    if (proposeCraftingTable && planks >= 4 && !profile.smeltPlan) {
      proposals.push({
        plannerId: "planner_beta",
        strategy: "set up a workstation from the available wood",
        instruction: "Craft a crafting table",
        candidateAction: {
          name: "craft",
          arguments: { item: "crafting_table", count: 1 },
          reason: "A crafting table unlocks broader crafting options from the current inventory.",
        },
        successCondition: { item: "crafting_table", count: 1 },
        maximumSteps: 180,
      });
    }

    if (planks >= 2 && sticks < 2 && !profile.smeltPlan && !recentCraftFailureFor(recentHistorySummary, "stick")) {
      proposals.push({
        plannerId: "planner_make_sticks",
        strategy: "craft sticks from planks",
        instruction: "Craft sticks from planks",
        candidateAction: {
          name: "craft",
          arguments: { item: "stick", count: 4 },
          reason: "Sticks are a shared prerequisite for pickaxes and some building workflows.",
        },
        successCondition: { item: "stick", count: 2 },
        maximumSteps: 120,
      });
    }

    if (
      (profile.normalizedFocus.includes("wood") ||
        profile.normalizedFocus.includes("log") ||
        profile.normalizedFocus.includes("craft") ||
        profile.normalizedFocus.includes("pickaxe")) &&
      !profile.smeltPlan &&
      logs < 3 &&
      !hasEnoughWoodForEarlyTools(worldState)
    ) {
      proposals.push({
        plannerId: "planner_alpha",
        strategy: "gather wood immediately",
        instruction: "Collect three oak logs",
        candidateAction: {
          name: "collect",
          arguments: { block_type: "oak_log", count: Math.max(3 - logs, 1) },
          reason: "Wood is the earliest blocking resource for tools and tables.",
        },
        successCondition: { item: "oak_log", count: 3 },
        maximumSteps: 400,
      });
    }

    if (proposeCraftingTable && logs + planks >= 2 && !profile.smeltPlan && !wantsDoor && !objectiveWantsDoorsAround(objective)) {
      proposals.push({
        plannerId: "planner_beta",
        strategy: "convert wood into workstation now",
        instruction: "Craft a crafting table",
        candidateAction: {
          name: "craft",
          arguments: { item: "crafting_table", count: 1 },
          reason: "A crafting table unlocks the next objective tier.",
        },
        successCondition: { item: "crafting_table", count: 1 },
        maximumSteps: 180,
      });
    }

    if (
      profile.craftItem &&
      shouldProposeToolCraft(worldState, profile.craftItem, recentHistorySummary)
    ) {
      const desiredCount = profile.craftItem === "stick" ? 4 : 1;
      proposals.push({
        plannerId: `planner_craft_${profile.craftItem}`,
        strategy: `craft ${profile.craftItem} for the active subtask`,
        instruction: `Craft ${profile.craftItem}`,
        candidateAction: {
          name: "craft",
          arguments: { item: profile.craftItem, count: desiredCount },
          reason: "The active subtask directly requires this craft and the prerequisites appear available.",
        },
        successCondition: { item: profile.craftItem, count: Math.max(1, countItem(worldState, profile.craftItem) + 1) },
        maximumSteps: 180,
      });
    }

    if (profile.smeltPlan && countItem(worldState, profile.smeltPlan.inputItem) > 0) {
      if (furnaces > 0 && !worldState.interactionHints.includes("furnace_nearby")) {
        proposals.push(
          makePlaceFurnaceProposal(
            "planner_place_furnace_for_smelt",
            "place the furnace before smelting the collected ore",
            "Place the furnace on the ground beside you",
            "The task stack shows smelting is blocked on workstation access, so placing the carried furnace is the next direct prerequisite.",
          ),
        );
      }

      if (
        worldState.interactionHints.includes("furnace_nearby") &&
        (
          worldState.interactionHints.includes(`can_smelt_${profile.smeltPlan.inputItem}`) ||
          worldState.interactionHints.includes("can_smelt")
        )
      ) {
        proposals.push({
          plannerId: `planner_smelt_${profile.smeltPlan.outputItem}`,
          strategy: "smelt the collected ore to satisfy the next task-stack prerequisite",
          instruction: `Smelt ${profile.smeltPlan.inputItem} into ${profile.smeltPlan.outputItem}`,
          candidateAction: {
            name: "smelt",
            arguments: {
              item: profile.smeltPlan.outputItem,
              input_item: profile.smeltPlan.inputItem,
              count: Math.min(countItem(worldState, profile.smeltPlan.inputItem), 3),
            },
            reason: "The active subtask is a smelting prerequisite, so converting the carried input into its smelted output is the most direct progress.",
          },
          successCondition: { item: profile.smeltPlan.outputItem, count: Math.min(3, countItem(worldState, profile.smeltPlan.inputItem)) },
          maximumSteps: 240,
        });
      }
    }

    if (profile.collectBlock && !profile.smeltPlan && canSeeTargetBlock(worldState, profile.collectBlock)) {
      proposals.push({
        plannerId: `planner_collect_${profile.collectBlock}`,
        strategy: `collect the visible target for ${profile.focus}`,
        instruction: `Collect ${profile.collectBlock}`,
        candidateAction: {
          name: "collect",
          arguments: { block_type: profile.collectBlock, count: 1 },
          reason: "The required target is already visible, so collecting it is the shortest verified step.",
        },
        successCondition: { item: profile.collectBlock, count: 1 },
        maximumSteps: profile.searchDomain === "subterranean" ? 260 : 180,
      });
    }

    if (profile.collectBlock && !profile.smeltPlan && !canSeeTargetBlock(worldState, profile.collectBlock)) {
      const direction = chooseSearchDirection(worldState, history, profile.searchDomain, profile.focus);
      if (shouldScanBeforeSearch(memorySummary, history, profile)) {
        proposals.push({
          plannerId: "planner_scan_for_subtask",
          strategy: `improve visibility before moving toward ${profile.focus}`,
          instruction: `Scan ${direction} for the next reachable target`,
          candidateAction: {
            name: "scan",
            arguments: { direction },
            reason: "A quick scan can reveal a better frontier before committing to movement.",
          },
          successCondition: { item: profile.collectBlock, count: 1 },
          maximumSteps: 80,
        });
      }

      proposals.push({
        plannerId: profile.searchDomain === "subterranean" ? "planner_search_deeper" : "planner_search_frontier",
        strategy:
          profile.searchDomain === "subterranean"
            ? "move to the next deeper search frontier for the active subtask"
            : "move to a new search frontier for the active subtask",
        instruction:
          direction === "down"
            ? "Explore downward to open a deeper search path"
            : `Explore ${direction} toward a less-revisited frontier`,
        candidateAction: {
          name: "explore",
          arguments: { direction },
          reason:
            direction === "down"
              ? "The target appears to be underground, and recent positions suggest the bot is looping on the surface."
              : "The target is not visible here, so the bot should move to a new frontier that is less likely to repeat the current loop.",
        },
        successCondition: { item: profile.collectBlock, count: 1 },
        maximumSteps: profile.searchDomain === "subterranean" ? 240 : 140,
      });
    } else if (!hasRecentFailedScan(memorySummary) && !recentFailedCollect) {
      const direction = chooseSearchDirection(worldState, history, "surface");
      proposals.push({
        plannerId: "planner_gamma",
        strategy: "improve visibility before committing",
        instruction: "Scan the nearby terrain for useful resources and hazards",
        candidateAction: {
          name: "scan",
          arguments: { direction },
          reason: "A quick scan reduces risk when the visible scene is ambiguous.",
        },
        successCondition: { item: "oak_log", count: Math.max(1, 3 - logs) },
        maximumSteps: 80,
      });
    }

    if (wantsTablePlacement && hasCraftingTableInInventory(worldState) && !blockCraftingTablePlace) {
      proposals.push(
        makePlaceCraftingTableProposal(
          "planner_place_table",
          "place the crafted workstation into the world",
          "Place the crafting table on the ground beside you",
          "The objective requires placing the table, and nearby floor space is the most reliable target.",
        ),
      );
    }

    return finalizeHeuristicProposals(proposals, worldState, memorySummary, taskContext, recentHistorySummary);
  }

  private fromStructured(value: PlannerProposalResponse): PlannerProposal {
    return {
      plannerId: value.plannerId || makeId("planner"),
      strategy: value.strategy,
      instruction: value.instruction,
      candidateAction: {
        name: value.actionName,
        arguments: compactArguments({
          block_type: value.blockType,
          item: value.item,
          count: value.count,
          direction: value.direction,
          location: value.location,
        }),
        reason: value.reason,
      },
      successCondition: {
        item: value.successItem,
        count: value.successCount,
      },
      maximumSteps: Math.max(40, Math.round(value.maximumSteps)),
    };
  }

  private shouldOverrideStructuredProposal(
    worldState: WorldState,
    proposal: PlannerProposal,
    memorySummary: string[],
    taskContext: TaskPlanningContext | null = null,
  ): boolean {
    if (
      taskContext?.activeSubtask &&
      !actionAllowedForActiveSubtask(proposal.candidateAction.name, taskContext.activeSubtask, worldState)
    ) {
      return true;
    }

    const profile = inferFocusProfile(worldState.userObjective, taskContext?.activeSubtask ?? null);
    if (proposal.candidateAction.name === "scan" && hasRecentFailedScan(memorySummary)) {
      return true;
    }

    if (
      (proposal.candidateAction.name === "scan" || proposal.candidateAction.name === "explore") &&
      worldState.perceivedResources.includes("oak_tree")
    ) {
      return true;
    }

    if (
      proposal.candidateAction.name === "place" &&
      shouldBlockCraftingTablePlace(memorySummary, worldState)
    ) {
      return true;
    }

    if (
      canPlaceCraftingTableOnFloor(worldState) &&
      (proposal.candidateAction.name === "explore" || proposal.candidateAction.name === "scan")
    ) {
      return true;
    }

    if (
      profile.searchDomain === "subterranean" &&
      proposal.candidateAction.name === "collect" &&
      String(proposal.candidateAction.arguments.block_type ?? "") === "oak_log" &&
      hasEnoughWoodForEarlyTools(worldState)
    ) {
      return true;
    }

    const craftItem = String(proposal.candidateAction.arguments.item ?? "");
    if (
      proposal.candidateAction.name === "craft" &&
      craftItem === "crafting_table" &&
      (hasNearbyCraftingTable(worldState) || hasCraftingTableInInventory(worldState))
    ) {
      return true;
    }

    if (
      proposal.candidateAction.name === "craft" &&
      requiresPlacedCraftingTable(craftItem) &&
      !hasNearbyCraftingTable(worldState)
    ) {
      return true;
    }

    if (
      proposal.candidateAction.name === "place" &&
      !destinationReadyForPlacement(worldState, null, worldState.userObjective.toLowerCase())
    ) {
      return true;
    }

    if (
      proposal.candidateAction.name === "smelt" &&
      !worldState.interactionHints.includes("furnace_nearby")
    ) {
      return true;
    }

    if (
      proposal.candidateAction.name === "craft" &&
      craftItem === "crafting_table" &&
      objectiveWantsDoorPlacement(worldState.userObjective) &&
      countItem(worldState, "wooden_door") >= 1
    ) {
      return true;
    }

    if (
      proposal.candidateAction.name === "craft" &&
      objectiveWantsDoor(worldState.userObjective) &&
      countItem(worldState, "wooden_door") >= 1 &&
      !craftItem.includes("door")
    ) {
      return true;
    }

    if (
      proposal.candidateAction.name === "craft" &&
      objectiveWantsDoorsAround(worldState.userObjective) &&
      countItem(worldState, "wooden_door") >= 1
    ) {
      return true;
    }

    return false;
  }
}

function compactArguments(input: Record<string, string | number>): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (typeof value === "number") {
        return value > 0;
      }

      return value !== "" && value !== "none";
    }),
  );
}

export function proposalToPredictedFuture(
  proposal: PlannerProposal,
  worldState: WorldState,
): PredictedFuture {
  const actionName = proposal.candidateAction.name;
  const successProbability =
    actionName === "craft" ? 0.9 : actionName === "scan" ? 0.82 : actionName === "explore" ? 0.76 : 0.88;
  const estimatedSeconds =
    actionName === "craft" ? 11 : actionName === "scan" ? 4 : actionName === "explore" ? 14 : 18;
  const risk =
    actionName === "scan" ? 0.04 : actionName === "explore" ? 0.09 : worldState.visibleHazards.length > 0 ? 0.12 : 0.06;
  const goalProgress =
    actionName === "craft" ? 0.6 : actionName === "collect" ? 0.22 : actionName === "scan" ? 0.08 : 0.12;

  return {
    branchId: makeId("plan"),
    strategy: proposal.strategy,
    candidateAction: proposal.candidateAction,
    preconditions:
      actionName === "craft"
        ? ["required resources available", "inventory has space"]
        : ["target is reachable", "step budget remains bounded"],
    predictedSteps: [
      {
        action: proposal.instruction,
        expectedResult: `Progress toward ${proposal.successCondition.item}.`,
      },
      {
        action: "verify outcome",
        expectedResult: "Inventory and scene should reflect the expected change.",
      },
    ],
    successProbability,
    estimatedSeconds,
    risk,
    resourceCost: actionName === "craft" ? 1 : 0,
    goalProgress,
    likelyNextObservation:
      actionName === "collect"
        ? "Inventory should gain the requested resource count or part of it."
        : actionName === "craft"
          ? "Crafted item should appear in inventory."
          : actionName === "scan"
            ? "Scene understanding should become more certain."
            : "Positioning should improve for the next action.",
  };
}
