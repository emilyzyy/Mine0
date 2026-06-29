import { spawn } from "node:child_process";
import type { ActionOutcome, SubgoalIntent, WorldState } from "../contracts/index.ts";
import { parseActionOutcome, parseWorldState } from "../contracts/index.ts";
import { loadJarvisConfig, type JarvisConfig } from "../shared/config.ts";
import { ensureProjectDirectories, projectPath, writeJsonArtifact } from "../shared/fs.ts";
import { appendJsonLine, isoNow } from "../shared/logger.ts";
import type { ExecutorBackend, ExecutorObservation } from "./executor_interface.ts";

// Populated by execute() and overwritten each run.  Read by cli_jarvis.ts
// after runCycle() completes so it can surface JARVIS-specific detail.
export const JARVIS_LAST_RUN_PATH = "artifacts/logs/jarvis_last_run.json";

// Distinguishes whether the SSH/Python process completed cleanly from whether
// the Minecraft task objective was actually achieved.
export interface JarvisRemoteArtifacts {
  timestamp: string;
  envConfig: string;
  instruction: string;
  exitCode: number;
  durationSeconds: number;
  // True when the SSH session and remote Python process both exited cleanly.
  remoteExecutionSucceeded: boolean;
  // True/false when a task reward signal was found in stdout; null when stdout
  // contained no conclusive reward indicator (outcome genuinely unknown).
  taskSucceeded: boolean | null;
  actionCount: number;
  // First 10 JARVIS actions parsed from stdout OrderedDict lines.
  actions: Array<Record<string, number>>;
  videoPath: string | null;
  stdoutTail: string;
  stderrTail: string;
}

// ---------------------------------------------------------------------------
// SSH bridge to a remote JARVIS-VLA / MineStudio runtime.
//
// Assumptions (verified on RunPod pod 194.68.245.71:22072):
//   - The vLLM server is already running on the remote host at port 8000.
//   - The conda env "minestudio" is fully set up in /workspace/miniconda3.
//   - /workspace/JarvisVLA/jarvisvla/evaluate/evaluate.py is executable.
//   - xvfb-run and Java are available on the remote PATH after conda activation.
//
// This executor does NOT start or stop the vLLM server.
// ---------------------------------------------------------------------------

const CONDA_PREAMBLE = [
  "source /workspace/miniconda3/etc/profile.d/conda.sh",
  "conda activate minestudio",
  "export HF_HUB_ENABLE_HF_TRANSFER=0",
  "export HF_HOME=/workspace/hf_cache",
  "unset TRANSFORMERS_CACHE",
  'export JAVA_HOME="$CONDA_PREFIX"',
  'export PATH="$CONDA_PREFIX/bin:$PATH"',
].join(" && ");

// SSH timeout: evaluate.py has a 600 s internal timeout; allow 60 s of
// connection/setup overhead on top.
const SSH_TIMEOUT_MS = 660_000;

export class JarvisRemoteExecutor implements ExecutorBackend {
  readonly kind = "jarvis-remote" as const;
  readonly displayName: string;
  private readonly config: JarvisConfig;

  constructor() {
    this.config = loadJarvisConfig();
    this.displayName = `JARVIS-VLA remote (${this.config.user}@${this.config.host}:${this.config.port})`;
  }

  // observe() cannot retrieve live game state from the remote without
  // additional telemetry infrastructure.  Return a placeholder WorldState
  // that reflects the configured task so the planner/perception pipeline
  // can still run.
  async observe(userObjective: string): Promise<ExecutorObservation> {
    await ensureProjectDirectories();
    return {
      worldState: parseWorldState({
        timestamp: isoNow(),
        userObjective,
        position: { x: 0, y: 64, z: 0 },
        biomeOrRegionHint: "unknown",
        health: 20,
        hunger: 20,
        inventory: [],
        equippedItem: "air",
        timeOfDay: "day",
        sceneSummary: `Remote JARVIS task: ${this.config.envConfig}`,
        visibleHazards: [],
        perceivedResources: [],
        goalProgress: 0,
        screenshotPath: projectPath("artifacts", "frames", "remote_placeholder.png"),
      }),
    };
  }

  async execute(intent: SubgoalIntent, _worldState: WorldState): Promise<ActionOutcome> {
    const startedAt = Date.now();

    const remoteCommand = buildRemoteCommand(this.config);
    const { exitCode, stdout, stderr } = await this.runSsh(remoteCommand);

    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    const actions = parseOrderedDicts(stdout);
    const videoPath = parseVideoPath(stdout, this.config.videoFold);

    const remoteExecutionSucceeded = exitCode === 0;
    const taskSucceeded = parseTaskReward(stdout);

    // exitCode 0 means the SSH session and Python process both exited cleanly.
    // It does NOT mean the Minecraft task objective was achieved.
    // Only report "success" when we see a positive reward signal in stdout.
    let status: "success" | "partial_success" | "failed";
    let failureReason: string | null = null;
    if (!remoteExecutionSucceeded) {
      status = "failed";
      failureReason = `SSH exit code ${exitCode}. stderr: ${stderr.slice(-400) || "(empty)"}`;
    } else if (taskSucceeded === true) {
      status = "success";
    } else if (taskSucceeded === false) {
      status = "failed";
      failureReason = "Task reward signal was zero or negative. Task objective was not achieved.";
    } else {
      // exitCode 0 but no conclusive reward signal — remote ran, task outcome unknown.
      status = "partial_success";
    }

    const remoteArtifacts: JarvisRemoteArtifacts = {
      timestamp: isoNow(),
      envConfig: this.config.envConfig,
      instruction: intent.instruction,
      exitCode,
      durationSeconds,
      remoteExecutionSucceeded,
      taskSucceeded,
      actionCount: actions.length,
      actions: actions.slice(0, 10),
      videoPath,
      stdoutTail: stdout.slice(-3000),
      stderrTail: stderr.slice(-1000),
    };

    // Overwrite last-run file so cli_jarvis.ts can surface parsed artifacts.
    await writeJsonArtifact(JARVIS_LAST_RUN_PATH, remoteArtifacts);
    // Append to rolling log.
    await appendJsonLine("jarvis_remote.jsonl", { host: this.config.host, ...remoteArtifacts });

    return parseActionOutcome({
      executedAction: intent.candidateAction,
      status,
      durationSeconds,
      inventoryDelta: [],
      healthDelta: 0,
      hungerDelta: 0,
      positionDelta: { x: 0, y: 0, z: 0 },
      visualVerification: {
        // Only true when stdout explicitly shows the task objective was achieved.
        targetReached: taskSucceeded === true,
        // Terrain modification is not expected for combat/survival tasks.
        terrainChangedAsExpected: false,
        hazardPresent: false,
      },
      failureReason,
      executor: this.kind,
    });
  }

