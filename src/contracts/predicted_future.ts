import {
  assertArray,
  assertNumber,
  assertObject,
  assertString,
  assertStringArray,
} from "../shared/schema.ts";
import { type CandidateAction, parseCandidateAction } from "./candidate_action.ts";

export interface PredictedStep {
  action: string;
  expectedResult: string;
}

export interface PredictedFuture {
  branchId: string;
  strategy: string;
  candidateAction: CandidateAction;
  preconditions: string[];
  predictedSteps: PredictedStep[];
  successProbability: number;
  estimatedSeconds: number;
  risk: number;
  resourceCost: number;
  goalProgress: number;
  likelyNextObservation: string;
}

function parsePredictedStep(value: unknown, label: string): PredictedStep {
  const objectValue = assertObject(value, label);
  return {
    action: assertString(objectValue.action, `${label}.action`),
    expectedResult: assertString(objectValue.expectedResult, `${label}.expectedResult`),
  };
}

export function parsePredictedFuture(value: unknown): PredictedFuture {
  const objectValue = assertObject(value, "PredictedFuture");
  return {
    branchId: assertString(objectValue.branchId, "PredictedFuture.branchId"),
    strategy: assertString(objectValue.strategy, "PredictedFuture.strategy"),
    candidateAction: parseCandidateAction(objectValue.candidateAction),
    preconditions: assertStringArray(
      objectValue.preconditions,
      "PredictedFuture.preconditions",
    ),
    predictedSteps: assertArray(
      objectValue.predictedSteps,
      "PredictedFuture.predictedSteps",
    ).map((entry, index) =>
      parsePredictedStep(entry, `PredictedFuture.predictedSteps[${index}]`),
    ),
    successProbability: assertNumber(
      objectValue.successProbability,
      "PredictedFuture.successProbability",
    ),
    estimatedSeconds: assertNumber(
      objectValue.estimatedSeconds,
      "PredictedFuture.estimatedSeconds",
    ),
    risk: assertNumber(objectValue.risk, "PredictedFuture.risk"),
    resourceCost: assertNumber(objectValue.resourceCost, "PredictedFuture.resourceCost"),
    goalProgress: assertNumber(objectValue.goalProgress, "PredictedFuture.goalProgress"),
    likelyNextObservation: assertString(
      objectValue.likelyNextObservation,
      "PredictedFuture.likelyNextObservation",
    ),
  };
}
