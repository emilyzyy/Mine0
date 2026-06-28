import type { CandidateAction, WorldState } from "../contracts/index.ts";
import type { PredictedFuture } from "../contracts/index.ts";
import type { PerceptionResult } from "../perception/perception_service.ts";
import { makeId } from "../shared/ids.ts";
import {
  CerebrasClient,
  type ProviderCallMeta,
} from "./cerebras_client.ts";
import {
  plannerSystemPrompt,
  plannerUserPrompt,
} from "./planner_prompts.ts";
import { plannerProposalSchema } from "./planner_schemas.ts";

export interface PlannerProposal {
  plannerId: string;
  strategy: string;
  instruction: string;
  candidateAction: CandidateAction;
  successCondition: {
    item: string;
    count: number;
  };
  maximumSteps: number;
}

interface PlannerProposalResponse {
  plannerId: string;
  strategy: string;
  instruction: string;
  actionName: string;
  blockType: string;
  item: string;
  count: number;
  direction: string;
  location: string;
  reason: string;
  successItem: string;
  successCount: number;
  maximumSteps: number;
}

function countItem(worldState: WorldState, item: string): number {
  return worldState.inventory.find((stack) => stack.item === item)?.count ?? 0;
}

function dedupeByAction(proposals: PlannerProposal[]): PlannerProposal[] {
  const seen = new Set<string>();
  return proposals.filter((proposal) => {
    const key = JSON.stringify({
      name: proposal.candidateAction.name,
      arguments: proposal.candidateAction.arguments,
    });
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export class PlannerService {
  private readonly client = new CerebrasClient();

  async plan(
    worldState: WorldState,
    memorySummary: string[],
    perception: PerceptionResult,
  ): Promise<{ proposal: PlannerProposal; meta: ProviderCallMeta[] }> {
    if (this.client.config.provider === "mock") {
      return {
        proposal: this.heuristicPlan(worldState, memorySummary)[0],
        meta: [
          {
            label: "planner",
            provider: "mock",
            model: "mock",
            status: "skipped",
            latencyMs: 0,
            usage: null,
            timeInfo: null,
            warning: "Using heuristic planner because CEREBRAS_API_KEY is not configured.",
          },
        ],
      };
    }
    const result = await this.client.requestStructured<PlannerProposalResponse>({
      label: "planner",
      schemaName: "mine0_planner",
      schema: plannerProposalSchema,
      messages: [
        {
          role: "system",
          content: plannerSystemPrompt(
            "choose one best bounded next action with no alternative branches",
          ),
        },
        {
          role: "user",
          content: plannerUserPrompt(worldState, perception, memorySummary),
        },
      ],
      maxOutputTokens: 900,
      temperature: 0.15,
    });

    const heuristic = this.heuristicPlan(worldState, memorySummary);
    const proposal = result.data ? this.fromStructured(result.data) : heuristic[0];

    return {
      proposal,
      meta: [result.meta],
    };
  }

  private heuristicPlan(worldState: WorldState, memorySummary: string[]): PlannerProposal[] {
    const objective = worldState.userObjective.toLowerCase();
    const logs = countItem(worldState, "oak_log");
    const planks = countItem(worldState, "oak_planks");
    const craftingTables = countItem(worldState, "crafting_table");
    const proposals: PlannerProposal[] = [];

    if (objective.includes("wood") || objective.includes("craft") || objective.includes("pickaxe")) {
      proposals.push({
        plannerId: "planner_alpha",
        strategy: "gather wood immediately",
        instruction: "Collect three oak logs",
        candidateAction: {
          name: "collect",
          arguments: { block_type: "oak_log", count: Math.max(3 - logs, 1) },
          reason: "Wood is the earliest blocking resource for tools and tables.",
        },
        successCondition: { item: "oak_log", count: 3 },
        maximumSteps: 400,
      });
    }

    if (logs + planks >= 2 && craftingTables < 1) {
      proposals.push({
        plannerId: "planner_beta",
        strategy: "convert wood into workstation now",
        instruction: "Craft a crafting table",
        candidateAction: {
          name: "craft",
          arguments: { item: "crafting_table", count: 1 },
          reason: "A crafting table unlocks the next objective tier.",
        },
        successCondition: { item: "crafting_table", count: 1 },
        maximumSteps: 180,
      });
    }

    proposals.push({
      plannerId: "planner_gamma",
      strategy: "improve visibility before committing",
      instruction: "Scan the nearby terrain for oak and stone",
      candidateAction: {
        name: "scan",
        arguments: { direction: "forward_left" },
        reason: "A quick scan reduces risk when the visible scene is ambiguous.",
      },
      successCondition: { item: "oak_log", count: Math.max(1, 3 - logs) },
      maximumSteps: 80,
    });

    proposals.push({
      plannerId: "planner_delta",
      strategy: "reposition to a safer, more reachable line",
      instruction: "Explore a short path toward the open grass corridor",
      candidateAction: {
        name: "explore",
        arguments: { direction: "forward" },
        reason: "Better positioning can reduce collection time and pathing failures.",
      },
      successCondition: { item: "oak_log", count: Math.max(1, 3 - logs) },
      maximumSteps: 140,
    });

    const deduped = dedupeByAction(proposals);

    if (memorySummary.some((entry) => entry.includes("collect") && entry.includes("degraded"))) {
      return deduped.sort((left, right) =>
        left.candidateAction.name === "scan" ? -1 : right.candidateAction.name === "scan" ? 1 : 0,
      );
    }

    return deduped;
  }

  private fromStructured(value: PlannerProposalResponse): PlannerProposal {
    return {
      plannerId: value.plannerId || makeId("planner"),
      strategy: value.strategy,
      instruction: value.instruction,
      candidateAction: {
        name: value.actionName,
        arguments: compactArguments({
          block_type: value.blockType,
          item: value.item,
          count: value.count,
          direction: value.direction,
          location: value.location,
        }),
        reason: value.reason,
      },
      successCondition: {
        item: value.successItem,
        count: value.successCount,
      },
      maximumSteps: Math.max(40, Math.round(value.maximumSteps)),
    };
  }
}

function compactArguments(input: Record<string, string | number>): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (typeof value === "number") {
        return value > 0;
      }

      return value !== "" && value !== "none";
    }),
  );
}

