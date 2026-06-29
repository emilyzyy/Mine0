import type { ActionOutcome, SubgoalIntent, WorldState } from "../contracts/index.ts";

export type ExecutorKind = "jarvis" | "jarvis-remote" | "mineflayer";

export interface ExecutorObservation {
  worldState: WorldState;
}

export interface ExecutorBackend {
  readonly kind: ExecutorKind;
  readonly displayName: string;
  observe(userObjective: string): Promise<ExecutorObservation>;
  execute(intent: SubgoalIntent, worldState: WorldState): Promise<ActionOutcome>;
  reset(userObjective: string): Promise<void>;
}
