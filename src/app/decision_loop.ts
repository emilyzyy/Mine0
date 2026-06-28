import {
  type PredictedFuture,
  type SubgoalIntent,
  parseSubgoalIntent,
  parseWorldState,
} from "../contracts/index.ts";
import type { DecisionTrace } from "../dashboard/dashboard_state.ts";
import { createExecutor, type ExecutorKind } from "../executor/index.ts";
import { MemoryService } from "../memory/memory_service.ts";
import { PerceptionService } from "../perception/perception_service.ts";
import { loadPlannerConfig } from "../shared/config.ts";
import { PlannerService, proposalToPredictedFuture } from "../planner/planner_service.ts";
import { makeId } from "../shared/ids.ts";
import { appendJsonLine, isoNow } from "../shared/logger.ts";
import { VerificationService } from "../verifier/verification_service.ts";

export type PlanningMode = "greedy" | "multiverse";

export interface RunCycleInput {
  objective: string;
  executorKind: ExecutorKind;
  mode: PlanningMode;
}

export class Mine0App {
  private readonly memory = new MemoryService();
  private readonly planner = new PlannerService();
  private readonly perception = new PerceptionService();
  private readonly verifier = new VerificationService();
  private readonly config = loadPlannerConfig();

  async runCycle(input: RunCycleInput): Promise<DecisionTrace> {
    const executor = createExecutor(input.executorKind);
    await executor.reset(input.objective);

    const observation = await executor.observe(input.objective);
    const perceptionStep = await this.perception.perceive(observation.worldState);
    const worldState = parseWorldState({
      ...observation.worldState,
      sceneSummary: perceptionStep.result.sceneSummary,
    });
    const memoryResult = await this.memory.retrieve(worldState);
    const planningStep = await this.planner.plan(
      worldState,
      memoryResult.summary,
      perceptionStep.result,
    );
    const plannedFuture = proposalToPredictedFuture(planningStep.proposal, worldState);
    const selectedIntent = parseSubgoalIntent(this.toIntent(input.objective, plannedFuture));
    const actionOutcome = await executor.execute(selectedIntent, worldState);
    const verification = this.verifier.verify(plannedFuture, actionOutcome);
    const storedMemory = await this.memory.remember(
      worldState,
      plannedFuture,
      actionOutcome,
      verification.predictionError,
    );

    const trace: DecisionTrace = {
      traceId: makeId("trace"),
      objective: input.objective,
      executor: executor.displayName,
      mode: input.mode,
      startedAt: isoNow(),
      worldState,
      perception: perceptionStep.result,
      memorySummary: memoryResult.summary,
      plannedFuture,
      selectedIntent,
      actionOutcome,
      verification,
      storedMemory,
      planner: {
        providerMode: this.config.provider,
        configuredModel: this.config.model,
        callLog: [
          perceptionStep.meta,
          ...planningStep.meta,
        ],
      },
    };

    await appendJsonLine("runs.jsonl", trace);
    return trace;
  }

  private toIntent(objective: string, future: PredictedFuture): SubgoalIntent {
    return {
      objective,
      instruction: describeInstruction(future),
      candidateAction: future.candidateAction,
      successCondition: {
        item: String(future.candidateAction.arguments.block_type ?? future.candidateAction.arguments.item ?? "oak_log"),
        count: Number(future.candidateAction.arguments.count ?? 1),
      },
      maximumSteps: future.candidateAction.name === "collect" ? 400 : 180,
    };
  }
}

function describeInstruction(future: PredictedFuture): string {
  const action = future.candidateAction;
  switch (action.name) {
    case "collect":
      return `Collect ${action.arguments.count ?? 1} ${action.arguments.block_type ?? "resource"}`;
    case "craft":
      return `Craft ${action.arguments.count ?? 1} ${action.arguments.item ?? "item"}`;
    case "equip":
      return `Equip ${action.arguments.item ?? "item"}`;
    case "scan":
      return `Scan ${action.arguments.direction ?? "forward"} for resources and hazards`;
    case "explore":
      return `Explore ${action.arguments.direction ?? "forward"} to improve position`;
    case "place":
      return `Place ${action.arguments.block_type ?? "block"} at ${action.arguments.location ?? "target location"}`;
    default:
      return future.predictedSteps[0]?.action ?? future.strategy;
  }
}
