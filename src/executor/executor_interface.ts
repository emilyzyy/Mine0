import type { ActionOutcome, SubgoalIntent, WorldState } from "../contracts/index.ts";

export type ExecutorKind = "jarvis" | "jarvis-persistent" | "mineflayer";

export interface ExecutorObservation {
  worldState: WorldState;
}

export interface ExecutorBackend {
  readonly kind: ExecutorKind;
  readonly displayName: string;
  beginObjective?(userObjective: string): Promise<void>;
  announceObjectiveResult?(result: {
    objective: string;
    completed: boolean;
    stopReason: string;
    failureReason: string | null;
  }): Promise<void>;
  observe(userObjective: string): Promise<ExecutorObservation>;
  execute(intent: SubgoalIntent, worldState: WorldState): Promise<ActionOutcome>;
  reset(userObjective: string): Promise<void>;
}
