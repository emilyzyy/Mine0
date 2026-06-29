import type { ActionOutcome, PredictedFuture } from "../contracts/index.ts";

export interface VerificationResult {
  predictionError: number;
  matchedExpectation: boolean;
  notes: string[];
  issueTags: string[];
  suggestedFixes: string[];
}

export class VerificationService {
  verify(predictedFuture: PredictedFuture, actualOutcome: ActionOutcome): VerificationResult {
    const predictedGain =
      Number(predictedFuture.candidateAction.arguments.count ?? 1);
    const actualGain = actualOutcome.inventoryDelta.reduce(
      (sum, delta) => sum + Math.max(0, delta.countChange),
      0,
    );
    const progressGap = Math.abs(predictedGain - actualGain) / Math.max(1, predictedGain);
    const statusPenalty = actualOutcome.status === "success" ? 0 : actualOutcome.status === "partial_success" ? 0.2 : 0.45;
    const predictionError = Number(Math.min(1, progressGap + statusPenalty).toFixed(3));
    const diagnosis = this.diagnoseIssue(predictedFuture, actualOutcome);

    return {
      predictionError,
      matchedExpectation: predictionError < 0.25,
      notes: [
        `predicted_item_gain=${predictedGain}`,
        `actual_item_gain=${actualGain}`,
        `status=${actualOutcome.status}`,
      ],
      issueTags: diagnosis.issueTags,
      suggestedFixes: diagnosis.suggestedFixes,
    };
  }

  private diagnoseIssue(
    predictedFuture: PredictedFuture,
    actualOutcome: ActionOutcome,
  ): { issueTags: string[]; suggestedFixes: string[] } {
    const issueTags = new Set<string>();
    const suggestedFixes = new Set<string>();
    const actionName = predictedFuture.candidateAction.name;
    const failureReason = (actualOutcome.failureReason ?? "").toLowerCase();
    const movementMagnitude =
      Math.abs(actualOutcome.positionDelta.x) +
      Math.abs(actualOutcome.positionDelta.y) +
      Math.abs(actualOutcome.positionDelta.z);

    if (actualOutcome.status === "success" && actualOutcome.inventoryDelta.some((entry) => entry.countChange !== 0)) {
      issueTags.add("progress_observed");
    }

    if (actualOutcome.status === "failed" || actualOutcome.status === "timeout") {
      issueTags.add("action_failed");
      suggestedFixes.add("change the immediate approach instead of repeating the same action unchanged.");
    }

    if (failureReason.includes("recipe") || failureReason.includes("workstation") || failureReason.includes("crafting table")) {
      issueTags.add("missing_prerequisite_access");
      suggestedFixes.add("add the missing prerequisite subtask, such as placing or crafting the required workstation.");
    }

    if (failureReason.includes("fuel")) {
      issueTags.add("missing_fuel");
      suggestedFixes.add("gather or reserve fuel before retrying the smelting or furnace task.");
    }

    if (failureReason.includes("not in inventory") || failureReason.includes("missing smelt input")) {
      issueTags.add("missing_required_item");
      suggestedFixes.add("acquire the required item or material before retrying this step.");
    }

    if (failureReason.includes("no nearby furnace")) {
      issueTags.add("missing_furnace_access");
      suggestedFixes.add("place or move to a reachable furnace before retrying the smelting step.");
    }

    if (failureReason.includes("unable to find a valid nearby placement spot") || failureReason.includes("placement did not result")) {
      issueTags.add("placement_access_problem");
      suggestedFixes.add("change stance, clear space, or select a different nearby placement target before retrying placement.");
    }

    if (failureReason.includes("blockupdate") || failureReason.includes("place action timed out")) {
      issueTags.add("placement_confirmation_problem");
      suggestedFixes.add("verify whether the block was actually placed, then retry from a different stance or target if needed.");
    }

    if (failureReason.includes("pathing timed out") || failureReason.includes("explore pathing timed out")) {
      issueTags.add("pathing_problem");
      suggestedFixes.add("pick a closer or clearer target, or reposition before retrying the same movement.");
    }

    if (failureReason.includes("could not find a nearby block")) {
      issueTags.add("target_not_visible");
      suggestedFixes.add("scan or move to a new search frontier before retrying collection.");
    }

    if ((actionName === "scan" || actionName === "explore") && movementMagnitude <= 0.5 && actualOutcome.inventoryDelta.length === 0) {
      issueTags.add("stagnant_search");
      suggestedFixes.add("change search direction, search depth, or frontier instead of repeating the same scan or explore.");
    }

    if (actualOutcome.status === "partial_success") {
      issueTags.add("partial_progress");
      suggestedFixes.add("continue from the updated state, but account for the unmet remainder of the subtask.");
    }

    return {
      issueTags: [...issueTags],
      suggestedFixes: [...suggestedFixes],
    };
  }
}
