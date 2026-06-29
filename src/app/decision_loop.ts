import {
  type InventoryStack,
  type PredictedFuture,
  type SubgoalIntent,
  parseSubgoalIntent,
  parseWorldState,
} from "../contracts/index.ts";
import type { DecisionStepTrace, DecisionTrace } from "../dashboard/dashboard_state.ts";
import { createExecutor, type ExecutorKind } from "../executor/index.ts";
import { MemoryService } from "../memory/memory_service.ts";
import { PerceptionService } from "../perception/perception_service.ts";
import { loadPlannerConfig } from "../shared/config.ts";
import { PlannerService, proposalToPredictedFuture } from "../planner/planner_service.ts";
import { TaskDecompositionService } from "../planner/task_decomposition_service.ts";
import { TaskStackService, type TaskPlanningContext } from "../planner/task_stack_service.ts";
import { makeId } from "../shared/ids.ts";
import { appendJsonLine, isoNow } from "../shared/logger.ts";
import { VerificationService } from "../verifier/verification_service.ts";
import type { ProviderCallMeta } from "../planner/cerebras_client.ts";
import { overrideCombatSubtaskIntent } from "../executor/jarvis_instruction.ts";

export type PlanningMode = "greedy" | "multiverse";

export interface RunCycleInput {
  objective: string;
  executorKind: ExecutorKind;
  mode: PlanningMode;
  signal?: AbortSignal;
  // Bypasses the floor in loadPlannerConfig() — intended for JARVIS persistent
  // demos where each step costs ~60-90 s of real Minecraft time.
  maxDecisionSteps?: number;
}

export interface RunCycleHooks {
  onStep?: (step: DecisionStepTrace) => void | Promise<void>;
}

export class Mine0App {
  private readonly memory = new MemoryService();
  private readonly planner = new PlannerService();
  private readonly taskDecomposition = new TaskDecompositionService();
  private readonly taskStack = new TaskStackService();
  private readonly perception = new PerceptionService();
  private readonly verifier = new VerificationService();
  private readonly config = loadPlannerConfig();

