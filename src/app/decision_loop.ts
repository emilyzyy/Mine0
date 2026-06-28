import {
  type PredictedFuture,
  type SubgoalIntent,
  parseSubgoalIntent,
  parseWorldState,
} from "../contracts/index.ts";
import { CriticService } from "../critic/critic_service.ts";
import type { DecisionTrace } from "../dashboard/dashboard_state.ts";
import { createExecutor, type ExecutorKind } from "../executor/index.ts";
import { MemoryService } from "../memory/memory_service.ts";
import { PerceptionService } from "../perception/perception_service.ts";
import { PlannerService } from "../planner/planner_service.ts";
import { RolloutService } from "../planner/rollout_service.ts";
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
  private readonly rollout = new RolloutService();
  private readonly critic = new CriticService();
  private readonly perception = new PerceptionService();
  private readonly verifier = new VerificationService();

  async runCycle(input: RunCycleInput): Promise<DecisionTrace> {
    const executor = createExecutor(input.executorKind);
    await executor.reset(input.objective);

    const observation = await executor.observe(input.objective);
    const perceived = this.perception.perceive(observation.worldState);
    const worldState = parseWorldState({
      ...observation.worldState,
      sceneSummary: perceived.sceneSummary,
    });
    const memoryResult = this.memory.retrieve(worldState);
    const plannerProposals = this.planner.plan(worldState, memoryResult.summary);
    const rolloutCandidates = this.rollout.rollout(worldState, plannerProposals);
    const selectedFutures =
      input.mode === "greedy" ? rolloutCandidates.slice(0, 1) : rolloutCandidates;
    const memoryAdjustment = memoryResult.entries.length > 0 ? -0.01 : 0;
    const scored = this.critic.score(selectedFutures, memoryAdjustment);
    const winner = scored[0];
    if (!winner) {
      throw new Error("No viable futures were produced by the planner.");
    }

    const selectedIntent = parseSubgoalIntent(this.toIntent(input.objective, winner.future));
    const actionOutcome = await executor.execute(selectedIntent, worldState);
    const verification = this.verifier.verify(winner.future, actionOutcome);
    const storedMemory = await this.memory.remember(
      worldState,
      winner.future,
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
      perception: perceived,
      memorySummary: memoryResult.summary,
      scoredFutures: scored,
      selectedIntent,
      actionOutcome,
      verification,
      storedMemory,
    };

    await appendJsonLine("runs.jsonl", trace);
    return trace;
  }

  private toIntent(objective: string, future: PredictedFuture): SubgoalIntent {
    return {
      objective,
      instruction: future.predictedSteps[0]?.action ?? future.strategy,
      candidateAction: future.candidateAction,
      successCondition: {
        item: String(future.candidateAction.arguments.block_type ?? future.candidateAction.arguments.item ?? "oak_log"),
        count: Number(future.candidateAction.arguments.count ?? 1),
      },
      maximumSteps: future.candidateAction.name === "collect" ? 400 : 180,
    };
  }
}
