import { spawn } from "node:child_process";
import type { ActionOutcome, SubgoalIntent, WorldState } from "../contracts/index.ts";
import { parseActionOutcome, parseWorldState } from "../contracts/index.ts";
import { loadJarvisConfig, type JarvisConfig } from "../shared/config.ts";
import { ensureProjectDirectories, projectPath, writeJsonArtifact } from "../shared/fs.ts";
import { appendJsonLine, isoNow } from "../shared/logger.ts";
import type { ExecutorBackend, ExecutorObservation } from "./executor_interface.ts";

// Path Mine0 writes the last persistent run's artifacts to.
export const PERSISTENT_LAST_RUN_PATH = "artifacts/logs/jarvis_persistent_last_run.json";

// Shape of the worker's /run_goal JSON response.
export interface PersistentWorkerResponse {
  sessionId: string;
  reusedSession: boolean;
  cumulativeStepBefore: number;
  cumulativeStepAfter: number;
  actionCount: number;
  actions: Array<Record<string, number>>;
  durationSeconds: number;
  remoteExecutionSucceeded: boolean;
  taskSucceeded: boolean | null;
  latestScreenshotPath: string | null;
  videoPath: string | null;
  error: string | null;
}

// Shape written to jarvis_persistent_last_run.json and the JSONL log.
export interface JarvisPersistentArtifacts {
  timestamp: string;
  envConfig: string;
  instruction: string;
  sessionId: string;
  reusedSession: boolean;
  cumulativeStepBefore: number;
  cumulativeStepAfter: number;
  actionCount: number;
  actions: Array<Record<string, number>>;
  durationSeconds: number;
  remoteExecutionSucceeded: boolean;
  taskSucceeded: boolean | null;
  latestScreenshotPath: string | null;
  videoPath: string | null;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

const SSH_TIMEOUT_MS = 660_000;

export class JarvisPersistentExecutor implements ExecutorBackend {
  readonly kind = "jarvis-persistent" as const;
  readonly displayName: string;

  private readonly config: JarvisConfig;
  // Avoid resetting Minecraft on the finally-block reset() call at end of runCycle().
  private hasInitialized = false;
  // Latest screenshot path from the most recent /run_goal response.
  private latestScreenshotPath: string | null = null;
  // Cumulative step count mirrored from worker for goalProgress estimation.
  private cumulativeStep = 0;
  // Active session ID (for display/logging).
  private sessionId: string | null = null;

  constructor() {
    this.config = loadJarvisConfig();
    this.displayName =
      `JARVIS-VLA persistent (${this.config.user}@${this.config.host}:${this.config.port}, worker :${this.config.workerPort})`;
  }

  // ── observe() ─────────────────────────────────────────────────────────────
  // Returns a WorldState using the latest screenshot from the worker.
  // Position / inventory / health remain approximate placeholders since live
  // telemetry is not yet piped back over SSH.
  async observe(userObjective: string): Promise<ExecutorObservation> {
    await ensureProjectDirectories();
    const screenshotPath = this.latestScreenshotPath
      ?? projectPath("artifacts", "frames", "remote_placeholder.png");

    return {
      worldState: parseWorldState({
        timestamp: isoNow(),
        userObjective,
        // Approximate position — JARVIS does not stream telemetry yet.
        position: { x: 0, y: 64, z: 0 },
        biomeOrRegionHint: "unknown",
        health: 20,
        hunger: 20,
        inventory: [],
        equippedItem: "air",
        timeOfDay: "day",
        sceneSummary: `Persistent JARVIS session ${this.sessionId ?? "(not started)"} — cumulative step ${this.cumulativeStep}`,
        visibleHazards: [],
        perceivedResources: [],
        // Increase goalProgress per execute() call so isMeaningfulProgress()
        // can detect that something is happening even without inventory diffs.
        goalProgress: Math.min(this.cumulativeStep / 50, 0.99),
        screenshotPath,
      }),
    };
  }

  // ── reset() ───────────────────────────────────────────────────────────────
  // On the FIRST call: either POST /reset (start/restart Minecraft) or GET
  // /health (reuse existing session), depending on resetOnStart config.
  // On subsequent calls (including the runCycle() finally block): always no-op
  // so Minecraft stays open between decisions.
  async reset(_userObjective: string): Promise<void> {
    if (this.hasInitialized) return;
    this.hasInitialized = true;

    if (!this.config.resetOnStart) {
      await this.reuseExistingSession();
      return;
    }

    console.log(`[jarvis-persistent] Calling /reset on worker (port ${this.config.workerPort}) …`);
    const body = {
      envConfig:       this.config.envConfig,
      baseUrl:         this.config.baseUrl,
      checkpoints:     this.config.checkpoints,
      temperature:     this.config.temperature,
      actionChunkLen:  1,
      historyNum:      0,
      instructionType: "normal",
    };
    const result = await this.sshCurl("POST", "/reset", body) as {
      sessionId?: string; startedAt?: string; error?: string;
    };
    if (result["error"]) throw new Error(`Worker /reset failed: ${result["error"]}`);

    this.sessionId = result["sessionId"] ?? null;
    console.log(`[jarvis-persistent] Session started: ${this.sessionId} at ${result["startedAt"] ?? "?"}`);
  }