  async runCycle(input: RunCycleInput, hooks: RunCycleHooks = {}): Promise<DecisionTrace> {
    const abortIfRequested = () => {
      if (input.signal?.aborted) {
        throw new Error("Run cancelled by user.");
      }
    };

    const executor = createExecutor(input.executorKind);
    await executor.beginObjective?.(input.objective);
    if (!executor.beginObjective) {
      await executor.reset(input.objective);
    }
    const traceId = makeId("trace");
    const startedAt = isoNow();
    const steps: DecisionStepTrace[] = [];
    let stopReason = "running";
    let completedObjective = false;
    let placedCraftingTable = false;
    let placedDoor = false;
    let placedDoorCount = 0;
    let repeatedFailureCount = 0;
    let previousFailureSignature: string | null = null;
    let stalledStepCount = 0;
    const breakdownMemo = new Set<string>();
    let latestObservation = await executor.observe(input.objective);
    let latestWorldState = parseWorldState(latestObservation.worldState);

    const decomposition = await this.taskDecomposition.decomposeObjective(
      input.objective,
      latestWorldState,
      [],
      input.executorKind,
    );
    this.taskStack.reset(input.objective, latestWorldState, {
      llmSubtasks: decomposition.subtasks?.length ? decomposition.subtasks : undefined,
    });
    await this.expandActiveSubtaskIfNeeded(
      input.objective,
      input.executorKind,
      latestWorldState,
      [],
      [],
      breakdownMemo,
    );

    if (this.isObjectiveComplete(input.objective, latestWorldState.inventory, placedCraftingTable, placedDoor, placedDoorCount)) {
      completedObjective = true;
      stopReason = "objective_already_satisfied";
    }

    const effectiveMaxSteps = input.maxDecisionSteps ?? this.config.maxDecisionSteps;

    for (let stepNumber = 1; stepNumber <= effectiveMaxSteps && !completedObjective; stepNumber += 1) {
      if (input.signal?.aborted) {
        stopReason = "user_cancelled";
        break;
      }
      const recentHistorySummary = buildRecentHistorySummary(steps);
      const perceptionStep = await this.perception.perceive(latestWorldState, input.executorKind);
      abortIfRequested();
      const worldState = parseWorldState({
        ...latestWorldState,
        sceneSummary: perceptionStep.result.sceneSummary,
      });
      this.taskStack.reconcile(worldState);
      const memoryResult = await this.memory.retrieve(worldState, recentHistorySummary);
      await this.expandActiveSubtaskIfNeeded(
        input.objective,
        input.executorKind,
        worldState,
        memoryResult.summary,
        recentHistorySummary,
        breakdownMemo,
      );
      this.taskStack.reconcile(worldState);
      const taskContext = this.taskStack.getContext();
      const proposalStep = await this.planner.proposeCandidates(
        worldState,
        memoryResult.summary,
        perceptionStep.result,
        recentHistorySummary,
        taskContext,
        input.executorKind,
      );
      abortIfRequested();
      const selectedPlan = this.selectPlan(worldState, proposalStep.proposals);
      const plannedFuture = selectedPlan.future;
      let selectedIntent = parseSubgoalIntent(this.toIntent(input.objective, plannedFuture));
      // For jarvis-persistent combat subtasks, replace abstract LLM instruction
      // and oak_log successCondition with subtask-specific values.
      if (input.executorKind === "jarvis-persistent") {
        selectedIntent = overrideCombatSubtaskIntent(
          selectedIntent,
          taskContext.activeSubtask?.id ?? null,
          input.objective,
        );
      }
      const actionOutcome = await executor.execute(selectedIntent, worldState);
      abortIfRequested();
      const verification = this.verifier.verify(plannedFuture, actionOutcome);
      const storedMemory = await this.memory.remember(
        worldState,
        plannedFuture,
        actionOutcome,
        verification,
      );

      steps.push({
        stepNumber,
        taskContext,
        worldState,
        perception: perceptionStep.result,
        memorySummary: memoryResult.summary,
        plannedFuture,
        selectedIntent,
        actionOutcome,
        verification,
        storedMemory,
        planner: {
          callLog: [
            perceptionStep.meta,
            ...proposalStep.meta,
          ],
          proposals: proposalStep.proposals.map((proposal) => ({
            plannerId: proposal.plannerId,
            strategy: proposal.strategy,
            instruction: proposal.instruction,
            candidateAction: proposal.candidateAction,
          })),
          scoredBranches: selectedPlan.scoredBranches,
          selectedBranchId: selectedPlan.future.branchId,
        },
      });
      await hooks.onStep?.(steps[steps.length - 1] as DecisionStepTrace);

        if (
          actionOutcome.status === "success" &&
          selectedIntent.candidateAction.name === "place" &&
          String(selectedIntent.candidateAction.arguments.block_type ?? "") === "crafting_table"
        ) {
          placedCraftingTable = true;
        }

        if (
          actionOutcome.status === "success" &&
          selectedIntent.candidateAction.name === "place" &&
          /door/.test(String(selectedIntent.candidateAction.arguments.block_type ?? ""))
        ) {
          placedDoor = true;
          placedDoorCount += 1;
        }

        latestObservation = await executor.observe(input.objective);
        latestWorldState = parseWorldState(latestObservation.worldState);
        abortIfRequested();

        let llmRefined = false;
        if (actionOutcome.status === "failed") {
          const taskContext = this.taskStack.getContext();
          const refinementMemoKey = makeBreakdownMemoKey(
            "failure",
            taskContext,
            latestWorldState,
            actionOutcome.failureReason ?? "unknown failure",
          );
          if (!breakdownMemo.has(refinementMemoKey)) {
            const refinement = await this.taskDecomposition.refineOnFailure(
              input.objective,
              taskContext,
              actionOutcome.failureReason ?? "unknown failure",
              latestWorldState,
              selectedIntent,
              input.executorKind,
              recentHistorySummary,
            );
            if (refinement.subtasks.length > 0) {
              breakdownMemo.add(refinementMemoKey);
              this.taskStack.prependSubtasks(refinement.subtasks);
              this.taskStack.reconcile(latestWorldState);
              llmRefined = true;
            }
          }
        }

        this.taskStack.onStepComplete(
          selectedIntent,
          actionOutcome,
          latestWorldState,
          verification,
          { skipFailureHeuristics: llmRefined },
        );
        const failureSignature = makeFailureSignature(selectedIntent, actionOutcome);
        if (failureSignature && failureSignature === previousFailureSignature) {
          repeatedFailureCount += 1;
        } else if (failureSignature) {
          repeatedFailureCount = 1;
        } else {
          repeatedFailureCount = 0;
        }
        previousFailureSignature = failureSignature;

        stalledStepCount = isMeaningfulProgress(worldState, latestWorldState, actionOutcome)
          ? 0
          : stalledStepCount + 1;
        completedObjective =
          this.isObjectiveComplete(
            input.objective,
            latestWorldState.inventory,
            placedCraftingTable,
            placedDoor,
            placedDoorCount,
          ) || this.taskStack.isRootComplete(
            input.objective,
            latestWorldState.inventory,
            placedDoorCount,
            placedCraftingTable,
          );
        if (completedObjective) {
          stopReason = "objective_completed";
        } else if (repeatedFailureCount >= this.config.maxRepeatedActionFailures) {
          stopReason = `stuck_repeated_action_failure=${repeatedFailureCount}`;
          break;
        } else if (stalledStepCount >= this.config.maxStalledSteps) {
          stopReason = `stuck_no_meaningful_progress=${stalledStepCount}`;
          break;
        } else if (stepNumber === effectiveMaxSteps) {
          stopReason = `safety_step_limit_reached=${effectiveMaxSteps}`;
        }
    }

    const finalStep = steps.at(-1);
    if (!finalStep) {
      throw new Error(stopReason === "user_cancelled" ? "Run cancelled by user." : "No decision steps were executed.");
    }

    const trace: DecisionTrace = {
      traceId,
      objective: input.objective,
      executor: executor.displayName,
      mode: input.mode,
      startedAt,
      completedObjective,
      stopReason,
      totalDecisions: steps.length,
      steps,
      worldState: finalStep.worldState,
      perception: finalStep.perception,
      memorySummary: finalStep.memorySummary,
      plannedFuture: finalStep.plannedFuture,
      selectedIntent: finalStep.selectedIntent,
      actionOutcome: finalStep.actionOutcome,
      verification: finalStep.verification,
      storedMemory: finalStep.storedMemory,
      planner: {
        providerMode: this.config.provider,
        configuredModel: this.config.model,
        callLog: finalStep.planner.callLog,
        proposals: finalStep.planner.proposals,
        scoredBranches: finalStep.planner.scoredBranches,
        selectedBranchId: finalStep.planner.selectedBranchId,
      },
    };

    await executor.announceObjectiveResult?.({
      objective: input.objective,
      completed: completedObjective,
      stopReason,
      failureReason: summarizeRunFailure(trace),
    });
    await appendJsonLine("runs.jsonl", trace);
    return trace;
  }

