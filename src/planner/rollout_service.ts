import type { PredictedFuture, WorldState } from "../contracts/index.ts";
import { makeId } from "../shared/ids.ts";
import type { PlannerProposal } from "./planner_service.ts";

export class RolloutService {
  rollout(worldState: WorldState, proposals: PlannerProposal[]): PredictedFuture[] {
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
            expectedResult: "New screenshot and state should reflect the predicted change.",
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
}
