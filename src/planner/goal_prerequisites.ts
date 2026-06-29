import type { WorldState } from "../contracts/world_state.ts";
import { countInventoryItem } from "./craft_prerequisites.ts";
import type { Subtask } from "./task_stack_service.ts";

export type SearchDomain = "surface" | "subterranean" | "aquatic" | "local";
export type GoalAction = "place" | "craft" | "collect" | "smelt" | "equip" | "use";

export interface ParsedGoal {
  action: GoalAction;
  targetItem: string;
  destination?: string;
}

export interface ItemObtainSpec {
  item: string;
  aliases: string[];
  collectBlock: string;
  collectFocus: string;
  locateFocus: string;
  searchDomain: SearchDomain;
  visibilitySignals: string[];
  surfaceThresholdY: number;
}

export interface LocateSpec {
  searchDomain: SearchDomain;
  locateFocus: string;
  visibilitySignals: string[];
  targetItem: string | null;
  surfaceThresholdY: number;
}

export interface DestinationAccessSpec {
  id: string;
  keywords: string[];
  locateFocus: string;
  searchDomain: SearchDomain;
  visibilitySignals: string[];
}

const DESTINATION_ACCESS_SPECS: DestinationAccessSpec[] = [
  {
    id: "water",
    keywords: ["water", "river", "lake", "ocean", "pond", "body_of_water"],
    locateFocus: "locate water on the surface to complete the placement",
    searchDomain: "aquatic",
    visibilitySignals: ["water", "water_nearby", "can_place_boat"],
  },
];

const ITEM_OBTAIN_SPECS: ItemObtainSpec[] = [
  {
    item: "sapling",
    aliases: ["oak_sapling", "spruce_sapling", "birch_sapling"],
    collectBlock: "sapling",
    collectFocus: "collect a sapling from nearby trees",
    locateFocus: "locate trees on the surface to obtain saplings",
    searchDomain: "surface",
    visibilitySignals: ["tree_visible", "oak_tree", "sapling", "sapling_visible", "leaves", "leaves2", "log", "log2"],
    surfaceThresholdY: 58,
  },
  {
    item: "oak_log",
    aliases: ["log", "log2"],
    collectBlock: "oak_log",
    collectFocus: "collect oak logs from nearby trees",
    locateFocus: "locate trees on the surface to obtain wood",
    searchDomain: "surface",
    visibilitySignals: ["tree_visible", "oak_tree", "log", "log2", "leaves", "leaves2"],
    surfaceThresholdY: 58,
  },
  {
    item: "iron_ore",
    aliases: [],
    collectBlock: "iron_ore",
    collectFocus: "collect iron ore",
    locateFocus: "locate iron ore underground",
    searchDomain: "subterranean",
    visibilitySignals: ["iron_ore", "stone_outcrop"],
    surfaceThresholdY: 58,
  },
  {
    item: "diamond_ore",
    aliases: ["diamond"],
    collectBlock: "diamond_ore",
    collectFocus: "collect diamond ore",
    locateFocus: "locate diamond ore deeper underground",
    searchDomain: "subterranean",
    visibilitySignals: ["diamond_ore", "diamond"],
    surfaceThresholdY: 58,
  },
  {
    item: "coal_ore",
    aliases: ["coal"],
    collectBlock: "coal_ore",
    collectFocus: "collect coal ore",
    locateFocus: "locate coal ore underground",
    searchDomain: "subterranean",
    visibilitySignals: ["coal_ore", "coal"],
    surfaceThresholdY: 58,
  },
  {
    item: "cobblestone",
    aliases: ["stone"],
    collectBlock: "stone",
    collectFocus: "collect stone for cobblestone",
    locateFocus: "locate stone nearby",
    searchDomain: "local",
    visibilitySignals: ["stone", "cobblestone", "stone_outcrop"],
    surfaceThresholdY: 58,
  },
  {
    item: "sand",
    aliases: [],
    collectBlock: "sand",
    collectFocus: "collect sand",
    locateFocus: "locate sand on the surface",
    searchDomain: "surface",
    visibilitySignals: ["sand"],
    surfaceThresholdY: 58,
  },
];

function normalizeItemToken(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/gi, "").toLowerCase();
}

function stripLeadingArticle(value: string): string {
  return value.trim().replace(/^(?:a|an|one|the)\s+/i, "");
}

