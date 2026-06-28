import {
  assertArray,
  assertBoolean,
  assertLiteral,
  assertNumber,
  assertObject,
  assertOptionalString,
  assertString,
} from "../shared/schema.ts";
import { type CandidateAction, parseCandidateAction } from "./candidate_action.ts";
import { type Position3, parsePosition3 } from "./world_state.ts";

export interface InventoryDelta {
  item: string;
  countChange: number;
}

export interface VisualVerification {
  targetReached: boolean;
  terrainChangedAsExpected: boolean;
  hazardPresent: boolean;
}

export type OutcomeStatus = "success" | "partial_success" | "failed" | "timeout";

export interface ActionOutcome {
  executedAction: CandidateAction;
  status: OutcomeStatus;
  durationSeconds: number;
  inventoryDelta: InventoryDelta[];
  healthDelta: number;
  hungerDelta: number;
  positionDelta: Position3;
  visualVerification: VisualVerification;
  failureReason: string | null;
  executor: string;
}

function parseInventoryDelta(value: unknown, label: string): InventoryDelta {
  const objectValue = assertObject(value, label);
  return {
    item: assertString(objectValue.item, `${label}.item`),
    countChange: assertNumber(objectValue.countChange, `${label}.countChange`),
  };
}

export function parseActionOutcome(value: unknown): ActionOutcome {
  const objectValue = assertObject(value, "ActionOutcome");
  const visualVerification = assertObject(
    objectValue.visualVerification,
    "ActionOutcome.visualVerification",
  );

  return {
    executedAction: parseCandidateAction(objectValue.executedAction),
    status: assertLiteral(
      objectValue.status,
      ["success", "partial_success", "failed", "timeout"] as const,
      "ActionOutcome.status",
    ),
    durationSeconds: assertNumber(
      objectValue.durationSeconds,
      "ActionOutcome.durationSeconds",
    ),
    inventoryDelta: assertArray(
      objectValue.inventoryDelta,
      "ActionOutcome.inventoryDelta",
    ).map((entry, index) => parseInventoryDelta(entry, `ActionOutcome.inventoryDelta[${index}]`)),
    healthDelta: assertNumber(objectValue.healthDelta, "ActionOutcome.healthDelta"),
    hungerDelta: assertNumber(objectValue.hungerDelta, "ActionOutcome.hungerDelta"),
    positionDelta: parsePosition3(objectValue.positionDelta, "ActionOutcome.positionDelta"),
    visualVerification: {
      targetReached: assertBoolean(
        visualVerification.targetReached,
        "ActionOutcome.visualVerification.targetReached",
      ),
      terrainChangedAsExpected: assertBoolean(
        visualVerification.terrainChangedAsExpected,
        "ActionOutcome.visualVerification.terrainChangedAsExpected",
      ),
      hazardPresent: assertBoolean(
        visualVerification.hazardPresent,
        "ActionOutcome.visualVerification.hazardPresent",
      ),
    },
    failureReason: assertOptionalString(
      objectValue.failureReason,
      "ActionOutcome.failureReason",
    ),
    executor: assertString(objectValue.executor, "ActionOutcome.executor"),
  };
}
