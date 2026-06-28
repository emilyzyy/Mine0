import {
  assertNumber,
  assertObject,
  assertString,
} from "../shared/schema.ts";
import { type CandidateAction, parseCandidateAction } from "./candidate_action.ts";

export interface SuccessCondition {
  item: string;
  count: number;
}

export interface SubgoalIntent {
  objective: string;
  instruction: string;
  candidateAction: CandidateAction;
  successCondition: SuccessCondition;
  maximumSteps: number;
}

export function parseSubgoalIntent(value: unknown): SubgoalIntent {
  const objectValue = assertObject(value, "SubgoalIntent");
  const successCondition = assertObject(
    objectValue.successCondition,
    "SubgoalIntent.successCondition",
  );

  return {
    objective: assertString(objectValue.objective, "SubgoalIntent.objective"),
    instruction: assertString(objectValue.instruction, "SubgoalIntent.instruction"),
    candidateAction: parseCandidateAction(objectValue.candidateAction),
    successCondition: {
      item: assertString(successCondition.item, "SubgoalIntent.successCondition.item"),
      count: assertNumber(successCondition.count, "SubgoalIntent.successCondition.count"),
    },
    maximumSteps: assertNumber(objectValue.maximumSteps, "SubgoalIntent.maximumSteps"),
  };
}