  // reset() has no meaningful implementation for the remote path yet.
  async reset(_userObjective: string): Promise<void> {}

  private runSsh(
    remoteCommand: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const args = [
        "-o", "StrictHostKeyChecking=no",
        "-o", "BatchMode=yes",
        "-o", `ConnectTimeout=30`,
        "-p", String(this.config.port),
        "-i", this.config.keyPath,
        `${this.config.user}@${this.config.host}`,
        remoteCommand,
      ];

      const child = spawn("ssh", args);
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      if (child.stdout) {
        child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      }
      if (child.stderr) {
        child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
      }

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`SSH command timed out after ${SSH_TIMEOUT_MS / 1000} s.`));
      }, SSH_TIMEOUT_MS);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        });
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Remote command builder
// ---------------------------------------------------------------------------

function buildRemoteCommand(config: JarvisConfig): string {
  const evaluatorArgs = [
    "xvfb-run -a",
    `timeout 600s`,
    "python -u jarvisvla/evaluate/evaluate.py",
    "--workers 1",
    `--env-config ${config.envConfig}`,
    `--max-frames ${config.maxFrames}`,
    `--temperature ${config.temperature}`,
    `--checkpoints ${config.checkpoints}`,
    `--base-url ${config.baseUrl}`,
    `--video-main-fold ${config.videoFold}`,
    "--history-num 0",
    "--instruction-type normal",
    "--action-chunk-len 1",
    "--verbos True",
  ].join(" ");

  return [
    CONDA_PREAMBLE,
    `cd ${config.remoteRepo}`,
    evaluatorArgs,
  ].join(" && ");
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

// Extracts OrderedDict([('buttons', 288), ('camera', 220)]) patterns.
export function parseOrderedDicts(text: string): Array<Record<string, number>> {
  const results: Array<Record<string, number>> = [];
  const dictPattern = /OrderedDict\(\[([^\]]+)\]\)/g;
  let dictMatch: RegExpExecArray | null;

  while ((dictMatch = dictPattern.exec(text)) !== null) {
    const pairs: Record<string, number> = {};
    const pairPattern = /\('([^']+)',\s*(\d+)\)/g;
    let pairMatch: RegExpExecArray | null;
    const inner = dictMatch[1] ?? "";

    while ((pairMatch = pairPattern.exec(inner)) !== null) {
      const key = pairMatch[1];
      const raw = pairMatch[2];
      if (key !== undefined && raw !== undefined) {
        const value = parseInt(raw, 10);
        if (!isNaN(value)) {
          pairs[key] = value;
        }
      }
    }

    if (Object.keys(pairs).length > 0) {
      results.push(pairs);
    }
  }

  return results;
}

// Extracts a video path from stdout.  Handles two formats:
//   "logs/tiny/episode_1.mp4"           — full path containing the videoFold dir
//   "Episode 1 saved at episode_1.mp4"  — bare filename in a JARVIS progress line
export function parseVideoPath(text: string, videoFold: string): string | null {
  const escapedFold = videoFold.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const foldPattern = new RegExp(`${escapedFold}[/\\\\][\\w./-]+\\.mp4`);
  const foldMatch = foldPattern.exec(text);
  if (foldMatch) return foldMatch[0] ?? null;

  // "Episode N saved at <path>.mp4" style lines emitted by JARVIS.
  const savedAtMatch = /saved at (\S+\.mp4)/i.exec(text);
  return savedAtMatch ? (savedAtMatch[1] ?? null) : null;
}

// Returns true when stdout contains a positive reward signal, false for an
// explicit zero/negative reward, and null when no conclusive signal is present.
export function parseTaskReward(text: string): boolean | null {
  // "task_reward: 1.0" / "reward: 1" / "reward=1.0" patterns
  const rewardMatch = /(?:task[_\s]?)?reward[=:\s]+([0-9]+(?:\.[0-9]+)?)/i.exec(text);
  if (rewardMatch !== null && rewardMatch[1] !== undefined) {
    const value = parseFloat(rewardMatch[1]);
    if (!isNaN(value)) return value > 0;
  }
  // Explicit success/failure keywords that JARVIS or MineStudio may emit.
  if (/task[_\s]?(?:success|complete)(?:d|!|\s|$)/i.test(text)) return true;
  if (/task[_\s]?fail(?:ed|ure|!|\s|$)/i.test(text)) return false;
  return null;
}
