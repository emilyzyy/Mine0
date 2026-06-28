import type { MemoryEntry, PredictedFuture, WorldState, ActionOutcome } from "../contracts/index.ts";
import { makeId } from "../shared/ids.ts";
import { appendJsonLine, isoNow } from "../shared/logger.ts";

export interface MemoryQueryResult {
  entries: MemoryEntry[];
  summary: string[];
}

export class MemoryService {
  private readonly entries: MemoryEntry[] = [];

  async remember(
    worldState: WorldState,
    predictedFuture: PredictedFuture,
    actualOutcome: ActionOutcome,
    predictionError: number,
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: makeId("memory"),
      objective: worldState.userObjective,
      actionType: predictedFuture.candidateAction.name,
      environmentTags: [worldState.biomeOrRegionHint, worldState.timeOfDay],
      failureType: actualOutcome.failureReason,
      hazardContext: [...worldState.visibleHazards],
      resourceContext: [...worldState.perceivedResources],
      predictionError,
      predictedFuture,
      actualOutcome,
      createdAt: isoNow(),
    };
    this.entries.push(entry);
    await appendJsonLine("memory.jsonl", entry);
    return entry;
  }

  retrieve(worldState: WorldState): MemoryQueryResult {
    const objectiveTerms = worldState.userObjective.toLowerCase().split(/\s+/).filter(Boolean);
    const entries = this.entries
      .filter((entry) => {
        const objective = entry.objective.toLowerCase();
        return objectiveTerms.some((term) => objective.includes(term));
      })
      .slice(-5)
      .reverse();

    const summary = entries.map((entry) => {
      const verdict =
        entry.actualOutcome.status === "success"
          ? "worked"
          : `degraded with ${entry.actualOutcome.status}`;
      return `${entry.actionType} previously ${verdict} in ${entry.predictedFuture.strategy}`;
    });

    return { entries, summary };
  }
}
