import type { PredictedFuture } from "../contracts/index.ts";

export interface ScoredFuture {
  future: PredictedFuture;
  score: number;
  notes: string[];
}

export class CriticService {
  score(futures: PredictedFuture[], memoryAdjustment = 0): ScoredFuture[] {
    return futures
      .map((future) => {
        const normalizedTimeCost = Math.min(1, future.estimatedSeconds / 60);
        const normalizedResourceCost = Math.min(1, future.resourceCost / 4);
        const score =
          0.4 * future.goalProgress +
          0.3 * future.successProbability -
          0.15 * future.risk -
          0.1 * normalizedTimeCost -
          0.05 * normalizedResourceCost +
          memoryAdjustment;

        return {
          future,
          score: Number(score.toFixed(4)),
          notes: [
            `goal_progress=${future.goalProgress.toFixed(2)}`,
            `success_probability=${future.successProbability.toFixed(2)}`,
            `risk=${future.risk.toFixed(2)}`,
          ],
        };
      })
      .sort((left, right) => right.score - left.score);
  }
}
