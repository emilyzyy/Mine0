import type { WorldState } from "../contracts/index.ts";
import type { PerceptionResult } from "../perception/perception_service.ts";
import type { PlannerProposal } from "./planner_service.ts";

export const ACTION_ALLOWLIST = [
  "scan",
  "explore",
  "collect",
  "craft",
  "equip",
  "place",
] as const;

export function worldStatePrompt(worldState: WorldState): string {
  return JSON.stringify(
    {
      timestamp: worldState.timestamp,
      objective: worldState.userObjective,
      position: worldState.position,
      biomeOrRegionHint: worldState.biomeOrRegionHint,
      health: worldState.health,
      hunger: worldState.hunger,
      inventory: worldState.inventory,
      equippedItem: worldState.equippedItem,
      timeOfDay: worldState.timeOfDay,
      visibleHazards: worldState.visibleHazards,
      perceivedResources: worldState.perceivedResources,
      goalProgress: worldState.goalProgress,
      screenshotPath: worldState.screenshotPath,
    },
    null,
    2,
  );
}

export function perceptionSystemPrompt(): string {
  return [
    "You are the perception stage of a Minecraft planning system.",
    "Infer a compact scene model for planning from limited state and, when available, a screenshot.",
    "Do not invent exact block coordinates or a complete nearby block list.",
    "Return concise structured planning cues only.",
  ].join(" ");
}

export function perceptionUserPrompt(worldState: WorldState): string {
  return [
    "Produce a scene model for the current Minecraft step.",
    "If the screenshot is not informative, rely on the provided structured state and say so in confidence notes.",
    "",
    worldStatePrompt(worldState),
  ].join("\n");
}

export function plannerSystemPrompt(style: string): string {
  return [
    "You are a Minecraft strategist generating one bounded next-step subgoal.",
    `Planning style: ${style}.`,
    `Only use this action allowlist: ${ACTION_ALLOWLIST.join(", ")}.`,
    "Prefer atomic, verifiable instructions that can be executed safely in one bounded step.",
    "Reason from the user's freeform objective, the scene summary, and retrieved memory.",
  ].join(" ");
}

export function plannerUserPrompt(
  worldState: WorldState,
  perception: PerceptionResult,
  memorySummary: string[],
): string {
  return [
    "Generate exactly one planner proposal.",
    "",
    "World state:",
    worldStatePrompt(worldState),
    "",
    "Perception:",
    JSON.stringify(perception, null, 2),
    "",
    "Retrieved memory:",
    JSON.stringify(memorySummary, null, 2),
  ].join("\n");
}

export function rolloutSystemPrompt(variantCount: number): string {
  return [
    "You are a future rollout engine for Minecraft.",
    `Generate exactly ${variantCount} structured imagined futures for the same candidate action.`,
    "Keep the candidate action aligned with the proposal and vary confidence, path assumptions, timing, and risk.",
    "Do not propose impossible inventory gains or unsupported actions.",
  ].join(" ");
}

export function rolloutUserPrompt(
  worldState: WorldState,
  perception: PerceptionResult,
  proposal: PlannerProposal,
  variantCount: number,
): string {
  return [
    `Generate ${variantCount} imagined futures for this proposal.`,
    "",
    "World state:",
    worldStatePrompt(worldState),
    "",
    "Perception:",
    JSON.stringify(perception, null, 2),
    "",
    "Proposal:",
    JSON.stringify(proposal, null, 2),
  ].join("\n");
}

export function criticSystemPrompt(): string {
  return [
    "You are the planning critic.",
    "Assess each candidate future against objective progress, risk, time, and compatibility with retrieved memory.",
    "Return one small adjustment per branch in the range [-0.05, 0.05] plus brief rationale.",
    "Do not change branch ids.",
  ].join(" ");
}

export function criticUserPrompt(
  worldState: WorldState,
  memorySummary: string[],
  futures: unknown,
): string {
  return [
    "Evaluate the following imagined futures.",
    "",
    "World state:",
    worldStatePrompt(worldState),
    "",
    "Retrieved memory:",
    JSON.stringify(memorySummary, null, 2),
    "",
    "Futures:",
    JSON.stringify(futures, null, 2),
  ].join("\n");
}
