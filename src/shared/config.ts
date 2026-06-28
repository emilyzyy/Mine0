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
