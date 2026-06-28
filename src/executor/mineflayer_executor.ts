import type { ActionOutcome, SubgoalIntent, WorldState } from "../contracts/index.ts";
import { parseActionOutcome, parseWorldState } from "../contracts/index.ts";
import { MockMinecraftWorld } from "./mock_world.ts";
import type { ExecutorBackend, ExecutorObservation } from "./executor_interface.ts";

export class MineflayerExecutor implements ExecutorBackend {
  readonly kind = "mineflayer" as const;
  readonly displayName = "Mineflayer + prismarine-viewer (mock)";
  private readonly world = new MockMinecraftWorld("mineflayer");

  async observe(userObjective: string): Promise<ExecutorObservation> {
    const screenshotPath = await this.world.captureFrame();
    return {
      worldState: parseWorldState(this.world.snapshot(userObjective, null, screenshotPath)),
    };
  }

  async execute(intent: SubgoalIntent, _worldState: WorldState): Promise<ActionOutcome> {
    const applied = this.world.applyAction(intent.candidateAction);
    return parseActionOutcome({
      executedAction: intent.candidateAction,
      status: applied.status,
      durationSeconds: applied.durationSeconds,
      inventoryDelta: applied.inventoryDelta,
      healthDelta: applied.healthDelta,
      hungerDelta: applied.hungerDelta,
      positionDelta: applied.positionDelta,
      visualVerification: applied.visualVerification,
      failureReason: applied.failureReason,
      executor: this.kind,
    });
  }

  async reset(_userObjective: string): Promise<void> {
    this.world.reset();
  }
}
