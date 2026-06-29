import type { PredictedFuture } from "../contracts/index.ts";
import type { WorldState } from "../contracts/index.ts";
import { loadPlannerConfig } from "../shared/config.ts";
import {
  CerebrasClient,
  type ProviderCallMeta,
} from "../planner/cerebras_client.ts";
import { criticUserPrompt, criticSystemPrompt } from "../planner/planner_prompts.ts";
import { criticSchema } from "../planner/planner_schemas.ts";

export interface ScoredFuture {
  future: PredictedFuture;
  score: number;
  notes: string[];
}

interface CriticBranchAssessment {
  branchId: string;
  adjustment: number;
  memoryAlignment: number;
  executionConcern: string;
  rationale: string;
}

interface CriticResponse {
  branches: CriticBranchAssessment[];
}

export class CriticService {
  private readonly client = new CerebrasClient();
  private readonly config = loadPlannerConfig();

  async score(
    worldState: WorldState,
    memorySummary: string[],
    futures: PredictedFuture[],
    memoryAdjustment = 0,
  ): Promise<{ scored: ScoredFuture[]; meta: ProviderCallMeta[] }> {
    let criticAssessments = new Map<string, CriticBranchAssessment>();
    let criticMeta: ProviderCallMeta[] = [];

    if (this.config.provider === "cerebras" && futures.length > 0) {
      const response = await this.client.requestStructured<CriticResponse>({
        label: "critic",
        schemaName: "mine0_critic",
        schema: criticSchema,
        messages: [
          {
            role: "system",
            content: criticSystemPrompt(),
          },
          {
            role: "user",
            content: criticUserPrompt(worldState, memorySummary, futures),
          },
        ],
        maxOutputTokens: 600,
        temperature: 0.1,
      });

      criticMeta = [response.meta];
      if (response.data) {
        criticAssessments = new Map(
          response.data.branches.map((entry) => [entry.branchId, entry]),
        );
      }
    } else {
      criticMeta = [
        {
          label: "critic",
          provider: "mock",
          model: "mock",
          status: "skipped",
          latencyMs: 0,
          usage: null,
          timeInfo: null,
          warning: "Using deterministic critic scoring.",
        },
      ];
    }

    const scored = futures
      .map((future) => {
        const criticAssessment = criticAssessments.get(future.branchId);
        const normalizedTimeCost = Math.min(1, future.estimatedSeconds / 60);
        const normalizedResourceCost = Math.min(1, future.resourceCost / 4);
        const score =
          0.4 * future.goalProgress +
          0.3 * future.successProbability -
          0.15 * future.risk -
          0.1 * normalizedTimeCost -
          0.05 * normalizedResourceCost +
          memoryAdjustment +
          Math.max(-0.05, Math.min(0.05, criticAssessment?.adjustment ?? 0));

        return {
          future,
          score: Number(score.toFixed(4)),
          notes: [
            `goal_progress=${future.goalProgress.toFixed(2)}`,
            `success_probability=${future.successProbability.toFixed(2)}`,
            `risk=${future.risk.toFixed(2)}`,
            criticAssessment
              ? `memory_alignment=${criticAssessment.memoryAlignment.toFixed(2)}`
              : "memory_alignment=0.00",
            criticAssessment?.executionConcern ?? "execution_concern=none",
            criticAssessment?.rationale ?? "critic=deterministic_formula_only",
          ],
        };
      })
      .sort((left, right) => right.score - left.score);

    return { scored, meta: criticMeta };
  }
}
