import type {
  ActionOutcome,
  MemoryEntry,
  PredictedFuture,
  SubgoalIntent,
  WorldState,
} from "../contracts/index.ts";
import type { ScoredFuture } from "../critic/critic_service.ts";
import type { VerificationResult } from "../verifier/verification_service.ts";

export interface DecisionTrace {
  traceId: string;
  objective: string;
  executor: string;
  mode: "greedy" | "multiverse";
  startedAt: string;
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
  scoredFutures: ScoredFuture[];
  selectedIntent: SubgoalIntent;
  actionOutcome: ActionOutcome;
  verification: VerificationResult;
  storedMemory: MemoryEntry;
}
