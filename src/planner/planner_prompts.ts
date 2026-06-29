import type { WorldState } from "../contracts/index.ts";
import type { PerceptionResult } from "../perception/perception_service.ts";
import type { PlannerProposal } from "./planner_service.ts";

export const ACTION_ALLOWLIST = [
  "scan",
  "explore",
  "collect",
  "craft",
  "smelt",
  "equip",
  "place",
] as const;

export function worldStatePrompt(worldState: WorldState): string {
  return JSON.stringify(
    {
      objective: worldState.userObjective,
      position: worldState.position,
      region: worldState.biomeOrRegionHint,
      health: worldState.health,
      hunger: worldState.hunger,
      inventory: worldState.inventory,
      equipped: worldState.equippedItem,
      hazards: worldState.visibleHazards.slice(0, 5),
      resources: worldState.perceivedResources.slice(0, 8),
      blocks: worldState.nearbyBlocks.slice(0, 12),
      entities: worldState.nearbyEntities.slice(0, 6),
      sight: worldState.lineOfSightTarget,
      hints: worldState.interactionHints.slice(0, 16),
      progress: worldState.goalProgress,
    },
  );
}

export function perceptionSystemPrompt(): string {
  return [
    "You are the perception stage of a Minecraft planning system.",
    "Infer a compact scene model for planning from Mineflayer-native structured state only.",
    "Prioritize the structured Mineflayer signals such as nearby blocks, nearby entities, line of sight, and interaction hints.",
    "Do not invent exact block coordinates or a complete nearby block list.",
    "Return concise structured planning cues only.",
  ].join(" ");
}

export function perceptionUserPrompt(worldState: WorldState): string {
  return [
    "Produce a scene model for the current Minecraft step.",
    "Treat the inventory as the bot's full current inventory, including any items it may have already had when it joined the server.",
    "",
    worldStatePrompt(worldState),
  ].join("\n");
}

export function plannerSystemPrompt(style: string): string {
  return [
    `You choose one bounded Minecraft Java 1.8.8 action (${style}).`,
    `Only use this action allowlist: ${ACTION_ALLOWLIST.join(", ")}.`,
    "Follow the active task-stack head; skip work already satisfied by authoritative inventory/state.",
    "Return one atomic, verifiable action using Mineflayer blocks, entities, sight, and interaction hints as truth.",
    "Use recent positions/actions to detect loops. For search, name a useful frontier direction; change direction or depth after revisits, and descend for unseen underground targets.",
    "Respect access requirements such as line of sight, adjacency, support, standing room, and placed workstations; reposition or clear space when blocked.",
    "Use legacy item names. Place carried workstations before workstation-dependent crafts. Prefer nearby or underfoot for floor placement.",
  ].join(" ");
}

function compactPerception(perception: PerceptionResult): string {
  return JSON.stringify({
    scene: perception.sceneSummary,
    resources: perception.visibleResources.slice(0, 6),
    terrain: perception.terrainAffordances.slice(0, 6),
    hazards: perception.hazards.slice(0, 4),
    reachable: perception.reachableTargets.slice(0, 6),
  });
}

function selectPlannerMemories(memorySummary: string[]): string[] {
  const diagnostics = memorySummary.filter((entry) =>
    entry.includes("issue_tags=") || entry.includes("suggested_fix="),
  );
  const selected = [...diagnostics.slice(-3), ...memorySummary.slice(-2)];
  return [...new Set(selected)].slice(-4);
}

export function plannerUserPrompt(
  worldState: WorldState,
  perception: PerceptionResult,
  memorySummary: string[],
  recentHistorySummary: string[],
  taskContext: import("./task_stack_service.ts").TaskPlanningContext | null = null,
): string {
  const pending = (taskContext?.pendingSubtasks ?? []).slice(0, 6).map((entry) => entry.description);
  const completed = (taskContext?.completedSubtasks ?? []).slice(-4).map((entry) => entry.description);
  return [
    "Generate exactly one proposal. Advance the active task or its immediate blocker. Use issues/history to avoid failed or stagnant repeats unless state changed.",
    `Root: ${taskContext?.rootObjective ?? worldState.userObjective}`,
    `Active: ${taskContext?.activeSubtask?.description ?? worldState.userObjective}`,
    `Focus: ${taskContext?.activeSubtask?.planningFocus ?? worldState.userObjective}`,
    `Queue: ${pending.join(" > ") || "none"}`,
    `Completed: ${completed.join("; ") || "none"}`,
    "World:",
    worldStatePrompt(worldState),
    "Perception:",
    compactPerception(perception),
    `Relevant memory/issues: ${JSON.stringify(selectPlannerMemories(memorySummary))}`,
    `Recent run history: ${JSON.stringify(recentHistorySummary.slice(-4))}`,
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
    "World:",
    worldStatePrompt(worldState),
    "Perception:",
    compactPerception(perception),
    "Proposal:",
    JSON.stringify(proposal),
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
    "World:",
    worldStatePrompt(worldState),
    `Relevant memory/issues: ${JSON.stringify(selectPlannerMemories(memorySummary))}`,
    "Futures:",
    JSON.stringify(futures),
  ].join("\n");
}
