import test, { after } from "node:test";
import assert from "node:assert/strict";
import { appendFile, unlink } from "node:fs/promises";
import { MemoryService } from "../src/memory/memory_service.ts";
import { appendJsonLine, isoNow } from "../src/shared/logger.ts";
import { ensureProjectDirectories, projectPath } from "../src/shared/fs.ts";
import type { WorldState } from "../src/contracts/index.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logPath(fileName: string): string {
  return projectPath("artifacts", "logs", fileName);
}

async function cleanup(fileName: string): Promise<void> {
  await unlink(logPath(fileName)).catch(() => {/* already gone */});
}

function minimalWorldState(userObjective: string): WorldState {
  return {
    timestamp: isoNow(),
    userObjective,
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "forest_edge",
    health: 20,
    hunger: 18,
    inventory: [],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: [],
    nearbyBlocks: [],
    nearbyEntities: [],
    lineOfSightTarget: null,
    interactionHints: ["structured_perception_only"],
    goalProgress: 0,
  };
}

function minimalMemoryEntryJson(id: string, objective = "gather wood"): Record<string, unknown> {
  const action = {
    name: "collect",
    arguments: { block_type: "oak_log", count: 3 },
    reason: "Wood is needed.",
  };
  const outcome = {
    executedAction: action,
    status: "success",
    durationSeconds: 19,
    inventoryDelta: [{ item: "oak_log", countChange: 3 }],
    healthDelta: 0,
    hungerDelta: -1,
    positionDelta: { x: 5.2, y: 0, z: -2.1 },
    visualVerification: {
      targetReached: true,
      terrainChangedAsExpected: true,
      hazardPresent: false,
    },
    failureReason: null,
    executor: "jarvis",
  };

  return {
    id,
    objective,
    actionType: "collect",
    environmentTags: ["forest_edge", "day"],
    failureType: null,
    hazardContext: [],
    resourceContext: ["oak_tree"],
    issueTags: ["progress_observed"],
    suggestedFixes: ["continue from the updated state."],
    predictionError: 0,
    predictedFuture: {
      branchId: "branch_test_001",
      strategy: "gather wood immediately",
      candidateAction: action,
      preconditions: ["oak tree visible"],
      predictedSteps: [{ action: "collect logs", expectedResult: "3 logs in inventory" }],
      successProbability: 0.83,
      estimatedSeconds: 22,
      risk: 0.05,
      resourceCost: 0,
      goalProgress: 0.35,
      likelyNextObservation: "Inventory has oak logs.",
    },
    actualOutcome: outcome,
    createdAt: isoNow(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const USED_FILES: string[] = [];

after(async () => {
  await Promise.all(USED_FILES.map(cleanup));
});

test("retrieve() returns persisted entries without manually awaiting service.ready", async () => {
  const logFile = `test_immediate_${Date.now()}.jsonl`;
  USED_FILES.push(logFile);
  await ensureProjectDirectories();

  await appendJsonLine(logFile, minimalMemoryEntryJson("memory_immediate_001"));

  // Construct and immediately call retrieve() — no await service.ready.
  const service = new MemoryService(logFile);
  const result = await service.retrieve(minimalWorldState("gather wood"));

  assert.ok(
    result.entries.some((e) => e.id === "memory_immediate_001"),
    "retrieve() resolves after disk hydration even when called without awaiting ready",
  );
});

test("entries written to disk are loaded by a new MemoryService instance", async () => {
  const logFile = `test_persist_${Date.now()}.jsonl`;
  USED_FILES.push(logFile);
  await ensureProjectDirectories();

  await appendJsonLine(logFile, minimalMemoryEntryJson("memory_persist_001"));
  await appendJsonLine(logFile, minimalMemoryEntryJson("memory_persist_002"));

  const service = new MemoryService(logFile);
  const result = await service.retrieve(minimalWorldState("gather wood"));
  const ids = result.entries.map((e) => e.id);
  assert.ok(ids.includes("memory_persist_001"), "first entry loaded from disk");
  assert.ok(ids.includes("memory_persist_002"), "second entry loaded from disk");
});

test("memories written in a previous session are available to a subsequent MemoryService instance", async () => {
  const logFile = `test_remember_${Date.now()}.jsonl`;
  USED_FILES.push(logFile);

  await appendJsonLine(logFile, minimalMemoryEntryJson("memory_via_remember_001"));

  const service = new MemoryService(logFile);
  const result = await service.retrieve(minimalWorldState("gather wood"));
  assert.ok(
    result.entries.some((e) => e.id === "memory_via_remember_001"),
    "entry written in a previous session is visible to a new MemoryService",
  );
});

test("malformed and schema-invalid lines are silently skipped", async () => {
  const logFile = `test_malformed_${Date.now()}.jsonl`;
  USED_FILES.push(logFile);
  await ensureProjectDirectories();

  await appendJsonLine(logFile, minimalMemoryEntryJson("memory_malformed_v1"));
  await appendFile(logPath(logFile), "THIS IS NOT JSON AT ALL\n", "utf8");
  await appendFile(logPath(logFile), '{"id":"x","objective":"gather wood"}\n', "utf8");
  await appendFile(logPath(logFile), "\n", "utf8");
  await appendFile(logPath(logFile), "   \n", "utf8");
  await appendJsonLine(logFile, minimalMemoryEntryJson("memory_malformed_v2"));

  const service = new MemoryService(logFile);
  const result = await service.retrieve(minimalWorldState("gather wood"));
  assert.equal(result.entries.length, 2, "only the two valid entries are loaded");
  assert.ok(result.entries.some((e) => e.id === "memory_malformed_v1"));
  assert.ok(result.entries.some((e) => e.id === "memory_malformed_v2"));
});

test("duplicate IDs in the log file are not loaded twice", async () => {
  const logFile = `test_dedup_${Date.now()}.jsonl`;
  USED_FILES.push(logFile);
  await ensureProjectDirectories();

  const entry = minimalMemoryEntryJson("memory_dedup_001");
  await appendJsonLine(logFile, entry);
  await appendJsonLine(logFile, entry);

  const service = new MemoryService(logFile);
  const result = await service.retrieve(minimalWorldState("gather wood"));
  const matchingIds = result.entries.filter((e) => e.id === "memory_dedup_001");
  assert.equal(matchingIds.length, 1, "duplicate entry should appear only once");
});

test("retrieve() summaries include issue diagnostics and suggested fixes", async () => {
  const logFile = `test_issue_summary_${Date.now()}.jsonl`;
  USED_FILES.push(logFile);
  await ensureProjectDirectories();

  const entry = minimalMemoryEntryJson("memory_issue_001", "place furnace");
  entry.issueTags = ["placement_access_problem"];
  entry.suggestedFixes = ["change stance or clear space before retrying placement."];
  await appendJsonLine(logFile, entry);

  const service = new MemoryService(logFile);
  const result = await service.retrieve(minimalWorldState("place furnace"));

  assert.ok(result.summary.some((line) => line.includes("issue_tags=placement_access_problem")));
  assert.ok(result.summary.some((line) => line.includes("suggested_fix=change stance or clear space before retrying placement.")));
});
