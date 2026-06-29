import type {
  ActionOutcome,
  CandidateAction,
  MemoryEntry,
  PredictedFuture,
  SubgoalIntent,
  WorldState,
} from "../contracts/index.ts";
import type { ProviderCallMeta } from "../planner/cerebras_client.ts";
import type { TaskPlanningContext } from "../planner/task_stack_service.ts";
import type { VerificationResult } from "../verifier/verification_service.ts";

export interface DecisionStepTrace {
  stepNumber: number;
  taskContext: TaskPlanningContext;
  worldState: WorldState;
  perception: {
    sceneSummary: string;
    visibleResources: string[];
    terrainAffordances: string[];
    hazards: string[];
    reachableTargets: string[];
    confidenceNotes: string[];
  };
  memorySummary: string[];
  plannedFuture: PredictedFuture;
  selectedIntent: SubgoalIntent;
  actionOutcome: ActionOutcome;
  verification: VerificationResult;
  storedMemory: MemoryEntry;
  planner: {
    callLog: ProviderCallMeta[];
    proposals: Array<{
      plannerId: string;
      strategy: string;
      instruction: string;
      candidateAction: CandidateAction;
    }>;
    scoredBranches: Array<{
      branchId: string;
      strategy: string;
      candidateAction: CandidateAction;
      score: number;
      successProbability: number;
      estimatedSeconds: number;
      risk: number;
      goalProgress: number;
      notes: string[];
    }>;
    selectedBranchId: string;
  };
}

export interface DecisionTrace {
  traceId: string;
  objective: string;
  executor: string;
  mode: "greedy" | "multiverse";
  startedAt: string;
  completedObjective: boolean;
  stopReason: string;
  totalDecisions: number;
  steps: DecisionStepTrace[];
  worldState: WorldState;
  perception: {
    sceneSummary: string;
    visibleResources: string[];
    terrainAffordances: string[];
    hazards: string[];
    reachableTargets: string[];
    confidenceNotes: string[];
  };
  memorySummary: string[];
  plannedFuture: PredictedFuture;
  selectedIntent: SubgoalIntent;
  actionOutcome: ActionOutcome;
  verification: VerificationResult;
  storedMemory: MemoryEntry;
  planner: {
    providerMode: "mock" | "cerebras";
    configuredModel: string;
    callLog: ProviderCallMeta[];
    proposals: Array<{
      plannerId: string;
      strategy: string;
      instruction: string;
      candidateAction: CandidateAction;
    }>;
    scoredBranches: Array<{
      branchId: string;
      strategy: string;
      candidateAction: CandidateAction;
      score: number;
      successProbability: number;
      estimatedSeconds: number;
      risk: number;
      goalProgress: number;
      notes: string[];
    }>;
    selectedBranchId: string;
  };
}
