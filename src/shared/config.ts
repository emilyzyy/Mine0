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
  maxDecisionSteps: number;
  maxStalledSteps: number;
  maxRepeatedActionFailures: number;
  imageInputEnabled: boolean;
  screenshotDirectory: string;
  mineflayer: {
    enabled: boolean;
    host: string | null;
    port: number;
    username: string;
    password: string | null;
    auth: "offline" | "microsoft" | "mojang";
    version: string | false;
    connectTimeoutMs: number;
    actionTimeoutMs: number;
    viewerEnabled: boolean;
    viewerPort: number;
    viewerFirstPerson: boolean;
    headlessCaptureEnabled: boolean;
    screenshotWidth: number;
    screenshotHeight: number;
  };
}

export function loadPlannerConfig(): PlannerConfig {
  loadLocalEnv();
  const apiKey = process.env.CEREBRAS_API_KEY?.trim() || null;
  const mineflayerHost = process.env.MINE0_MINEFLAYER_HOST?.trim() || null;

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
    maxDecisionSteps: Math.max(25, readNumber(process.env.MINE0_MAX_DECISION_STEPS, 250)),
    maxStalledSteps: Math.max(2, Math.min(20, readNumber(process.env.MINE0_MAX_STALLED_STEPS, 6))),
    maxRepeatedActionFailures: Math.max(
      2,
      Math.min(12, readNumber(process.env.MINE0_MAX_REPEATED_ACTION_FAILURES, 4)),
    ),
    imageInputEnabled: readBoolean(process.env.CEREBRAS_ENABLE_IMAGE_INPUT, false),
    screenshotDirectory:
      process.env.MINE0_SCREENSHOT_DIR?.trim() || "sample_data/minecraft_frames",
    mineflayer: {
      enabled: readBoolean(process.env.MINE0_MINEFLAYER_ENABLED, Boolean(mineflayerHost)),
      host: mineflayerHost,
      port: Math.max(1, readNumber(process.env.MINE0_MINEFLAYER_PORT, 25565)),
      username: process.env.MINE0_MINEFLAYER_USERNAME?.trim() || "Mine0Bot",
      password: process.env.MINE0_MINEFLAYER_PASSWORD?.trim() || null,
      auth:
        (process.env.MINE0_MINEFLAYER_AUTH?.trim().toLowerCase() as
          | "offline"
          | "microsoft"
          | "mojang"
          | undefined) || "offline",
      version: process.env.MINE0_MINEFLAYER_VERSION?.trim() || false,
      connectTimeoutMs: Math.max(
        5_000,
        readNumber(process.env.MINE0_MINEFLAYER_CONNECT_TIMEOUT_MS, 20_000),
      ),
      actionTimeoutMs: Math.max(
        2_000,
        readNumber(process.env.MINE0_MINEFLAYER_ACTION_TIMEOUT_MS, 25_000),
      ),
      viewerEnabled: readBoolean(process.env.MINE0_MINEFLAYER_VIEWER_ENABLED, false),
      viewerPort: Math.max(1, readNumber(process.env.MINE0_MINEFLAYER_VIEWER_PORT, 3007)),
      viewerFirstPerson: readBoolean(process.env.MINE0_MINEFLAYER_VIEWER_FIRST_PERSON, true),
      headlessCaptureEnabled: readBoolean(process.env.MINE0_MINEFLAYER_HEADLESS_CAPTURE_ENABLED, true),
      screenshotWidth: Math.max(128, readNumber(process.env.MINE0_MINEFLAYER_SCREENSHOT_WIDTH, 512)),
      screenshotHeight: Math.max(128, readNumber(process.env.MINE0_MINEFLAYER_SCREENSHOT_HEIGHT, 512)),
    },
  };
}
