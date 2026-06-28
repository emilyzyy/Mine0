import type { ActionOutcome, PredictedFuture } from "../contracts/index.ts";

export interface VerificationResult {
  predictionError: number;
  matchedExpectation: boolean;
  notes: string[];
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

    return {
      predictionError,
      matchedExpectation: predictionError < 0.25,
      notes: [
        `predicted_item_gain=${predictedGain}`,
        `actual_item_gain=${actualGain}`,
        `status=${actualOutcome.status}`,
      ],
    };
  }
}
