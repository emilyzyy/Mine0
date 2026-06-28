import {
  assertObject,
  assertString,
} from "../shared/schema.ts";

export interface CandidateAction {
  name: string;
  arguments: Record<string, string | number | boolean>;
  reason: string;
}

export function parseCandidateAction(value: unknown): CandidateAction {
  const objectValue = assertObject(value, "CandidateAction");
  const argumentsValue = assertObject(objectValue.arguments, "CandidateAction.arguments");
  const normalizedArguments: Record<string, string | number | boolean> = {};

  for (const [key, entry] of Object.entries(argumentsValue)) {
    if (
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      throw new Error(`CandidateAction.arguments.${key} must be string, number, or boolean.`);
    }

    normalizedArguments[key] = entry;
  }

  return {
    name: assertString(objectValue.name, "CandidateAction.name"),
    arguments: normalizedArguments,
    reason: assertString(objectValue.reason, "CandidateAction.reason"),
  };
}
