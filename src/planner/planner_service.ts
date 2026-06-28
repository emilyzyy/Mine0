import type { CandidateAction, WorldState } from "../contracts/index.ts";

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
  plan(worldState: WorldState, memorySummary: string[]): PlannerProposal[] {
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
}