function stripLocationSuffix(value: string): string {
  return value.replace(/\s+(?:nearby|near by|close by|within reach)$/i, "").trim();
}

export function parseGoalFromObjective(objective: string): ParsedGoal | null {
  const normalized = objective.trim().toLowerCase();
  const destinationMatch = normalized.match(/\b(?:in|into|on|onto|at|near|by|beside|under)\s+(.+)$/i);
  const destination = destinationMatch ? destinationMatch[0].trim() : undefined;

  const plantMatch = normalized.match(/\bplant(?:\s+(?:a|an|one|the))?\s+(.+?)(?:\s+(?:in|into|on|onto|at|near|by|beside|under)\b|$)/i);
  if (plantMatch?.[1]) {
    return {
      action: "place",
      targetItem: normalizeItemToken(stripLeadingArticle(plantMatch[1])),
      ...(destination ? { destination } : {}),
    };
  }

  const actionMatch = normalized.match(
    /^(craft|make|place|put|collect|gather|mine|smelt|equip|use|plant|grow|find|obtain|get)\b\s*(.+)$/i,
  );
  if (!actionMatch) {
    return null;
  }

  const rawAction = actionMatch[1]?.toLowerCase() ?? "";
  const remainder = stripLeadingArticle(actionMatch[2] ?? "");
  const targetPhrase = stripLocationSuffix(
    remainder.split(/\s+(?:in|into|on|onto|at|near|by|beside|under)\s+/i)[0] ?? remainder,
  );
  const targetItem = normalizeItemToken(targetPhrase);
  if (!targetItem) {
    return null;
  }

  const action: GoalAction =
    rawAction === "make"
      ? "craft"
      : rawAction === "put" || rawAction === "plant" || rawAction === "grow"
        ? "place"
        : rawAction === "gather" || rawAction === "mine" || rawAction === "find" || rawAction === "obtain" || rawAction === "get"
          ? "collect"
          : (rawAction as GoalAction);

  return {
    action,
    targetItem,
    ...(destination ? { destination } : {}),
  };
}

export function findItemObtainSpec(item: string): ItemObtainSpec | null {
  const normalized = normalizeItemToken(item);
  return (
    ITEM_OBTAIN_SPECS.find(
      (spec) => spec.item === normalized || spec.aliases.includes(normalized),
    ) ?? null
  );
}

export function inventoryHasItem(
  inventory: WorldState["inventory"],
  item: string,
  minimum = 1,
): boolean {
  return countInventoryItem(inventory, item) >= minimum;
}

function haystackEntries(worldState: WorldState): string[] {
  return [
    ...worldState.perceivedResources,
    ...worldState.nearbyBlocks,
    ...worldState.interactionHints,
    worldState.lineOfSightTarget ?? "",
    worldState.biomeOrRegionHint,
  ].map((entry) => entry.toLowerCase());
}

export function isSignalVisible(worldState: WorldState, signals: string[]): boolean {
  const haystack = haystackEntries(worldState);
  return signals.some((signal) => haystack.some((entry) => entry.includes(signal.toLowerCase())));
}

export function inferDestinationRequirement(input: {
  planningFocus?: string;
  destination?: string;
}): DestinationAccessSpec | null {
  const normalized = `${input.destination ?? ""} ${input.planningFocus ?? ""}`.toLowerCase();
  return (
    DESTINATION_ACCESS_SPECS.find((spec) => spec.keywords.some((keyword) => normalized.includes(keyword))) ?? null
  );
}

export function isDestinationAccessible(
  spec: DestinationAccessSpec,
  worldState: WorldState,
): boolean {
  return isSignalVisible(worldState, spec.visibilitySignals);
}

export function expandDestinationPrerequisites(
  subtask: Subtask,
  worldState: WorldState,
  satisfiedLocateIds: ReadonlySet<string> = new Set(),
): Subtask[] {
  const destinationSpec = inferDestinationRequirement(subtask);
  if (!destinationSpec || isDestinationAccessible(destinationSpec, worldState)) {
    return [];
  }

  const locateId = `locate_${destinationSpec.id}`;
  if (satisfiedLocateIds.has(locateId)) {
    return [];
  }

  return [
    makeLocateSubtask(
      locateId,
      `Locate ${destinationSpec.id} for placement`,
      destinationSpec.locateFocus,
      destinationSpec.searchDomain,
      subtask.parentId ?? subtask.id,
      subtask.targetItem ?? null,
    ),
  ];
}