  private async expandActiveSubtaskIfNeeded(
    objective: string,
    executorKind: ExecutorKind,
    worldState: ReturnType<typeof parseWorldState>,
    memorySummary: string[],
    recentHistorySummary: string[],
    breakdownMemo: Set<string>,
  ): Promise<void> {
    for (let depth = 0; depth < 3; depth += 1) {
      if (!this.taskStack.activeSubtaskNeedsExpansion()) {
        return;
      }

      const taskContext = this.taskStack.getContext();
      const memoKey = makeBreakdownMemoKey("decompose", taskContext, worldState);
      if (breakdownMemo.has(memoKey)) {
        return;
      }

      const decomposition = await this.taskDecomposition.decomposeActiveSubtask(
        objective,
        taskContext,
        worldState,
        memorySummary,
        recentHistorySummary,
        executorKind,
      );
      breakdownMemo.add(memoKey);
      if (decomposition.subtasks.length === 0) {
        return;
      }

      this.taskStack.replaceActiveSubtask(decomposition.subtasks);
      this.taskStack.reconcile(worldState);
    }
  }

  private isObjectiveComplete(
    objective: string,
    inventory: InventoryStack[],
    placedCraftingTable: boolean,
    placedDoor: boolean,
    placedDoorCount: number,
  ): boolean {
    const normalized = objective.toLowerCase();
    const count = (names: string[]) =>
      inventory
        .filter((stack) => names.includes(stack.item))
        .reduce((sum, stack) => sum + stack.count, 0);

    if (normalized.includes("door") && normalized.includes("around")) {
      return placedDoorCount >= Math.min(4, placedDoorCount + count(["wooden_door", "door"]));
    }

    if (normalized.includes("door") && (normalized.includes("place") || normalized.includes("put down"))) {
      return placedDoor;
    }

    if (normalized.includes("door")) {
      return count(["wooden_door", "door"]) >= 1;
    }

    if (normalized.includes("crafting table") && (normalized.includes("place") || normalized.includes("put down"))) {
      return placedCraftingTable;
    }

    if (normalized.includes("crafting table")) {
      return count(["crafting_table"]) >= 1;
    }

    if (normalized.includes("iron pickaxe") || (normalized.includes("iron") && normalized.includes("pickaxe"))) {
      return count(["iron_pickaxe"]) >= 1;
    }

    if (normalized.includes("wooden pickaxe")) {
      return count(["wooden_pickaxe"]) >= 1;
    }

    if (normalized.includes("stone pickaxe")) {
      return count(["stone_pickaxe"]) >= 1;
    }

    if (normalized.includes("pickaxe")) {
      return count(["wooden_pickaxe", "stone_pickaxe", "iron_pickaxe", "diamond_pickaxe"]) >= 1;
    }

    if (normalized.includes("gather wood") || normalized.includes("collect wood")) {
      return count(["oak_log", "birch_log", "spruce_log", "jungle_log", "acacia_log", "dark_oak_log", "log"]) >= 3;
    }

    return false;
  }

