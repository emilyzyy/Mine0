import { readFile } from "node:fs/promises";
import type { ActionOutcome, MemoryEntry, PredictedFuture, WorldState } from "../contracts/index.ts";
import { parseMemoryEntry } from "../contracts/index.ts";
import { makeId } from "../shared/ids.ts";
import { appendJsonLine, isoNow } from "../shared/logger.ts";
import { ensureProjectDirectories, projectPath } from "../shared/fs.ts";

export interface MemoryQueryResult {
  entries: MemoryEntry[];
  summary: string[];
}

export class MemoryService {
  private readonly entries: MemoryEntry[] = [];
  private readonly seenIds = new Set<string>();
  private readonly logFile: string;

  // Resolves once the on-disk log has been loaded.  retrieve() and remember()
  // both await this internally, so callers never need to await it themselves.
  readonly ready: Promise<void>;

  constructor(logFile: string = "memory.jsonl") {
    this.logFile = logFile;
    this.ready = this.loadFromDisk();
  }

  private async loadFromDisk(): Promise<void> {
    await ensureProjectDirectories();
    let raw: string;
    try {
      raw = await readFile(projectPath("artifacts", "logs", this.logFile), "utf8");
    } catch {
      return;
    }

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      let entry: MemoryEntry;
      try {
        entry = parseMemoryEntry(parsed);
      } catch {
        continue;
      }

      if (this.seenIds.has(entry.id)) continue;
      this.seenIds.add(entry.id);
      this.entries.push(entry);
    }
  }

  async remember(
    worldState: WorldState,
    predictedFuture: PredictedFuture,
    actualOutcome: ActionOutcome,
    predictionError: number,
  ): Promise<MemoryEntry> {
    await this.ready;
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
    this.seenIds.add(entry.id);
    this.entries.push(entry);
    await appendJsonLine(this.logFile, entry);
    return entry;
  }

  async retrieve(worldState: WorldState): Promise<MemoryQueryResult> {
    await this.ready;
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
        entry.predictionError >= 0.5
          ? `degraded with prediction_error=${entry.predictionError.toFixed(2)}`
          : entry.actualOutcome.status === "success"
            ? "worked"
            : `degraded with ${entry.actualOutcome.status}`;
      return `${entry.actionType} previously ${verdict} in ${entry.predictedFuture.strategy}`;
    });

    return { entries, summary };
  }
}