export function placeFailureNeedsLocateDestination(
  failureReason: string | null | undefined,
  subtask: Subtask,
  worldState: WorldState,
): boolean {
  const destinationSpec = inferDestinationRequirement(subtask);
  if (!destinationSpec || isDestinationAccessible(destinationSpec, worldState)) {
    return false;
  }

  const reason = (failureReason ?? "").toLowerCase();
  return (
    reason.includes("no reachable water") ||
    reason.includes("no reachable interaction") ||
    reason.includes("unable to find a valid nearby placement") ||
    reason.includes("placement did not result") ||
    reason.includes("destination_not_accessible")
  );
}

export function isTargetVisibleForItem(worldState: WorldState, item: string): boolean {
  const spec = findItemObtainSpec(item);
  if (!spec) {
    return isSignalVisible(worldState, [item]);
  }
  return isSignalVisible(worldState, spec.visibilitySignals);
}

export function inferLocateSpec(subtask: Subtask): LocateSpec | null {
  const focus = subtask.planningFocus.toLowerCase();
  if (!/(locate|find|search|pathfind|reach)\b/.test(focus)) {
    return null;
  }

  if (subtask.destination && ["surface", "subterranean", "aquatic", "local"].includes(subtask.destination)) {
    const domain = subtask.destination as SearchDomain;
    return {
      searchDomain: domain,
      locateFocus: subtask.planningFocus,
      visibilitySignals: subtask.targetItem ? findItemObtainSpec(subtask.targetItem)?.visibilitySignals ?? [subtask.targetItem] : [],
      targetItem: subtask.targetItem ?? null,
      surfaceThresholdY: 58,
    };
  }

  if (/\b(surface|overground|trees?|forest|wood)\b/.test(focus)) {
    return {
      searchDomain: "surface",
      locateFocus: subtask.planningFocus,
      visibilitySignals: ["tree_visible", "oak_tree", "log", "log2", "leaves", "sapling"],
      targetItem: subtask.targetItem ?? null,
      surfaceThresholdY: 58,
    };
  }

  if (/\b(underground|deeper|below|ore|cave|mine)\b/.test(focus)) {
    return {
      searchDomain: "subterranean",
      locateFocus: subtask.planningFocus,
      visibilitySignals: subtask.targetItem ? findItemObtainSpec(subtask.targetItem)?.visibilitySignals ?? ["ore"] : ["ore"],
      targetItem: subtask.targetItem ?? null,
      surfaceThresholdY: 58,
    };
  }

  if (/\b(water|river|lake|ocean|pond)\b/.test(focus)) {
    return {
      searchDomain: "aquatic",
      locateFocus: subtask.planningFocus,
      visibilitySignals: ["water", "water_nearby", "can_place_boat"],
      targetItem: subtask.targetItem ?? null,
      surfaceThresholdY: 58,
    };
  }

  const destinationSpec = inferDestinationRequirement(subtask);
  if (destinationSpec) {
    return {
      searchDomain: destinationSpec.searchDomain,
      locateFocus: subtask.planningFocus,
      visibilitySignals: destinationSpec.visibilitySignals,
      targetItem: subtask.targetItem ?? null,
      surfaceThresholdY: 58,
    };
  }

  const obtainSpec = subtask.targetItem ? findItemObtainSpec(subtask.targetItem) : null;
  if (obtainSpec) {
    return {
      searchDomain: obtainSpec.searchDomain,
      locateFocus: subtask.planningFocus,
      visibilitySignals: obtainSpec.visibilitySignals,
      targetItem: obtainSpec.item,
      surfaceThresholdY: obtainSpec.surfaceThresholdY,
    };
  }

  return {
    searchDomain: "local",
    locateFocus: subtask.planningFocus,
    visibilitySignals: subtask.targetItem ? [subtask.targetItem] : [],
    targetItem: subtask.targetItem ?? null,
    surfaceThresholdY: 58,
  };
}

function needsSurfaceAccess(worldState: WorldState, spec: Pick<ItemObtainSpec, "searchDomain" | "surfaceThresholdY">): boolean {
  return spec.searchDomain === "surface" && worldState.position.y < spec.surfaceThresholdY;
}

