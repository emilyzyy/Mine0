import { readFile } from "node:fs/promises";
import type { ActionOutcome, MemoryEntry, PredictedFuture, WorldState } from "../contracts/index.ts";
import type { VerificationResult } from "../verifier/verification_service.ts";
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
    verification: VerificationResult,
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
      issueTags: [...verification.issueTags],
      suggestedFixes: [...verification.suggestedFixes],
      predictionError: verification.predictionError,
      predictedFuture,
      actualOutcome,
      createdAt: isoNow(),
    };
    this.seenIds.add(entry.id);
    this.entries.push(entry);
    await appendJsonLine(this.logFile, entry);
    return entry;
  }

  async retrieve(worldState: WorldState, recentHistory: string[] = []): Promise<MemoryQueryResult> {
    await this.ready;
    const objectiveTerms = worldState.userObjective.toLowerCase().split(/\s+/).filter(Boolean);
    const historyTerms = recentHistory
      .flatMap((entry) => entry.toLowerCase().split(/[^a-z0-9_]+/))
      .filter((term) => term.length >= 3);
    const searchTerms = new Set([...objectiveTerms, ...historyTerms]);
    const entries = this.entries
      .filter((entry) => {
        const objective = entry.objective.toLowerCase();
        return [...searchTerms].some((term) => objective.includes(term));
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
      const issueText = entry.issueTags.length > 0
        ? ` issue_tags=${entry.issueTags.join(",")}.`
        : "";
      const fixText = entry.suggestedFixes[0]
        ? ` suggested_fix=${entry.suggestedFixes[0]}`
        : "";
      return `${entry.actionType} previously ${verdict} in ${entry.predictedFuture.strategy}.${issueText}${fixText}`;
    });

    return { entries, summary };
  }
}