  private toIntent(objective: string, future: PredictedFuture): SubgoalIntent {
    return {
      objective,
      // Use describeInstruction() so that single-token abstract LLM outputs like
      // "visual_detection" are replaced with an action-derived sentence instead.
      instruction: describeInstruction(future),
      candidateAction: future.candidateAction,
      successCondition: {
        // Prefer the concrete block/item from the candidate action arguments.
        // Fall back to "task_progress" (not "oak_log" and not "") so the schema
        // never sees an empty string; overrideCombatSubtaskIntent sets the correct
        // value for combat subtasks after parseSubgoalIntent runs.
        item: String(future.candidateAction.arguments.block_type ?? future.candidateAction.arguments.item ?? "task_progress"),
        count: Number(future.candidateAction.arguments.count ?? 1),
      },
      maximumSteps: future.candidateAction.name === "collect" ? 400 : 180,
    };
  }

  private selectPlan(
    worldState: ReturnType<typeof parseWorldState>,
    proposals: Awaited<ReturnType<PlannerService["proposeCandidates"]>>["proposals"],
  ): {
    future: PredictedFuture;
    scoredBranches: DecisionTrace["planner"]["scoredBranches"];
  } {
    const fallbackProposal = proposals[0];
    if (!fallbackProposal) {
      const future = proposalToPredictedFuture(
        {
          plannerId: "planner_fallback",
          strategy: "scan to recover from missing planner output",
          instruction: "Scan forward for resources and hazards",
          candidateAction: {
            name: "scan",
            arguments: { direction: "forward" },
            reason: "The planner did not yield a proposal, so recover with a safe scan.",
          },
          successCondition: { item: "oak_log", count: 1 },
          maximumSteps: 80,
        },
        worldState,
      );

      return {
        future,
        scoredBranches: [
          {
            branchId: future.branchId,
            strategy: future.strategy,
            candidateAction: future.candidateAction,
            score: 0,
            successProbability: future.successProbability,
            estimatedSeconds: future.estimatedSeconds,
            risk: future.risk,
            goalProgress: future.goalProgress,
            notes: ["planner_missing=true"],
          },
        ],
      };
    }

    const future = proposalToPredictedFuture(fallbackProposal, worldState);

    return {
      future,
      scoredBranches: [
        {
          branchId: future.branchId,
          strategy: future.strategy,
          candidateAction: future.candidateAction,
          score: 0,
          successProbability: future.successProbability,
          estimatedSeconds: future.estimatedSeconds,
          risk: future.risk,
          goalProgress: future.goalProgress,
          notes: ["single_decision_mode=true", "selected_first_proposal=true"],
        },
      ],
    };
  }
}

function makeBreakdownMemoKey(
  kind: "decompose" | "failure",
  taskContext: TaskPlanningContext,
  worldState: ReturnType<typeof parseWorldState>,
  failureReason = "",
): string {
  const active = taskContext.activeSubtask;
  return JSON.stringify({
    kind,
    activeId: active?.id ?? "none",
    focus: active?.planningFocus ?? "",
    expectedAction: active?.expectedAction ?? "",
    targetItem: active?.targetItem ?? "",
    targetCount: active?.targetCount ?? 1,
    failureReason,
    inventory: worldState.inventory
      .slice()
      .sort((left, right) => left.item.localeCompare(right.item))
      .map((stack) => `${stack.item}:${stack.count}`),
    hints: worldState.interactionHints.slice(0, 12),
    resources: worldState.perceivedResources.slice(0, 8),
    blocks: worldState.nearbyBlocks.slice(0, 8),
    sight: worldState.lineOfSightTarget ?? "",
  });
}