  // GET /health and mirror session state without touching Minecraft.
  private async reuseExistingSession(): Promise<void> {
    console.log("[jarvis-persistent] reset-on-start=false — probing worker for existing session…");
    const health = await this.sshCurl("GET", "/health") as {
      status?: string;
      session_id?: string | null;
      env_alive?: boolean;
      cumulative_step?: number;
    };

    if (health["status"] !== "ok") {
      throw new Error(`Worker not healthy: ${JSON.stringify(health)}`);
    }
    if (!health["env_alive"]) {
      throw new Error(
        "Worker is up but env_alive=false — no Minecraft session to reuse. " +
        "Run with JARVIS_PERSISTENT_RESET_ON_START=1 (or unset) to start a new session.",
      );
    }

    this.sessionId      = health["session_id"] ?? null;
    this.cumulativeStep = health["cumulative_step"] ?? 0;
    console.log(
      `[jarvis-persistent] Reusing session: ${this.sessionId} ` +
      `(cumulativeStep: ${this.cumulativeStep})`,
    );
  }

  // ── execute() ─────────────────────────────────────────────────────────────
  async execute(intent: SubgoalIntent, _worldState: WorldState): Promise<ActionOutcome> {
    const startedAt = Date.now();

    const body = {
      objective:   _worldState.userObjective,
      instruction: intent.instruction,
      maxFrames:   this.config.maxFrames,
      verbos:      false,
    };

    const raw = await this.sshCurl("POST", "/run_goal", body) as PersistentWorkerResponse;
    const durationSeconds = raw.durationSeconds ?? Math.round((Date.now() - startedAt) / 1000);

    // Mirror session state for observe()
    this.sessionId          = raw.sessionId ?? this.sessionId;
    this.cumulativeStep     = raw.cumulativeStepAfter ?? this.cumulativeStep;
    this.latestScreenshotPath = raw.latestScreenshotPath ?? this.latestScreenshotPath;

    // Determine Mine0 outcome status
    let status: "success" | "partial_success" | "failed";
    let failureReason: string | null = null;

    if (!raw.remoteExecutionSucceeded) {
      status = "failed";
      failureReason = raw.error?.slice(-400) ?? "Worker reported remoteExecutionSucceeded=false";
    } else if (raw.taskSucceeded === true) {
      status = "success";
    } else if (raw.taskSucceeded === false) {
      status = "failed";
      failureReason = "Task reward was zero or negative.";
    } else {
      status = "partial_success";
    }

    // Write artifacts
    const artifacts: JarvisPersistentArtifacts = {
      timestamp:            isoNow(),
      envConfig:            this.config.envConfig,
      instruction:          intent.instruction,
      sessionId:            raw.sessionId,
      reusedSession:        raw.reusedSession,
      cumulativeStepBefore: raw.cumulativeStepBefore,
      cumulativeStepAfter:  raw.cumulativeStepAfter,
      actionCount:          raw.actionCount,
      actions:              raw.actions.slice(0, 10),
      durationSeconds,
      remoteExecutionSucceeded: raw.remoteExecutionSucceeded,
      taskSucceeded:        raw.taskSucceeded,
      latestScreenshotPath: raw.latestScreenshotPath,
      videoPath:            raw.videoPath,
    };

    await writeJsonArtifact(PERSISTENT_LAST_RUN_PATH, artifacts);
    await appendJsonLine("jarvis_persistent.jsonl", { host: this.config.host, ...artifacts });

    return parseActionOutcome({
      executedAction: intent.candidateAction,
      status,
      durationSeconds,
      inventoryDelta: [],
      healthDelta:    0,
      hungerDelta:    0,
      positionDelta:  { x: 0, y: 0, z: 0 },
      visualVerification: {
        targetReached:           raw.taskSucceeded === true,
        terrainChangedAsExpected: false,
        hazardPresent:           false,
      },
      failureReason,
      executor: this.kind,
    });
  }

  // ── SSH + curl ─────────────────────────────────────────────────────────────
  // Each API call is one SSH invocation that runs curl on the remote host.
  // JSON body is base64-encoded to avoid shell quoting issues.
  private async sshCurl(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    let remoteCmd: string;
    if (method === "GET" || body === undefined) {
      remoteCmd = `curl -s http://127.0.0.1:${this.config.workerPort}${path}`;
    } else {
      const b64 = Buffer.from(JSON.stringify(body)).toString("base64");
      remoteCmd = [
        `printf '%s' '${b64}'`,
        `| base64 -d`,
        `| curl -s -X POST -H 'Content-Type: application/json' -d @-`,
        `http://127.0.0.1:${this.config.workerPort}${path}`,
      ].join(" ");
    }

    const { exitCode, stdout, stderr } = await this.runSsh(remoteCmd);
    if (exitCode !== 0 || !stdout.trim()) {
      throw new Error(
        `Worker SSH/curl failed (exit ${exitCode}): ${stderr.slice(-300) || "(no stderr)"}`,
      );
    }
    return JSON.parse(stdout);
  }

  private runSsh(
    remoteCommand: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const args = [
        "-o", "StrictHostKeyChecking=no",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=30",
        "-p", String(this.config.port),
        "-i", this.config.keyPath,
        `${this.config.user}@${this.config.host}`,
        remoteCommand,
      ];

      const child = spawn("ssh", args);
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      if (child.stdout) child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
      if (child.stderr) child.stderr.on("data", (c: Buffer) => stderrChunks.push(c));

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`SSH timed out after ${SSH_TIMEOUT_MS / 1000}s`));
      }, SSH_TIMEOUT_MS);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        });
      });
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
    });
  }
}