function makeReachSurfaceSubtask(parentId: string, targetItem: string | null): Subtask {
  return {
    id: `reach_surface_for_${targetItem ?? "resources"}`,
    description: "Reach the surface to search for resources",
    planningFocus: "pathfind upward to the surface to search for resources",
    compound: false,
    expectedAction: "explore",
    parentId,
    destination: "surface",
    ...(targetItem ? { targetItem } : {}),
  };
}

function makeLocateSubtask(
  id: string,
  description: string,
  locateFocus: string,
  searchDomain: SearchDomain,
  parentId: string,
  targetItem: string | null,
): Subtask {
  return {
    id,
    description,
    planningFocus: locateFocus,
    compound: false,
    expectedAction: "explore",
    parentId,
    destination: searchDomain,
    ...(targetItem ? { targetItem } : {}),
  };
}

function makeObtainSubtask(
  id: string,
  description: string,
  collectFocus: string,
  targetItem: string,
  parentId: string,
): Subtask {
  return {
    id,
    description,
    planningFocus: collectFocus,
    compound: false,
    expectedAction: "collect",
    targetItem,
    parentId,
  };
}

export function expandObtainItemChain(
  item: string,
  worldState: WorldState,
  parentId: string,
): Subtask[] {
  if (inventoryHasItem(worldState.inventory, item)) {
    return [];
  }

  const spec = findItemObtainSpec(item);
  if (!spec) {
    return [
      makeObtainSubtask(
        `obtain_${normalizeItemToken(item)}`,
        `Obtain ${item.replace(/_/g, " ")}`,
        `collect ${item.replace(/_/g, " ")}`,
        item,
        parentId,
      ),
    ];
  }

  const chain: Subtask[] = [];
  const obtainParent = parentId;

  if (needsSurfaceAccess(worldState, spec)) {
    chain.push(makeReachSurfaceSubtask(obtainParent, spec.item));
  }

  if (!isTargetVisibleForItem(worldState, spec.item)) {
    chain.push(
      makeLocateSubtask(
        `locate_${spec.item}`,
        `Locate sources of ${spec.item.replace(/_/g, " ")}`,
        spec.locateFocus,
        spec.searchDomain,
        obtainParent,
        spec.item,
      ),
    );
  }

  chain.push(
    makeObtainSubtask(
      `obtain_${spec.item}`,
      `Obtain ${spec.item.replace(/_/g, " ")}`,
      spec.collectFocus,
      spec.item,
      obtainParent,
    ),
  );

  return chain;
}

export function expandAccessPrerequisites(subtask: Subtask, worldState: WorldState): Subtask[] {
  if (subtask.expectedAction !== "collect" && !subtask.planningFocus.toLowerCase().includes("collect")) {
    return [];
  }

  if (/(pickaxe|furnace|crafting table|smelt|cobblestone|stone pickaxe|iron pickaxe)/i.test(subtask.planningFocus)) {
    return [];
  }

  const targetItem = subtask.targetItem ?? inferCollectTargetFromFocus(subtask.planningFocus);
  if (!targetItem || inventoryHasItem(worldState.inventory, targetItem)) {
    return [];
  }

  const spec = findItemObtainSpec(targetItem);
  if (!spec || isTargetVisibleForItem(worldState, targetItem)) {
    return [];
  }

  const chain: Subtask[] = [];
  if (needsSurfaceAccess(worldState, spec)) {
    chain.push(makeReachSurfaceSubtask(subtask.parentId ?? subtask.id, spec.item));
  }

  chain.push(
    makeLocateSubtask(
      `locate_${spec.item}`,
      `Locate sources of ${spec.item.replace(/_/g, " ")}`,
      spec.locateFocus,
      spec.searchDomain,
      subtask.parentId ?? subtask.id,
      spec.item,
    ),
  );
  return chain;
}

function inferCollectTargetFromFocus(focus: string): string | null {
  const normalized = focus.toLowerCase();
  for (const spec of ITEM_OBTAIN_SPECS) {
    if (normalized.includes(spec.item.replace(/_/g, " ")) || spec.aliases.some((alias) => normalized.includes(alias))) {
      return spec.item;
    }
  }

  const match = normalized.match(/\bcollect(?:\s+(?:a|an|one|the))?\s+([a-z0-9_ ]+)/);
  if (match?.[1]) {
    return normalizeItemToken(match[1]);
  }

  return null;
}

