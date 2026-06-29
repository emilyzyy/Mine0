import { loadLocalEnv } from "./env.ts";

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return value === "1" || value.toLowerCase() === "true";
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? `${process.env["HOME"] ?? "~"}/${value.slice(2)}` : value;
}

export interface JarvisConfig {
  host: string;
  port: number;
  user: string;
  keyPath: string;
  remoteRepo: string;
  baseUrl: string;
  checkpoints: string;
  envConfig: string;
  maxFrames: number;
  temperature: number;
  videoFold: string;
}

export function loadJarvisConfig(): JarvisConfig {
  loadLocalEnv();
  return {
    host: process.env["RUNPOD_HOST"]?.trim() ?? "194.68.245.71",
    port: readNumber(process.env["RUNPOD_PORT"], 22072),
    user: process.env["RUNPOD_USER"]?.trim() ?? "root",
    keyPath: expandHome(process.env["RUNPOD_KEY_PATH"]?.trim() ?? "~/.ssh/id_ed25519"),
    remoteRepo: process.env["JARVIS_REMOTE_REPO"]?.trim() ?? "/workspace/JarvisVLA",
    baseUrl: process.env["JARVIS_BASE_URL"]?.trim() ?? "http://127.0.0.1:8000/v1",
    checkpoints: process.env["JARVIS_CHECKPOINTS"]?.trim() ?? "CraftJarvis/JarvisVLA-Qwen2-VL-7B",
    envConfig: process.env["JARVIS_ENV_CONFIG"]?.trim() ?? "kill/kill_zombie",
    maxFrames: readNumber(process.env["JARVIS_MAX_FRAMES"], 2),
    temperature: Math.max(0, Math.min(1, readNumber(process.env["JARVIS_TEMPERATURE"], 0.01))),
    videoFold: process.env["JARVIS_VIDEO_FOLD"]?.trim() ?? "logs/tiny",
  };
}

export interface PlannerConfig {
  provider: "mock" | "cerebras";
  apiKey: string | null;
  baseUrl: string;
  model: string;
  fallbackModel: string | null;
  plannerAgents: number;
  rolloutTarget: number;
  temperature: number;
  maxOutputTokens: number;
  imageInputEnabled: boolean;
  screenshotDirectory: string;
}

export function loadPlannerConfig(): PlannerConfig {
  loadLocalEnv();
  const apiKey = process.env.CEREBRAS_API_KEY?.trim() || null;

  return {
    provider: apiKey ? "cerebras" : "mock",
    apiKey,
    baseUrl:
      process.env.CEREBRAS_BASE_URL?.trim() ||
      "https://api.cerebras.ai/v1/chat/completions",
    model: process.env.CEREBRAS_MODEL?.trim() || "gemma-4-31b",
    fallbackModel: process.env.CEREBRAS_FALLBACK_MODEL?.trim() || "gpt-oss-120b",
    plannerAgents: Math.max(1, Math.min(4, readNumber(process.env.MINE0_PLANNER_AGENTS, 3))),
    rolloutTarget: Math.max(3, Math.min(6, readNumber(process.env.MINE0_ROLLOUT_TARGET, 5))),
    temperature: Math.max(0, Math.min(1, readNumber(process.env.MINE0_TEMPERATURE, 0.2))),
    maxOutputTokens: Math.max(400, readNumber(process.env.MINE0_MAX_OUTPUT_TOKENS, 1400)),
    imageInputEnabled: readBoolean(process.env.CEREBRAS_ENABLE_IMAGE_INPUT, false),
    screenshotDirectory:
      process.env.MINE0_SCREENSHOT_DIR?.trim() || "sample_data/minecraft_frames",
  };
}
