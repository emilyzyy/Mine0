import {
  assertNumber,
  assertObject,
  assertString,
  assertStringArray,
} from "../shared/schema.ts";
import { parseActionOutcome, type ActionOutcome } from "./action_outcome.ts";
import { parsePredictedFuture, type PredictedFuture } from "./predicted_future.ts";

export interface MemoryEntry {
  id: string;
  objective: string;
  actionType: string;
  environmentTags: string[];
  failureType: string | null;
  hazardContext: string[];
  resourceContext: string[];
  predictionError: number;
  predictedFuture: PredictedFuture;
  actualOutcome: ActionOutcome;
  createdAt: string;
}

export function parseMemoryEntry(value: unknown): MemoryEntry {
  const objectValue = assertObject(value, "MemoryEntry");
  return {
    id: assertString(objectValue.id, "MemoryEntry.id"),
    objective: assertString(objectValue.objective, "MemoryEntry.objective"),
    actionType: assertString(objectValue.actionType, "MemoryEntry.actionType"),
    environmentTags: assertStringArray(
      objectValue.environmentTags,
      "MemoryEntry.environmentTags",
    ),
    failureType:
      objectValue.failureType === null || objectValue.failureType === undefined
        ? null
        : assertString(objectValue.failureType, "MemoryEntry.failureType"),
    hazardContext: assertStringArray(
      objectValue.hazardContext,
      "MemoryEntry.hazardContext",
    ),
    resourceContext: assertStringArray(
      objectValue.resourceContext,
      "MemoryEntry.resourceContext",
    ),
    predictionError: assertNumber(
      objectValue.predictionError,
      "MemoryEntry.predictionError",
    ),
    predictedFuture: parsePredictedFuture(objectValue.predictedFuture),
    actualOutcome: parseActionOutcome(objectValue.actualOutcome),
    createdAt: assertString(objectValue.createdAt, "MemoryEntry.createdAt"),
  };
}
