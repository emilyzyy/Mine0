import type { WorldState } from "../contracts/world_state.ts";
import { countInventoryItem } from "./craft_prerequisites.ts";
import { isTargetVisibleForItem } from "./goal_prerequisites.ts";
import type { Subtask } from "./task_stack_service.ts";

function actionMatchesTarget(actual: string, target: string | null): boolean {
  if (!target || !actual) {
    return true;
  }

  const aliases =
    target === "oak_log"
      ? ["oak_log", "log"]
      : target === "oak_planks" || target === "planks"
        ? ["oak_planks", "planks"]
        : target === "wooden_door"
          ? ["wooden_door", "door"]
          : target === "cobblestone"
            ? ["cobblestone", "stone"]
            : [target];

  return aliases.includes(actual);
}

export function subtaskTargetCount(subtask: Subtask): number {
  const count = subtask.targetCount;
  if (typeof count === "number" && Number.isFinite(count) && count > 0) {
    return Math.floor(count);
  }
  return 1;
}

export function inventoryCountForSubtask(
  inventory: WorldState["inventory"],
  targetItem: string,
): number {
  return countInventoryItem(inventory, targetItem);
}

export function subtaskRequirementMet(
  subtask: Subtask,
  inventory: WorldState["inventory"],
): boolean {
  if (!subtask.targetItem) {
    return false;
  }

  return inventoryCountForSubtask(inventory, subtask.targetItem) >= subtaskTargetCount(subtask);
}

export function subtaskCompletesFromInventory(
  subtask: Subtask,
  worldState: WorldState,
): boolean {
  if (subtask.expectedAction === "place" || subtask.expectedAction === "use") {
    return false;
  }

  if (
    subtask.expectedAction === "explore" ||
    subtask.expectedAction === "scan" ||
    /(locate|search|pathfind|reach)\b/.test(subtask.planningFocus.toLowerCase())
  ) {
    return false;
  }

  return subtaskRequirementMet(subtask, worldState.inventory);
}

export function actionAllowedForActiveSubtask(
  actionName: string,
  subtask: Subtask | null,
  worldState: WorldState,
  actionArguments: Record<string, string | number> = {},
): boolean {
  if (!subtask?.expectedAction) {
    return true;
  }

  const targetItem = subtask.targetItem?.toLowerCase() ?? null;
  const craftItem = String(actionArguments.item ?? "").toLowerCase();
  const collectItem = String(actionArguments.block_type ?? "").toLowerCase();
  const placeItem = String(actionArguments.block_type ?? "").toLowerCase();
  const smeltOutput = String(actionArguments.item ?? "").toLowerCase();

  switch (subtask.expectedAction) {
    case "explore":
    case "scan":
      if (actionName === "explore" || actionName === "scan") {
        return true;
      }
      if (
        actionName === "collect" &&
        subtask.targetItem &&
        isTargetVisibleForItem(worldState, subtask.targetItem)
      ) {
        return true;
      }
      return false;
    case "collect":
      if (actionName !== "collect") {
        return false;
      }
      return actionMatchesTarget(collectItem, targetItem);
    case "craft":
      if (actionName !== "craft") {
        return false;
      }
      return actionMatchesTarget(craftItem, targetItem);
    case "smelt":
      if (actionName !== "smelt") {
        return false;
      }
      return actionMatchesTarget(smeltOutput, targetItem);
    case "place":
    case "use":
      if (actionName !== "place" && actionName !== "use") {
        return false;
      }
      return actionMatchesTarget(placeItem, targetItem);
    case "equip":
      return actionName === "equip";
    default:
      return true;
  }
}

export function remainingSubtaskCount(
  subtask: Subtask,
  inventory: WorldState["inventory"],
): number {
  if (!subtask.targetItem) {
    return subtaskTargetCount(subtask);
  }

  return Math.max(0, subtaskTargetCount(subtask) - inventoryCountForSubtask(inventory, subtask.targetItem));
}