function summarizeRunFailure(trace: DecisionTrace): string | null {
  if (trace.completedObjective) {
    return null;
  }

  return trace.actionOutcome.failureReason ?? trace.stopReason;
}

function makeFailureSignature(intent: SubgoalIntent, actionOutcome: DecisionStepTrace["actionOutcome"]): string | null {
  if (actionOutcome.status !== "failed") {
    return null;
  }

  return JSON.stringify({
    action: intent.candidateAction.name,
    arguments: intent.candidateAction.arguments,
    failureReason: actionOutcome.failureReason ?? "unknown_failure",
  });
}

function isMeaningfulProgress(
  previousWorldState: ReturnType<typeof parseWorldState>,
  nextWorldState: ReturnType<typeof parseWorldState>,
  actionOutcome: DecisionStepTrace["actionOutcome"],
): boolean {
  if (actionOutcome.status === "partial_success" || actionOutcome.status === "success") {
    if (actionOutcome.inventoryDelta.some((entry) => entry.countChange !== 0)) {
      return true;
    }

    const movementMagnitude =
      Math.abs(actionOutcome.positionDelta.x) +
      Math.abs(actionOutcome.positionDelta.y) +
      Math.abs(actionOutcome.positionDelta.z);
    if (movementMagnitude >= 1) {
      return true;
    }

    if (actionOutcome.executedAction.name === "place" || actionOutcome.executedAction.name === "craft") {
      return true;
    }
  }

  return nextWorldState.goalProgress > previousWorldState.goalProgress + 0.05;
}

function describeInstruction(future: PredictedFuture): string {
  const planned = future.predictedSteps[0]?.action;
  // Only use the LLM step text if it is a multi-word phrase; single-token outputs
  // like "visual_detection" are too abstract to send to JARVIS as instructions.
  if (planned && /\s/.test(planned)) {
    return planned;
  }

  const action = future.candidateAction;
  switch (action.name) {
    case "collect":
      return `Collect ${action.arguments.count ?? 1} ${action.arguments.block_type ?? "resource"}`;
    case "craft":
      return `Craft ${action.arguments.count ?? 1} ${action.arguments.item ?? "item"}`;
    case "smelt":
      return `Smelt ${action.arguments.count ?? 1} ${action.arguments.input_item ?? "input"} into ${action.arguments.item ?? "output"}`;
    case "equip":
      return `Equip ${action.arguments.item ?? "item"}`;
    case "scan":
      return `Scan ${action.arguments.direction ?? "forward"} for resources and hazards`;
    case "explore":
      return `Explore ${action.arguments.direction ?? "forward"}`;
    case "place":
      return `Place ${action.arguments.block_type ?? "block"} at ${action.arguments.location ?? "target location"}`;
    default:
      return future.strategy;
  }
}

function buildRecentHistorySummary(steps: DecisionStepTrace[]): string[] {
  return steps.slice(-4).map((step) => {
    const outcome = step.actionOutcome.failureReason
      ? `${step.actionOutcome.status} (${step.actionOutcome.failureReason.slice(0, 180)})`
      : step.actionOutcome.status;
    const inventoryDelta = step.actionOutcome.inventoryDelta.length > 0
      ? step.actionOutcome.inventoryDelta.map((entry) => `${entry.item}:${entry.countChange >= 0 ? "+" : ""}${entry.countChange}`).join(", ")
      : "no inventory change";
    const positionDelta = `dx=${step.actionOutcome.positionDelta.x}, dy=${step.actionOutcome.positionDelta.y}, dz=${step.actionOutcome.positionDelta.z}`;
    const position = `x=${step.worldState.position.x}, y=${step.worldState.position.y}, z=${step.worldState.position.z}`;
    const actionArgs = JSON.stringify(step.selectedIntent.candidateAction.arguments);
    return [
      `step ${step.stepNumber}`,
      `action=${step.selectedIntent.candidateAction.name}`,
      `arguments=${actionArgs}`,
      `outcome=${outcome}`,
      `position=${position}`,
      `inventory=${inventoryDelta}`,
      `movement=${positionDelta}`,
    ].join(" | ");
  });
}