export function expandGoalPrerequisites(
  subtask: Subtask,
  worldState: WorldState,
  satisfiedLocateIds: ReadonlySet<string> = new Set(),
): Subtask[] {
  const parsed =
    subtask.targetItem && subtask.expectedAction
      ? {
          action: subtask.expectedAction as GoalAction,
          targetItem: subtask.targetItem,
          ...(subtask.destination ? { destination: subtask.destination } : {}),
        }
      : parseGoalFromObjective(subtask.planningFocus);

  if (!parsed) {
    return [subtask];
  }

  const needsInventoryFirst = parsed.action === "place" || parsed.action === "use" || parsed.action === "equip";
  const chain: Subtask[] = [];
  const parentId = subtask.parentId ?? "goal";

  if (needsInventoryFirst && !inventoryHasItem(worldState.inventory, parsed.targetItem)) {
    chain.push(...expandObtainItemChain(parsed.targetItem, worldState, parentId));
  }

  if (parsed.action === "place" || parsed.action === "use") {
    chain.push(...expandDestinationPrerequisites(subtask, worldState, satisfiedLocateIds));
  }

  if (chain.length === 0) {
    return [subtask];
  }

  subtask.parentId ??= parentId;
  for (const task of chain) {
    task.parentId ??= subtask.id;
  }

  return [...chain, subtask];
}

export function locateSearchSatisfied(
  subtask: Subtask,
  outcome: import("../contracts/action_outcome.ts").ActionOutcome,
  worldState: WorldState,
): boolean {
  if (outcome.status !== "success") {
    return false;
  }

  const locateSpec = inferLocateSpec(subtask);
  if (!locateSpec) {
    return false;
  }

  const movement = Math.abs(outcome.positionDelta.x) + Math.abs(outcome.positionDelta.y) + Math.abs(outcome.positionDelta.z);
  if (locateSpec.searchDomain === "surface" && subtask.planningFocus.toLowerCase().includes("surface")) {
    if (worldState.position.y >= locateSpec.surfaceThresholdY && movement > 0.5) {
      return true;
    }
  }

  if (locateSpec.targetItem && isTargetVisibleForItem(worldState, locateSpec.targetItem)) {
    return true;
  }

  if (locateSpec.visibilitySignals.length > 0 && isSignalVisible(worldState, locateSpec.visibilitySignals)) {
    return true;
  }

  return movement >= 2.5;
}

export function collectFailureNeedsLocate(
  targetItem: string | null,
  failureReason: string | null | undefined,
  worldState: WorldState,
): boolean {
  if (!targetItem || inventoryHasItem(worldState.inventory, targetItem)) {
    return false;
  }

  if (isTargetVisibleForItem(worldState, targetItem)) {
    return false;
  }

  const reason = (failureReason ?? "").toLowerCase();
  return (
    reason.includes("could not find a nearby block") ||
    reason.includes("no matching resource") ||
    reason.includes("digging timed out") ||
    reason.includes("target_not_visible")
  );
}

export function verificationNeedsLocateSubtask(
  issueTags: string[],
  activeSubtask: Subtask | null,
  worldState: WorldState,
  satisfiedLocateIds: ReadonlySet<string> = new Set(),
): Subtask[] {
  if (!activeSubtask) {
    return [];
  }

  const destinationIssues = issueTags.some((tag) =>
    ["destination_not_accessible", "placement_access_problem", "stagnant_search"].includes(tag),
  );
  if (destinationIssues) {
    const destinationTasks = expandDestinationPrerequisites(activeSubtask, worldState, satisfiedLocateIds);
    if (destinationTasks.length > 0) {
      return destinationTasks;
    }
  }

  const targetItem = activeSubtask.targetItem ?? inferCollectTargetFromFocus(activeSubtask.planningFocus);
  const searchIssues = issueTags.some((tag) =>
    ["target_not_visible", "stagnant_search", "missing_required_item"].includes(tag),
  );

  if (!searchIssues || !targetItem || inventoryHasItem(worldState.inventory, targetItem)) {
    return [];
  }

  if (isTargetVisibleForItem(worldState, targetItem)) {
    return [];
  }

  return expandAccessPrerequisites(
    {
      ...activeSubtask,
      expectedAction: "collect",
      targetItem,
    },
    worldState,
  );
}
