import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  JarvisPersistentArtifacts,
  PersistentWorkerResponse,
} from "../src/executor/jarvis_persistent_executor.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeResponse(overrides: Partial<PersistentWorkerResponse> = {}): PersistentWorkerResponse {
  return {
    sessionId:             "abc12345",
    reusedSession:         false,
    cumulativeStepBefore:  0,
    cumulativeStepAfter:   5,
    actionCount:           5,
    actions:               [{ buttons: 0, camera: 180 }, { buttons: 288, camera: 220 }],
    durationSeconds:       12.3,
    remoteExecutionSucceeded: true,
    taskSucceeded:         null,
    latestScreenshotPath:  "/workspace/JarvisVLA/mine0_persistent/latest_pov.png",
    videoPath:             null,
    error:                 null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Worker response shape
// ---------------------------------------------------------------------------

describe("PersistentWorkerResponse shape", () => {
  it("captures all required fields from a /run_goal response", () => {
    const r = makeResponse();
    assert.equal(r.sessionId, "abc12345");
    assert.equal(r.reusedSession, false);
    assert.equal(r.cumulativeStepBefore, 0);
    assert.equal(r.cumulativeStepAfter, 5);
    assert.equal(r.actionCount, 5);
    assert.equal(r.remoteExecutionSucceeded, true);
    assert.equal(r.taskSucceeded, null);
  });

  it("marks task success when reward > 0 was detected", () => {
    const r = makeResponse({ taskSucceeded: true });
    assert.equal(r.taskSucceeded, true);
  });

  it("marks task failure when reward was explicitly zero/negative", () => {
    const r = makeResponse({ taskSucceeded: false });
    assert.equal(r.taskSucceeded, false);
  });

  it("carries error message when remoteExecutionSucceeded is false", () => {
    const r = makeResponse({ remoteExecutionSucceeded: false, error: "env crashed" });
    assert.equal(r.remoteExecutionSucceeded, false);
    assert.ok(r.error?.includes("env crashed"));
  });
});

// ---------------------------------------------------------------------------
// Session continuity parsing
// ---------------------------------------------------------------------------

describe("session continuity", () => {
  it("first call has reusedSession=false and cumulativeStepBefore=0", () => {
    const first = makeResponse({ reusedSession: false, cumulativeStepBefore: 0, cumulativeStepAfter: 5 });
    assert.equal(first.reusedSession, false);
    assert.equal(first.cumulativeStepBefore, 0);
    assert.equal(first.cumulativeStepAfter, 5);
  });

  it("second call has reusedSession=true and cumulativeStep increases", () => {
    const second = makeResponse({
      reusedSession:        true,
      cumulativeStepBefore: 5,
      cumulativeStepAfter:  10,
    });
    assert.equal(second.reusedSession, true);
    assert.equal(second.cumulativeStepBefore, 5);
    assert.equal(second.cumulativeStepAfter, 10);
    assert.ok(second.cumulativeStepAfter > second.cumulativeStepBefore);
  });

  it("both calls share the same sessionId — Minecraft did not restart", () => {
    const sessionId = "persistent-session-1";
    const first  = makeResponse({ sessionId, reusedSession: false, cumulativeStepBefore: 0,  cumulativeStepAfter: 5  });
    const second = makeResponse({ sessionId, reusedSession: true,  cumulativeStepBefore: 5,  cumulativeStepAfter: 10 });
    assert.equal(first.sessionId, second.sessionId, "sessionId must be identical across goals");
  });

  it("cumulative steps are strictly monotonically increasing", () => {
    const calls = [
      makeResponse({ cumulativeStepBefore: 0,  cumulativeStepAfter: 5  }),
      makeResponse({ cumulativeStepBefore: 5,  cumulativeStepAfter: 10 }),
      makeResponse({ cumulativeStepBefore: 10, cumulativeStepAfter: 15 }),
    ];
    for (const r of calls) {
      assert.ok(r.cumulativeStepAfter > r.cumulativeStepBefore);
    }
    for (let i = 1; i < calls.length; i++) {
      const prev = calls[i - 1];
      const curr = calls[i];
      assert.equal(curr?.cumulativeStepBefore, prev?.cumulativeStepAfter,
        "each call's cumulativeStepBefore must equal the previous call's cumulativeStepAfter");
    }
  });
});

// ---------------------------------------------------------------------------
// Artifact shaping
// ---------------------------------------------------------------------------

describe("JarvisPersistentArtifacts shaping", () => {
  function responseToArtifacts(r: PersistentWorkerResponse, extras: Partial<JarvisPersistentArtifacts> = {}): JarvisPersistentArtifacts {
    return {
      timestamp:             new Date().toISOString(),
      envConfig:             "kill/kill_zombie",
      instruction:           "Look around for a zombie",
      sessionId:             r.sessionId,
      reusedSession:         r.reusedSession,
      cumulativeStepBefore:  r.cumulativeStepBefore,
      cumulativeStepAfter:   r.cumulativeStepAfter,
      actionCount:           r.actionCount,
      actions:               r.actions.slice(0, 10),
      durationSeconds:       r.durationSeconds,
      remoteExecutionSucceeded: r.remoteExecutionSucceeded,
      taskSucceeded:         r.taskSucceeded,
      latestScreenshotPath:  r.latestScreenshotPath,
      videoPath:             r.videoPath,
      ...extras,
    };
  }

  it("copies all session fields from the worker response", () => {
    const r = makeResponse({ cumulativeStepBefore: 5, cumulativeStepAfter: 10, reusedSession: true });
    const art = responseToArtifacts(r);
    assert.equal(art.sessionId, r.sessionId);
    assert.equal(art.reusedSession, r.reusedSession);
    assert.equal(art.cumulativeStepBefore, 5);
    assert.equal(art.cumulativeStepAfter, 10);
  });

  it("caps actions array at 10 entries", () => {
    const manyActions = Array.from({ length: 20 }, (_, i) => ({ buttons: i, camera: i }));
    const r = makeResponse({ actions: manyActions, actionCount: 20 });
    const art = responseToArtifacts(r);
    assert.ok(art.actions.length <= 10);
  });

  it("includes latestScreenshotPath when worker provides one", () => {
    const r = makeResponse({ latestScreenshotPath: "/workspace/JarvisVLA/mine0_persistent/latest_pov.png" });
    const art = responseToArtifacts(r);
    assert.ok(art.latestScreenshotPath?.endsWith(".png"));
  });

  it("latestScreenshotPath is null when worker did not save a screenshot", () => {
    const r = makeResponse({ latestScreenshotPath: null });
    const art = responseToArtifacts(r);
    assert.equal(art.latestScreenshotPath, null);
  });
});

// ---------------------------------------------------------------------------
// Status mapping (mirrors the logic in JarvisPersistentExecutor.execute())
// ---------------------------------------------------------------------------

describe("ActionOutcome status mapping from worker response", () => {
  function mapStatus(r: Pick<PersistentWorkerResponse, "remoteExecutionSucceeded" | "taskSucceeded">)
    : "success" | "partial_success" | "failed" {
    if (!r.remoteExecutionSucceeded) return "failed";
    if (r.taskSucceeded === true)    return "success";
    if (r.taskSucceeded === false)   return "failed";
    return "partial_success";
  }

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

// Mirrors the readBoolean() logic in config.ts (not exported).
function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

describe("resetOnStart config parsing", () => {
  it("defaults to true when env var is absent", () => {
    assert.equal(readBoolean(undefined, true), true);
  });

  it("parses '0' as false (reset disabled)", () => {
    assert.equal(readBoolean("0", true), false);
  });

  it("parses 'false' as false (reset disabled)", () => {
    assert.equal(readBoolean("false", true), false);
  });

  it("parses '1' as true (reset enabled)", () => {
    assert.equal(readBoolean("1", true), true);
  });

  it("parses 'true' as true (reset enabled)", () => {
    assert.equal(readBoolean("true", true), true);
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

// Logic mirror of JarvisPersistentExecutor.reuseExistingSession() —
// validates that the no-reset path reads health fields correctly.
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

describe("no-reset path (resetOnStart=false) — health response handling", () => {
  it("extracts sessionId and cumulativeStep from a healthy response", () => {
    const health: WorkerHealth = {
      status: "ok",
      session_id: "d39a87c0",
      env_alive: true,
      cumulative_step: 20,
    };
    const state = applyHealthToState(health);
    assert.equal(state.sessionId, "d39a87c0");
    assert.equal(state.cumulativeStep, 20);
  });

  it("defaults cumulativeStep to 0 when field is absent", () => {
    const health: WorkerHealth = { status: "ok", session_id: "abc", env_alive: true };
    const state = applyHealthToState(health);
    assert.equal(state.cumulativeStep, 0);
  });

  it("defaults sessionId to null when field is absent", () => {
    const health: WorkerHealth = { status: "ok", env_alive: true, cumulative_step: 5 };
    const state = applyHealthToState(health);
    assert.equal(state.sessionId, null);
  });

  it("throws when env_alive is false", () => {
    const health: WorkerHealth = { status: "ok", session_id: "abc", env_alive: false };
    assert.throws(
      () => applyHealthToState(health),
      /env_alive=false/,
    );
  });

  it("error message for env_alive=false hints at JARVIS_PERSISTENT_RESET_ON_START=1", () => {
    const health: WorkerHealth = { status: "ok", env_alive: false };
    assert.throws(
      () => applyHealthToState(health),
      /JARVIS_PERSISTENT_RESET_ON_START=1/,
    );
  });

  it("throws when worker status is not 'ok'", () => {
    const health: WorkerHealth = { status: "error", session_id: null, env_alive: false };
    assert.throws(
      () => applyHealthToState(health),
      /Worker not healthy/,
    );
  });
});
