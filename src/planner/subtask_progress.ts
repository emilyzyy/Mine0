import type { WorldState } from "../contracts/world_state.ts";
import { countInventoryItem } from "./craft_prerequisites.ts";
import { isTargetVisibleForItem } from "./goal_prerequisites.ts";
import type { Subtask } from "./task_stack_service.ts";

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
): boolean {
  if (!subtask?.expectedAction) {
    return true;
  }

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
      return actionName === "collect";
    case "craft":
      return actionName === "craft";
    case "smelt":
      return actionName === "smelt";
    case "place":
    case "use":
      return actionName === "place" || actionName === "use";
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
