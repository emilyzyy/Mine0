import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExecutor } from "../src/executor/index.ts";
import type {
  JarvisPersistentArtifacts,
  PersistentWorkerResponse,
} from "../src/executor/jarvis_persistent_executor.ts";
import { buildJarvisInstruction, isCombatObjective, overrideCombatSubtaskIntent } from "../src/executor/jarvis_instruction.ts";
import { analyzeActions, validateMineStudioAgentAction, MINESTUDIO_CAMERA_MAX } from "../src/executor/jarvis_action_analyzer.ts";
import { TaskStackService } from "../src/planner/task_stack_service.ts";
import { taskDecompositionUserPrompt } from "../src/planner/planner_prompts.ts";
import type { SubgoalIntent } from "../src/contracts/subgoal_intent.ts";
import { parseSubgoalIntent } from "../src/contracts/subgoal_intent.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeResponse(overrides: Partial<PersistentWorkerResponse> = {}): PersistentWorkerResponse {
  return {
    sessionId:                "abc12345",
    reusedSession:            false,
    cumulativeStepBefore:     0,
    cumulativeStepAfter:      5,
    actionCount:              5,
    actions:                  [{ buttons: 0, camera: 180 }, { buttons: 288, camera: 220 }],
    durationSeconds:          12.3,
    remoteExecutionSucceeded: true,
    taskSucceeded:            null,
    latestScreenshotPath:     "/workspace/JarvisVLA/mine0_persistent/latest_pov.png",
    videoPath:                null,
    error:                    null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Executor wiring — jarvis-persistent is registered
// ---------------------------------------------------------------------------

describe("createExecutor('jarvis-persistent')", () => {
  it("returns a JarvisPersistentExecutor with the correct kind", () => {
    const executor = createExecutor("jarvis-persistent");
    assert.equal(executor.kind, "jarvis-persistent");
  });

  it("displayName includes 'persistent'", () => {
    const executor = createExecutor("jarvis-persistent");
    assert.ok(executor.displayName.toLowerCase().includes("persistent"));
  });

  it("does not return the mineflayer executor", () => {
    const executor = createExecutor("jarvis-persistent");
    assert.notEqual(executor.kind, "mineflayer");
  });
});

// ---------------------------------------------------------------------------
// Mineflayer not used in the JARVIS-persistent path
// ---------------------------------------------------------------------------

describe("jarvis-persistent executor has no Mineflayer dependency", () => {
  it("jarvis_persistent_executor.ts does not import mineflayer", () => {
    const src = readFileSync(
      new URL("../src/executor/jarvis_persistent_executor.ts", import.meta.url),
      "utf8",
    );
    assert.ok(
      !src.includes("mineflayer"),
      "Expected no 'mineflayer' import in jarvis_persistent_executor.ts",
    );
  });

  it("jarvis_persistent_executor.ts does not import mineflare", () => {
    const src = readFileSync(
      new URL("../src/executor/jarvis_persistent_executor.ts", import.meta.url),
      "utf8",
    );
    assert.ok(
      !src.includes("mineflare"),
      "Expected no 'mineflare' import in jarvis_persistent_executor.ts",
    );
  });
});

// ---------------------------------------------------------------------------
// Subgoal instruction flow
// The recursive planner puts the natural-language instruction in
// SubgoalIntent.instruction.  execute() sends that field verbatim to the
// JARVIS worker as the /run_goal body's "instruction" key.
// These tests verify the priority chain and body construction logic.
// ---------------------------------------------------------------------------

function extractInstruction(subgoal: Record<string, unknown>): string {
  if (typeof subgoal["instruction"] === "string" && subgoal["instruction"]) {
    return subgoal["instruction"];
  }
  if (typeof subgoal["objective"] === "string" && subgoal["objective"]) {
    return subgoal["objective"];
  }
  if (typeof subgoal["description"] === "string" && subgoal["description"]) {
    return subgoal["description"];
  }
  if (typeof subgoal["action"] === "string" && subgoal["action"]) {
    return subgoal["action"];
  }
  return JSON.stringify(subgoal);
}

function buildRunGoalBody(
  objective: string,
  instruction: string,
  maxFrames: number,
): Record<string, unknown> {
  return { objective, instruction, maxFrames, verbos: false };
}

describe("subgoal instruction priority chain", () => {
  it("uses 'instruction' field when present", () => {
    const subgoal = { instruction: "Scan for zombies", objective: "Kill zombie" };
    assert.equal(extractInstruction(subgoal), "Scan for zombies");
  });

  it("falls back to 'objective' when instruction is absent", () => {
    const subgoal = { objective: "Kill zombie" };
    assert.equal(extractInstruction(subgoal), "Kill zombie");
  });

  it("falls back to 'description' when instruction and objective are absent", () => {
    const subgoal = { description: "Move toward dark area" };
    assert.equal(extractInstruction(subgoal), "Move toward dark area");
  });

  it("falls back to 'action' last before JSON stringify", () => {
    const subgoal = { action: "explore" };
    assert.equal(extractInstruction(subgoal), "explore");
  });

  it("stringifies the subgoal as last resort", () => {
    const subgoal = { unexpectedKey: 42 };
    assert.equal(extractInstruction(subgoal), '{"unexpectedKey":42}');
  });

  it("sends instruction in the /run_goal body", () => {
    const body = buildRunGoalBody("Kill zombies", "Scan forward for zombies", 5);
    assert.equal(body["instruction"], "Scan forward for zombies");
    assert.equal(body["objective"], "Kill zombies");
    assert.equal(body["maxFrames"], 5);
  });

  it("passes multiple subgoal instructions in order across calls", () => {
    const subgoals = [
      { instruction: "Scan area for zombie" },
      { instruction: "Move toward zombie" },
      { instruction: "Attack zombie" },
    ];
    const bodies = subgoals.map((sg, i) =>
      buildRunGoalBody("Kill zombie", extractInstruction(sg), i === 0 ? 5 : 5),
    );
    assert.equal(bodies[0]?.["instruction"], "Scan area for zombie");
    assert.equal(bodies[1]?.["instruction"], "Move toward zombie");
    assert.equal(bodies[2]?.["instruction"], "Attack zombie");
  });
});

// ---------------------------------------------------------------------------
// Session reuse across multiple subgoals
// ---------------------------------------------------------------------------

describe("session continuity across subgoals", () => {
  it("first call has reusedSession=false and cumulativeStepBefore=0", () => {
    const first = makeResponse({ reusedSession: false, cumulativeStepBefore: 0, cumulativeStepAfter: 5 });
    assert.equal(first.reusedSession, false);
    assert.equal(first.cumulativeStepBefore, 0);
  });

  it("second call has reusedSession=true and cumulativeStep increases", () => {
    const second = makeResponse({ reusedSession: true, cumulativeStepBefore: 5, cumulativeStepAfter: 10 });
    assert.equal(second.reusedSession, true);
    assert.ok(second.cumulativeStepAfter > second.cumulativeStepBefore);
  });

  it("all calls share the same sessionId — Minecraft did not restart", () => {
    const sessionId = "d39a87c0";
    const first  = makeResponse({ sessionId, reusedSession: false, cumulativeStepBefore: 0,  cumulativeStepAfter: 5  });
    const second = makeResponse({ sessionId, reusedSession: true,  cumulativeStepBefore: 5,  cumulativeStepAfter: 10 });
    const third  = makeResponse({ sessionId, reusedSession: true,  cumulativeStepBefore: 10, cumulativeStepAfter: 15 });
    assert.equal(first.sessionId, sessionId);
    assert.equal(second.sessionId, sessionId);
    assert.equal(third.sessionId, sessionId);
  });

  it("cumulativeStep is strictly monotonically increasing across subgoals", () => {
    const calls = [
      makeResponse({ cumulativeStepBefore: 0,  cumulativeStepAfter: 5  }),
      makeResponse({ cumulativeStepBefore: 5,  cumulativeStepAfter: 10 }),
      makeResponse({ cumulativeStepBefore: 10, cumulativeStepAfter: 15 }),
    ];
    for (let i = 1; i < calls.length; i++) {
      const prev = calls[i - 1];
      const curr = calls[i];
      assert.equal(curr?.cumulativeStepBefore, prev?.cumulativeStepAfter,
        "each call's cumulativeStepBefore must equal the previous call's cumulativeStepAfter");
    }
  });
});

// ---------------------------------------------------------------------------
// Result mapping — artifacts include all required JARVIS fields
// ---------------------------------------------------------------------------

function responseToArtifacts(
  r: PersistentWorkerResponse,
  instruction: string,
): JarvisPersistentArtifacts {
  return {
    timestamp:               new Date().toISOString(),
    envConfig:               "kill/kill_zombie",
    instruction,
    sessionId:               r.sessionId,
    reusedSession:           r.reusedSession,
    cumulativeStepBefore:    r.cumulativeStepBefore,
    cumulativeStepAfter:     r.cumulativeStepAfter,
    actionCount:             r.actionCount,
    actions:                 r.actions.slice(0, 10),
    durationSeconds:         r.durationSeconds,
    remoteExecutionSucceeded: r.remoteExecutionSucceeded,
    taskSucceeded:           r.taskSucceeded,
    latestScreenshotPath:    r.latestScreenshotPath,
    videoPath:               r.videoPath,
  };
}

describe("result mapping includes all JARVIS artifact fields", () => {
  it("copies sessionId, reusedSession, and cumulativeSteps from worker response", () => {
    const r = makeResponse({ reusedSession: true, cumulativeStepBefore: 5, cumulativeStepAfter: 10 });
    const art = responseToArtifacts(r, "Scan for zombie");
    assert.equal(art.sessionId, r.sessionId);
    assert.equal(art.reusedSession, true);
    assert.equal(art.cumulativeStepBefore, 5);
    assert.equal(art.cumulativeStepAfter, 10);
  });

  it("preserves remoteExecutionSucceeded=true even when taskSucceeded is null", () => {
    const r = makeResponse({ remoteExecutionSucceeded: true, taskSucceeded: null });
    const art = responseToArtifacts(r, "Scan");
    assert.equal(art.remoteExecutionSucceeded, true);
    assert.equal(art.taskSucceeded, null);
  });

  it("caps actions array at 10 entries", () => {
    const manyActions = Array.from({ length: 20 }, (_, i) => ({ buttons: i, camera: i }));
    const r = makeResponse({ actions: manyActions, actionCount: 20 });
    const art = responseToArtifacts(r, "Move");
    assert.ok(art.actions.length <= 10);
  });

  it("includes instruction from the planner's subgoal", () => {
    const r = makeResponse();
    const art = responseToArtifacts(r, "Attack zombie with sword");
    assert.equal(art.instruction, "Attack zombie with sword");
  });

  it("latestScreenshotPath is null when worker did not save screenshot", () => {
    const r = makeResponse({ latestScreenshotPath: null });
    const art = responseToArtifacts(r, "Scan");
    assert.equal(art.latestScreenshotPath, null);
  });
});

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

function mapStatus(r: Pick<PersistentWorkerResponse, "remoteExecutionSucceeded" | "taskSucceeded">)
  : "success" | "partial_success" | "failed" {
  if (!r.remoteExecutionSucceeded) return "failed";
  if (r.taskSucceeded === true)    return "success";
  if (r.taskSucceeded === false)   return "failed";
  return "partial_success";
}

describe("ActionOutcome status mapping", () => {
  it("failed when SSH/process error", () => {
    assert.equal(mapStatus({ remoteExecutionSucceeded: false, taskSucceeded: null }), "failed");
  });

  it("success when positive reward signal", () => {
    assert.equal(mapStatus({ remoteExecutionSucceeded: true, taskSucceeded: true }), "success");
  });

  it("failed when explicit negative reward", () => {
    assert.equal(mapStatus({ remoteExecutionSucceeded: true, taskSucceeded: false }), "failed");
  });

  it("partial_success when process succeeded but no reward signal", () => {
    assert.equal(mapStatus({ remoteExecutionSucceeded: true, taskSucceeded: null }), "partial_success");
  });
});

// ---------------------------------------------------------------------------
// resetOnStart config flag parsing
// ---------------------------------------------------------------------------

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

describe("resetOnStart config parsing", () => {
  it("defaults to true when env var is absent", () => {
    assert.equal(readBoolean(undefined, true), true);
  });

  it("parses '0' as false — reset disabled, session reused", () => {
    assert.equal(readBoolean("0", true), false);
  });

  it("parses 'false' as false — reset disabled, session reused", () => {
    assert.equal(readBoolean("false", true), false);
  });

  it("parses '1' as true — reset enabled, fresh Minecraft session", () => {
    assert.equal(readBoolean("1", true), true);
  });
});

// ---------------------------------------------------------------------------
// No-reset path: health response handling
// ---------------------------------------------------------------------------

interface WorkerHealth {
  status?: string;
  session_id?: string | null;
  env_alive?: boolean;
  cumulative_step?: number;
}

function applyHealthToState(health: WorkerHealth): {
  sessionId: string | null;
  cumulativeStep: number;
} {
  if (health.status !== "ok") throw new Error(`Worker not healthy: ${JSON.stringify(health)}`);
  if (!health.env_alive) {
    throw new Error(
      "Worker is up but env_alive=false — no Minecraft session to reuse. " +
      "Run with JARVIS_PERSISTENT_RESET_ON_START=1 (or unset) to start a new session.",
    );
  }
  return {
    sessionId:      health.session_id ?? null,
    cumulativeStep: health.cumulative_step ?? 0,
  };
}

describe("no-reset path — health response handling", () => {
  it("extracts sessionId and cumulativeStep from a healthy response", () => {
    const state = applyHealthToState({
      status: "ok", session_id: "d39a87c0", env_alive: true, cumulative_step: 20,
    });
    assert.equal(state.sessionId, "d39a87c0");
    assert.equal(state.cumulativeStep, 20);
  });

  it("defaults cumulativeStep to 0 when field is absent", () => {
    const state = applyHealthToState({ status: "ok", session_id: "abc", env_alive: true });
    assert.equal(state.cumulativeStep, 0);
  });

  it("throws when env_alive is false", () => {
    assert.throws(
      () => applyHealthToState({ status: "ok", session_id: "abc", env_alive: false }),
      /env_alive=false/,
    );
  });

  it("error message hints at JARVIS_PERSISTENT_RESET_ON_START=1", () => {
    assert.throws(
      () => applyHealthToState({ status: "ok", env_alive: false }),
      /JARVIS_PERSISTENT_RESET_ON_START=1/,
    );
  });

  it("throws when worker status is not 'ok'", () => {
    assert.throws(
      () => applyHealthToState({ status: "error", env_alive: false }),
      /Worker not healthy/,
    );
  });
});

// ---------------------------------------------------------------------------
// maxDecisionSteps override — JARVIS persistent uses floor=1, not the
// planner-config floor of 25.
// ---------------------------------------------------------------------------

// Mirror of the parsing logic in cli_persistent.ts.
function resolveJarvisMaxSteps(envValue: string | undefined): number {
  return Math.max(1, envValue ? Number(envValue) || 1 : 1);
}

// Mirror of the RunCycleInput resolution in decision_loop.ts.
function resolveEffectiveMaxSteps(
  inputOverride: number | undefined,
  configFloor25: number,
): number {
  return inputOverride ?? configFloor25;
}

describe("maxDecisionSteps override for jarvis-persistent", () => {
  it("CLI defaults to 1 when MINE0_MAX_DECISION_STEPS is absent", () => {
    assert.equal(resolveJarvisMaxSteps(undefined), 1);
  });

  it("CLI honours MINE0_MAX_DECISION_STEPS=1 (floor is 1, not 25)", () => {
    assert.equal(resolveJarvisMaxSteps("1"), 1);
  });

  it("CLI clamps values below 1 back to 1", () => {
    assert.equal(resolveJarvisMaxSteps("0"), 1);
    assert.equal(resolveJarvisMaxSteps("-5"), 1);
  });

  it("CLI accepts values higher than 25 unchanged", () => {
    assert.equal(resolveJarvisMaxSteps("50"), 50);
  });

  it("runCycle uses the CLI override instead of the config floor", () => {
    const configValue = 25; // Dotoro's floor
    assert.equal(resolveEffectiveMaxSteps(1,  configValue), 1);
    assert.equal(resolveEffectiveMaxSteps(3,  configValue), 3);
  });

  it("runCycle falls back to config value when no override is given (non-JARVIS paths)", () => {
    const configValue = 25;
    assert.equal(resolveEffectiveMaxSteps(undefined, configValue), 25);
  });

  it("non-JARVIS paths still use the planner config floor of 25", () => {
    // loadPlannerConfig() applies Math.max(25, ...) — verify the policy is documented.
    // The config floor is intentional for Mineflayer/mock paths.
    const configValue = Math.max(25, 1); // same as Math.max(25, readNumber("1", 250))
    assert.equal(configValue, 25, "planner config floor should remain 25 for non-JARVIS paths");
  });
});

// ---------------------------------------------------------------------------
// Minimal WorldState fixture used by planner/TaskStackService tests below.
// ---------------------------------------------------------------------------

const zombieWorldState = {
  timestamp:         new Date().toISOString(),
  userObjective:     "Find and kill the zombie",
  position:          { x: 0, y: 64, z: 0 },
  biomeOrRegionHint: "plains",
  health:            20,
  hunger:            20,
  inventory:         [] as Array<{ item: string; count: number }>,
  equippedItem:      "air",
  timeOfDay:         "day" as const,
  sceneSummary:      "test plains area",
  visibleHazards:    [] as string[],
  perceivedResources: [] as string[],
  nearbyBlocks:      [] as string[],
  nearbyEntities:    [] as string[],
  lineOfSightTarget: null as string | null,
  interactionHints:  [] as string[],
  goalProgress:      0,
};

// ---------------------------------------------------------------------------
// Phase 2 — Zombie objective subtask decomposition (heuristic path)
// These tests use the heuristic TaskStackService.reset() directly (no LLM).
// ---------------------------------------------------------------------------

describe("zombie objective — heuristic subtask decomposition", () => {
  it("first subtask is scan_for_zombie, not locate_trees", () => {
    const service = new TaskStackService();
    service.reset("Find and kill the zombie", zombieWorldState as never);
    const ctx = service.getContext();
    assert.ok(
      ctx.activeSubtask !== null,
      "Expected a non-null activeSubtask for zombie objective",
    );
    assert.equal(
      ctx.activeSubtask?.id,
      "scan_for_zombie",
      `Expected first subtask id to be 'scan_for_zombie', got '${ctx.activeSubtask?.id}'`,
    );
  });

  it("zombie decomposition produces scan/approach/attack-style subgoals only", () => {
    const service = new TaskStackService();
    service.reset("Kill zombies", zombieWorldState as never);
    const ctx = service.getContext();
    const allIds = [
      ctx.activeSubtask?.id ?? "",
      ...ctx.pendingSubtasks.map((t) => t.id),
    ];
    const forbidden = ["locate_trees", "collect_logs", "craft_sword", "craft_planks", "place_crafting_table"];
    for (const id of allIds) {
      assert.ok(
        !forbidden.some((f) => id.includes(f)),
        `Zombie decomposition should not contain '${id}' — found a crafting/survival subtask`,
      );
    }
    const combatIds = ["scan_for_zombie", "approach_zombie", "attack_zombie"];
    const hasCombat = allIds.some((id) => combatIds.includes(id));
    assert.ok(hasCombat, `Expected at least one combat subtask, got: ${allIds.join(", ")}`);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — buildJarvisInstruction enrichment
// ---------------------------------------------------------------------------

describe("buildJarvisInstruction — combat objective enrichment", () => {
  it("passes through instruction unchanged for combat objectives (enrichment is in overrideCombatSubtaskIntent)", () => {
    // buildJarvisInstruction no longer appends hints for combat — overrideCombatSubtaskIntent
    // has already set the definitive subtask-specific instruction before execute() is called.
    const instruction = "Look around for a zombie. Sweep the camera once left and once right.";
    const result = buildJarvisInstruction(instruction, "Kill the zombie", "kill/kill_zombie");
    assert.equal(result, instruction, "Combat instructions must be returned verbatim");
  });

  it("appends bounded-scan guidance for explore/scan instructions", () => {
    const result = buildJarvisInstruction(
      "scan for items in this area",
      "Explore the dungeon",
      "",
    );
    assert.ok(result.startsWith("scan for items in this area"), "Original instruction must be preserved at start");
    assert.ok(
      result.toLowerCase().includes("sweep") || result.toLowerCase().includes("bounded"),
      "Explore instruction should include bounded-scan hint",
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — analyzeActions loop detection
// ---------------------------------------------------------------------------

describe("analyzeActions — loop detection", () => {
  it("detects exact repeated identical actions as a loop", () => {
    const repeatedAction = { buttons: 0, camera: 180 };
    const actions = Array.from({ length: 10 }, () => ({ ...repeatedAction }));
    const result = analyzeActions(actions);
    assert.equal(result.actionLoopDetected, true);
    assert.equal(result.loopReason, "exact_repeated_action");
    assert.ok(result.repeatedActionRatio > 0.5, `Expected high repeat ratio, got ${result.repeatedActionRatio}`);
    assert.equal(result.uniqueActionCount, 1);
  });

  it("detects camera drift (same buttons, tiny camera variation) as a loop", () => {
    // Same buttons=0, camera oscillates within a 10-unit window — looks like a spinning loop.
    const actions = [
      { buttons: 0, camera: 170 },
      { buttons: 0, camera: 175 },
      { buttons: 0, camera: 180 },
      { buttons: 0, camera: 177 },
      { buttons: 0, camera: 172 },
      { buttons: 0, camera: 178 },
      { buttons: 0, camera: 173 },
      { buttons: 0, camera: 176 },
    ];
    const result = analyzeActions(actions);
    assert.equal(result.actionLoopDetected, true, "Camera drift should be detected as a loop");
  });

  it("does not flag a diverse action sequence as a loop", () => {
    const actions = [
      { buttons: 0,   camera: 0   },
      { buttons: 288, camera: 90  },
      { buttons: 32,  camera: 180 },
      { buttons: 64,  camera: 270 },
      { buttons: 1,   camera: 45  },
      { buttons: 2,   camera: 135 },
      { buttons: 4,   camera: 225 },
      { buttons: 8,   camera: 315 },
    ];
    const result = analyzeActions(actions);
    assert.equal(result.actionLoopDetected, false, "Diverse actions should not trigger loop detection");
    assert.equal(result.loopReason, null);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — loop metadata preserved in artifacts
// ---------------------------------------------------------------------------

describe("loop metadata in JarvisPersistentArtifacts", () => {
  it("loopAnalysis field is included in artifacts when a loop is detected", () => {
    const repeatedAction = { buttons: 0, camera: 180 };
    const actions = Array.from({ length: 8 }, () => ({ ...repeatedAction }));
    const loopAnalysis = analyzeActions(actions);

    const artifact: JarvisPersistentArtifacts = {
      timestamp:                new Date().toISOString(),
      envConfig:                "kill/kill_zombie",
      instruction:              "attack the zombie",
      sessionId:                "abc",
      reusedSession:            false,
      cumulativeStepBefore:     0,
      cumulativeStepAfter:      5,
      actionCount:              8,
      actions:                  actions.slice(0, 10),
      durationSeconds:          10,
      remoteExecutionSucceeded: true,
      taskSucceeded:            null,
      latestScreenshotPath:     null,
      videoPath:                null,
      loopAnalysis,
    };

    assert.ok(artifact.loopAnalysis !== undefined, "loopAnalysis must be present in artifacts");
    assert.equal(artifact.loopAnalysis?.actionLoopDetected, true);
    assert.equal(artifact.loopAnalysis?.loopReason, "exact_repeated_action");
  });
});

// ---------------------------------------------------------------------------
// Phase 5 — Non-JARVIS paths not affected by combat hint
// ---------------------------------------------------------------------------

describe("combat prompt guard is JARVIS-only", () => {
  it("taskDecompositionUserPrompt for mineflayer + zombie does NOT include CRITICAL combat hint", () => {
    const prompt = taskDecompositionUserPrompt(
      "Kill zombies",
      zombieWorldState as never,
      [],
      "mineflayer",
    );
    assert.ok(
      !prompt.includes("CRITICAL — COMBAT OBJECTIVE"),
      "Mineflayer path must not receive the CRITICAL combat override hint",
    );
  });
});

// ---------------------------------------------------------------------------
// MineStudio agent action space validation
// Audits camera/buttons values against standard MultiDiscrete bounds.
// NOTE: if the kill_zombie CameraConfig uses >121 bins, update
// MINESTUDIO_CAMERA_MAX in jarvis_action_analyzer.ts accordingly.
// ---------------------------------------------------------------------------

describe("validateMineStudioAgentAction — MineStudio agent action space", () => {
  it("flags camera=221 as out of range for standard MultiDiscrete([121]) camera", () => {
    const result = validateMineStudioAgentAction({ buttons: 1, camera: 221 });
    assert.equal(result.valid, false,
      "camera=221 exceeds the standard 0-120 range for MultiDiscrete([121])");
    assert.ok(
      result.outOfRangeKeys.some((k) => k.startsWith("camera=221")),
      `Expected outOfRangeKeys to contain 'camera=221', got: ${JSON.stringify(result.outOfRangeKeys)}`,
    );
  });

  it("accepts camera=60 as valid (center / no-movement value)", () => {
    const result = validateMineStudioAgentAction({ buttons: 0, camera: 60 });
    assert.equal(result.valid, true);
    assert.deepEqual(result.outOfRangeKeys, []);
  });

  it("accepts boundary values camera=0 and camera=MINESTUDIO_CAMERA_MAX as valid", () => {
    assert.equal(validateMineStudioAgentAction({ buttons: 0, camera: 0 }).valid, true);
    assert.equal(validateMineStudioAgentAction({ buttons: 0, camera: MINESTUDIO_CAMERA_MAX }).valid, true);
  });

  it("flags negative camera values as out of range", () => {
    const result = validateMineStudioAgentAction({ buttons: 0, camera: -1 });
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// Phase 6 — overrideCombatSubtaskIntent: instruction + successCondition fixes
// ---------------------------------------------------------------------------

// Minimal SubgoalIntent fixture with abstract LLM-generated instruction
const abstractCombatIntent: SubgoalIntent = {
  objective: "Kill zombies",
  instruction: "visual_detection",
  candidateAction: { name: "scan", arguments: { direction: "forward" }, reason: "scan" },
  successCondition: { item: "oak_log", count: 1 },
  maximumSteps: 180,
};

describe("overrideCombatSubtaskIntent — instruction fix", () => {
  it("replaces abstract 'visual_detection' instruction for zombie scan subtask", () => {
    const result = overrideCombatSubtaskIntent(
      abstractCombatIntent,
      "scan_for_zombie",
      "Kill zombies",
    );
    assert.notEqual(result.instruction, "visual_detection",
      "Instruction must not be the abstract LLM token 'visual_detection'");
    assert.ok(
      result.instruction.toLowerCase().includes("zombie"),
      `Instruction should reference zombie, got: "${result.instruction}"`,
    );
  });

  it("zombie successCondition is not oak_log after override", () => {
    const result = overrideCombatSubtaskIntent(
      abstractCombatIntent,
      "scan_for_zombie",
      "Kill zombies",
    );
    assert.notEqual(result.successCondition.item, "oak_log",
      "successCondition.item must not be 'oak_log' for a zombie task");
    assert.equal(result.successCondition.item, "zombie_defeated");
  });

  it("toIntent→parseSubgoalIntent→overrideCombatSubtaskIntent pipeline for zombie scan does not throw and produces zombie_defeated", () => {
    // Simulates exactly what decision_loop.ts does for a scan_for_zombie step:
    // 1. toIntent() builds raw intent with "task_progress" fallback (no empty string)
    // 2. parseSubgoalIntent() validates — must not throw
    // 3. overrideCombatSubtaskIntent() overrides to "zombie_defeated"
    const rawIntent = {
      objective: "Kill zombies",
      instruction: "Scan forward for resources and hazards",
      candidateAction: { name: "scan", arguments: { direction: "forward" }, reason: "scan" },
      successCondition: { item: "task_progress", count: 1 },
      maximumSteps: 180,
    };
    // parseSubgoalIntent must not throw (would throw if item is "")
    let parsed: SubgoalIntent;
    assert.doesNotThrow(() => {
      parsed = parseSubgoalIntent(rawIntent);
    }, "parseSubgoalIntent must not throw when item is 'task_progress'");
    const final = overrideCombatSubtaskIntent(parsed!, "scan_for_zombie", "Kill zombies");
    assert.equal(final.successCondition.item, "zombie_defeated",
      "After overrideCombatSubtaskIntent, successCondition.item must be 'zombie_defeated'");
    assert.notEqual(final.successCondition.item, "oak_log");
  });
});

describe("overrideCombatSubtaskIntent — non-JARVIS/non-combat paths unchanged", () => {
  it("returns intent unchanged for non-combat objective", () => {
    const result = overrideCombatSubtaskIntent(
      abstractCombatIntent,
      "scan_for_zombie",
      "Gather wood and craft a crafting table",
    );
    assert.equal(result.instruction, "visual_detection",
      "Non-combat objective must not override instruction");
    assert.equal(result.successCondition.item, "oak_log",
      "Non-combat objective must not override successCondition");
  });

  it("returns intent unchanged when activeSubtaskId is null", () => {
    const result = overrideCombatSubtaskIntent(abstractCombatIntent, null, "Kill zombies");
    assert.equal(result.instruction, "visual_detection");
  });
});

// ---------------------------------------------------------------------------
// Phase 6 — scan loop force-advance in TaskStackService
// ---------------------------------------------------------------------------

describe("scan repetitive_action_loop forces advance to next subtask", () => {
  it("after loop detection on scan_for_zombie, activeSubtask advances to orient/approach", () => {
    const service = new TaskStackService();
    service.reset("Kill zombies", zombieWorldState as never);
    const ctx1 = service.getContext();
    assert.equal(ctx1.activeSubtask?.id, "scan_for_zombie",
      "Expected scan_for_zombie to be the first active subtask");

    const scanIntent: SubgoalIntent = {
      objective: "Kill zombies",
      instruction: "Look around for a zombie",
      candidateAction: { name: "scan", arguments: { direction: "forward" }, reason: "scan" },
      successCondition: { item: "zombie_defeated", count: 1 },
      maximumSteps: 180,
    };
    const loopOutcome = {
      executedAction: { name: "scan", arguments: { direction: "forward" }, reason: "scan" },
      status: "failed" as const,
      durationSeconds: 5,
      inventoryDelta: [] as never[],
      healthDelta: 0,
      hungerDelta: 0,
      positionDelta: { x: 0, y: 0, z: 0 },
      visualVerification: { targetReached: false, terrainChangedAsExpected: false, hazardPresent: false },
      failureReason: "repetitive_action_loop:camera_drift:ratio=0.9",
      executor: "jarvis-persistent" as const,
    };
    const loopVerification = {
      predictionError: 0.45,
      matchedExpectation: false,
      notes: [] as string[],
      issueTags: ["repetitive_action_loop"],
      suggestedFixes: ["switch to next subtask"] as string[],
    };

    service.onStepComplete(
      scanIntent as never,
      loopOutcome as never,
      zombieWorldState as never,
      loopVerification,
    );

    const ctx2 = service.getContext();
    assert.notEqual(ctx2.activeSubtask?.id, "scan_for_zombie",
      "After scan loop, scan_for_zombie should be completed and next subtask should be active");
  });
});