export function proposalToPredictedFuture(
  proposal: PlannerProposal,
  worldState: WorldState,
): PredictedFuture {
  const actionName = proposal.candidateAction.name;
  const successProbability =
    actionName === "craft" ? 0.9 : actionName === "scan" ? 0.82 : actionName === "explore" ? 0.76 : 0.88;
  const estimatedSeconds =
    actionName === "craft" ? 11 : actionName === "scan" ? 4 : actionName === "explore" ? 14 : 18;
  const risk =
    actionName === "scan" ? 0.04 : actionName === "explore" ? 0.09 : worldState.visibleHazards.length > 0 ? 0.12 : 0.06;
  const goalProgress =
    actionName === "craft" ? 0.6 : actionName === "collect" ? 0.22 : actionName === "scan" ? 0.08 : 0.12;

  return {
    branchId: makeId("plan"),
    strategy: proposal.strategy,
    candidateAction: proposal.candidateAction,
    preconditions:
      actionName === "craft"
        ? ["required resources available", "inventory has space"]
        : ["target is reachable", "step budget remains bounded"],
    predictedSteps: [
      {
        action: proposal.instruction,
        expectedResult: `Progress toward ${proposal.successCondition.item}.`,
      },
      {
        action: "verify outcome",
        expectedResult: "Inventory and scene should reflect the expected change.",
      },
    ],
    successProbability,
    estimatedSeconds,
    risk,
    resourceCost: actionName === "craft" ? 1 : 0,
    goalProgress,
    likelyNextObservation:
      actionName === "collect"
        ? "Inventory should gain the requested resource count or part of it."
        : actionName === "craft"
          ? "Crafted item should appear in inventory."
          : actionName === "scan"
            ? "Scene understanding should become more certain."
            : "Positioning should improve for the next action.",
  };
}
