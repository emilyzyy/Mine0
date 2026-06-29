import type { PredictedFuture, WorldState } from "../contracts/index.ts";
import type { PerceptionResult } from "../perception/perception_service.ts";
import { loadPlannerConfig } from "../shared/config.ts";
import { makeId } from "../shared/ids.ts";
import type { PlannerProposal } from "./planner_service.ts";
import {
  CerebrasClient,
  type ProviderCallMeta,
} from "./cerebras_client.ts";
import { rolloutSystemPrompt, rolloutUserPrompt } from "./planner_prompts.ts";
import { rolloutSchema } from "./planner_schemas.ts";

interface RolloutFutureResponse {
  strategy: string;
  actionName: string;
  blockType: string;
  item: string;
  count: number;
  direction: string;
  location: string;
  reason: string;
  preconditions: string[];
  predictedStep1Action: string;
  predictedStep1Result: string;
  predictedStep2Action: string;
  predictedStep2Result: string;
  successProbability: number;
  estimatedSeconds: number;
  risk: number;
  resourceCost: number;
  goalProgress: number;
  likelyNextObservation: string;
}

interface RolloutResponse {
  futures: RolloutFutureResponse[];
}

export class RolloutService {
  private readonly client = new CerebrasClient();
  private readonly config = loadPlannerConfig();

  async rollout(
    worldState: WorldState,
    proposals: PlannerProposal[],
    perception: PerceptionResult,
  ): Promise<{ futures: PredictedFuture[]; meta: ProviderCallMeta[] }> {
    if (this.config.provider === "mock") {
      return {
        futures: this.heuristicRollout(worldState, proposals),
        meta: [
          {
            label: "rollout",
            provider: "mock",
            model: "mock",
            status: "skipped",
            latencyMs: 0,
            usage: null,
            timeInfo: null,
            warning: "Using heuristic rollouts because CEREBRAS_API_KEY is not configured.",
          },
        ],
      };
    }

    const variantPlan = proposals.map((_, index) => (index < 2 ? 2 : 1));
    const liveCalls = await Promise.all(
      proposals.map((proposal, index) =>
        this.client.requestStructured<RolloutResponse>({
          label: `rollout_${index + 1}`,
          schemaName: `mine0_rollout_${index + 1}`,
          schema: rolloutSchema,
          messages: [
            {
              role: "system",
              content: rolloutSystemPrompt(variantPlan[index] ?? 1),
            },
            {
              role: "user",
              content: rolloutUserPrompt(
                worldState,
                perception,
                proposal,
                variantPlan[index] ?? 1,
              ),
            },
          ],
          maxOutputTokens: 700,
          temperature: 0.25,
        }),
      ),
    );

    const liveFutures = liveCalls.flatMap((call, index) => {
      const proposal = proposals[index];
      if (!call.data || !proposal) {
        return [];
      }

      return call.data.futures.map((future) => this.fromStructured(proposal, future));
    });

    const heuristicFutures = this.heuristicRollout(worldState, proposals);
    const futures = padFutures(
      liveFutures.length > 0 ? liveFutures : heuristicFutures,
      heuristicFutures,
      this.config.rolloutTarget,
    );

    return {
      futures,
      meta: liveCalls.map((call) => call.meta),
    };
  }

  private heuristicRollout(worldState: WorldState, proposals: PlannerProposal[]): PredictedFuture[] {
    return proposals.map((proposal, index) => {
      const baseSuccess = proposal.candidateAction.name === "scan"
        ? 0.72
        : proposal.candidateAction.name === "explore"
          ? 0.68
          : proposal.candidateAction.name === "craft"
            ? 0.9
            : 0.83;

      const hazardPenalty = worldState.visibleHazards.length * 0.05;
      const successProbability = Math.max(0.1, Math.min(0.98, baseSuccess - hazardPenalty));
      const risk = Math.max(0.03, 0.22 - successProbability / 5 + index * 0.015);
      const estimatedSeconds = proposal.candidateAction.name === "craft"
        ? 11
        : proposal.candidateAction.name === "collect"
          ? 22 + index * 2
          : proposal.candidateAction.name === "explore"
            ? 16
            : 8;
      const goalProgress = proposal.candidateAction.name === "craft"
        ? 0.62
        : proposal.candidateAction.name === "collect"
          ? 0.35
          : proposal.candidateAction.name === "explore"
            ? 0.18
            : 0.12;

      return {
        branchId: makeId("branch"),
        strategy: proposal.strategy,
        candidateAction: proposal.candidateAction,
        preconditions:
          proposal.candidateAction.name === "craft"
            ? ["sufficient wood resources", "inventory space available"]
            : ["oak tree or traversal route visible", "bounded step budget available"],
        predictedSteps: [
          {
            action: proposal.instruction,
            expectedResult: `Progress toward ${proposal.successCondition.item}.`,
          },
          {
            action: "verify resulting observation",
            expectedResult: "New state should reflect the predicted change.",
          },
        ],
        successProbability,
        estimatedSeconds,
        risk,
        resourceCost: proposal.candidateAction.name === "craft" ? 1 : 0,
        goalProgress,
        likelyNextObservation:
          proposal.candidateAction.name === "collect"
            ? "Inventory shows more oak logs and camera faces the tree line."
            : proposal.candidateAction.name === "craft"
              ? "Crafting table appears in inventory and is ready to place."
              : proposal.candidateAction.name === "explore"
                ? "Open path and resource line are easier to approach."
                : "More reliable resource visibility is available for the next planning step.",
      };
    });
  }

  private fromStructured(
    proposal: PlannerProposal,
    value: RolloutFutureResponse,
  ): PredictedFuture {
    return {
      branchId: makeId("branch"),
      strategy: value.strategy || proposal.strategy,
      candidateAction: {
        name: value.actionName || proposal.candidateAction.name,
        arguments: Object.fromEntries(
          Object.entries({
            block_type: value.blockType,
            item: value.item,
            count: value.count,
            direction: value.direction,
            location: value.location,
          }).filter(([, entry]) => {
            if (typeof entry === "number") {
              return entry > 0;
            }

            return entry !== "" && entry !== "none";
          }),
        ),
        reason: value.reason || proposal.candidateAction.reason,
      },
      preconditions: value.preconditions,
      predictedSteps: [
        {
          action: value.predictedStep1Action,
          expectedResult: value.predictedStep1Result,
        },
        {
          action: value.predictedStep2Action,
          expectedResult: value.predictedStep2Result,
        },
      ],
      successProbability: clamp01(value.successProbability),
      estimatedSeconds: Math.max(1, Math.round(value.estimatedSeconds)),
      risk: clamp01(value.risk),
      resourceCost: Math.max(0, value.resourceCost),
      goalProgress: clamp01(value.goalProgress),
      likelyNextObservation: value.likelyNextObservation,
    };
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function padFutures(
  live: PredictedFuture[],
  heuristic: PredictedFuture[],
  targetCount: number,
): PredictedFuture[] {
  const futures = [...live];
  const seen = new Set(futures.map((future) => JSON.stringify(future.candidateAction)));

  for (const future of heuristic) {
    const key = JSON.stringify(future.candidateAction);
    if (seen.has(key)) {
      continue;
    }
    futures.push(future);
    seen.add(key);
    if (futures.length >= targetCount) {
      break;
    }
  }

  return futures.slice(0, targetCount);
}
