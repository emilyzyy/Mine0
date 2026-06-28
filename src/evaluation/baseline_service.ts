import type { DecisionTrace } from "../dashboard/dashboard_state.ts";
import { Mine0App } from "../app/decision_loop.ts";
import type { ExecutorKind } from "../executor/index.ts";

export interface BaselineComparison {
  objective: string;
  executorKind: ExecutorKind;
  greedy: DecisionTrace;
  multiverse: DecisionTrace;
}

export class BaselineService {
  async compare(objective: string, executorKind: ExecutorKind): Promise<BaselineComparison> {
    const greedyApp = new Mine0App();
    const multiverseApp = new Mine0App();
    const greedy = await greedyApp.runCycle({
      objective,
      executorKind,
      mode: "greedy",
    });
    const multiverse = await multiverseApp.runCycle({
      objective,
      executorKind,
      mode: "multiverse",
    });

    return {
      objective,
      executorKind,
      greedy,
      multiverse,
    };
  }
}
