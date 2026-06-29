import type { WorldState } from "../contracts/world_state.ts";
import type { Subtask } from "./task_stack_service.ts";

const INVENTORY_ONLY_CRAFTS = new Set([
  "planks",
  "stick",
  "crafting_table",
  "torch",
  "wooden_button",
  "wooden_pressure_plate",
]);

export function normalizeCraftItem(item: string): string {
  switch (item.toLowerCase()) {
    case "oak_planks":
      return "planks";
    case "oak_log":
      return "log";
    case "door":
      return "wooden_door";
    default:
      return item.toLowerCase();
  }
}

export function requiresPlacedCraftingTable(item: string): boolean {
  const normalized = normalizeCraftItem(item);
  if (INVENTORY_ONLY_CRAFTS.has(normalized)) {
    return false;
  }

  return /(pickaxe|_axe|_sword|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|door|furnace|chest|bow|bucket|bed|sign|fence|gate|trapdoor|piston|repeater|comparator|hopper|anvil|enchanting_table)/.test(
    normalized,
  );
}

export function countInventoryItem(inventory: WorldState["inventory"], item: string): number {
  const aliases =
    item === "oak_log"
      ? ["oak_log", "log"]
      : item === "oak_planks"
        ? ["oak_planks", "planks"]
        : item === "wooden_door"
          ? ["wooden_door", "door"]
          : item === "cobblestone"
            ? ["cobblestone", "stone"]
            : [item];

  return inventory
    .filter((stack) => aliases.includes(stack.item))
    .reduce((sum, stack) => sum + stack.count, 0);
}

export function hasNearbyCraftingTable(worldState: WorldState): boolean {
  return worldState.interactionHints.includes("crafting_table_nearby");
}

export function hasCraftingTableInInventory(worldState: WorldState): boolean {
  return countInventoryItem(worldState.inventory, "crafting_table") >= 1;
}

export function canPlaceCraftingTable(worldState: WorldState): boolean {
  return (
    worldState.interactionHints.includes("can_place_crafting_table") ||
    worldState.interactionHints.includes("can_place_crafting_table_underfoot")
  );
}

function makeCraftPlanksSubtask(): Subtask {
  return {
    id: "craft_planks_for_workstation",
    description: "Craft planks for a crafting table",
    planningFocus: "craft planks from logs",
    compound: false,
  };
}

function makeCraftTableSubtask(): Subtask {
  return {
    id: "craft_crafting_table",
    description: "Craft a crafting table",
    planningFocus: "craft one crafting table",
    compound: false,
  };
}

function makePlaceTableSubtask(): Subtask {
  return {
    id: "place_crafting_table",
    description: "Place a crafting table within reach",
    planningFocus: "place the crafting table on nearby floor space",
    compound: false,
  };
}

export function buildWorkstationPrerequisiteSubtasks(
  worldState: WorldState,
  targetCraftItem: string,
): Subtask[] {
  if (!requiresPlacedCraftingTable(targetCraftItem)) {
    return [];
  }

  if (hasNearbyCraftingTable(worldState)) {
    return [];
  }

  const planks = countInventoryItem(worldState.inventory, "planks");
  const logs = countInventoryItem(worldState.inventory, "oak_log");
  const tasks: Subtask[] = [];

  if (hasCraftingTableInInventory(worldState)) {
    if (canPlaceCraftingTable(worldState)) {
      tasks.push(makePlaceTableSubtask());
    }
    return tasks;
  }

  if (planks >= 4) {
    tasks.push(makeCraftTableSubtask());
    if (canPlaceCraftingTable(worldState)) {
      tasks.push(makePlaceTableSubtask());
    }
    return tasks;
  }

  if (logs > 0) {
    tasks.push(makeCraftPlanksSubtask());
  }

  if (planks >= 4 || logs >= 1) {
    tasks.push(makeCraftTableSubtask());
  }

  if (canPlaceCraftingTable(worldState)) {
    tasks.push(makePlaceTableSubtask());
  }

  return tasks;
}

export function prependWorkstationPrerequisites(
  worldState: WorldState,
  subtasks: Subtask[],
): Subtask[] {
  const expanded: Subtask[] = [];

  for (const subtask of subtasks) {
    const craftItem = extractCraftItemFromFocus(subtask.planningFocus);
    if (craftItem) {
      expanded.push(...buildWorkstationPrerequisiteSubtasks(worldState, craftItem));
    }
    expanded.push(subtask);
  }

  return dedupeSubtasks(expanded);
}

export function extractCraftItemFromFocus(focus: string): string | null {
  const normalized = focus.toLowerCase();
  const craftMatch = normalized.match(/craft(?:\s+one|\s+a|\s+the|\s+an)?\s+([a-z0-9_]+)/);
  if (craftMatch?.[1]) {
    return normalizeCraftItem(craftMatch[1]);
  }

  if (!normalized.includes("craft")) {
    return null;
  }

  if (normalized.includes("wooden pickaxe")) {
    return "wooden_pickaxe";
  }
  if (normalized.includes("stone pickaxe")) {
    return "stone_pickaxe";
  }
  if (normalized.includes("iron pickaxe")) {
    return "iron_pickaxe";
  }
  if (normalized.includes("wooden door")) {
    return "wooden_door";
  }

  return null;
}

export function craftFailureNeedsWorkstation(
  intentItem: string,
  failureReason: string | null | undefined,
  worldState: WorldState,
): boolean {
  const item = normalizeCraftItem(intentItem);
  if (!requiresPlacedCraftingTable(item)) {
    return false;
  }

  if (hasNearbyCraftingTable(worldState)) {
    return false;
  }

  const reason = (failureReason ?? "").toLowerCase();
  return (
    reason.includes("no available recipe") ||
    reason.includes("crafting table") ||
    reason.includes("workstation")
  );
}

function dedupeSubtasks(subtasks: Subtask[]): Subtask[] {
  const seen = new Set<string>();
  return subtasks.filter((subtask) => {
    const key = `${subtask.id}:${subtask.planningFocus}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
