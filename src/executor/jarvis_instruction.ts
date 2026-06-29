// Helpers for enriching and overriding JARVIS /run_goal instructions before they
// are sent to the persistent worker.

import type { SubgoalIntent } from "../contracts/subgoal_intent.ts";

const COMBAT_OBJECTIVE_RE = /\b(zombie|zombies|attack|fight|kill|sword|mob|hostile|combat)\b/i;
const COMBAT_ENV_RE = /zombie/i;
const EXPLORE_ACTION_RE = /\b(scan|explore|look\s+around|search|find)\b/i;

export function isCombatObjective(objective: string, envConfig = ""): boolean {
  return COMBAT_OBJECTIVE_RE.test(objective) || COMBAT_ENV_RE.test(envConfig);
}

// Per-subtask concrete instructions for the zombie combat sequence.
// These replace whatever abstract text the LLM planner generates.
const COMBAT_SUBTASK_INSTRUCTIONS: Readonly<Record<string, string>> = {
  scan_for_zombie:
    "Look around for a zombie. Sweep the camera once left and once right, then stop scanning. If no zombie is visible, move to a new viewpoint instead of repeating the same camera turn.",
  orient_to_zombie:
    "Turn to face the zombie if visible. Do not keep rotating in one direction forever.",
  approach_zombie:
    "Move toward the zombie until close enough to attack. Prefer forward movement over camera-only actions.",
  attack_zombie:
    "Attack the zombie with the equipped sword.",
  verify_zombie_outcome:
    "Look around to see whether the zombie was defeated. If another zombie is visible, turn to face it.",
};

export function getCombatSubtaskInstruction(subtaskId: string): string | null {
  return COMBAT_SUBTASK_INSTRUCTIONS[subtaskId] ?? null;
}

/**
 * For jarvis-persistent combat subtasks, replaces the abstract LLM-generated
 * instruction with a concrete one and clears the oak_log successCondition fallback.
 * Returns the original intent unchanged for non-combat objectives or unknown subtask ids.
 */
export function overrideCombatSubtaskIntent(
  intent: SubgoalIntent,
  activeSubtaskId: string | null,
  objective: string,
): SubgoalIntent {
  if (!isCombatObjective(objective) || !activeSubtaskId) {
    return intent;
  }
  const instruction = getCombatSubtaskInstruction(activeSubtaskId);
  if (!instruction) {
    return intent;
  }
  return {
    ...intent,
    instruction,
    successCondition: { item: "zombie_defeated", count: 1 },
  };
}

/**
 * Enriches a JARVIS /run_goal instruction with anti-loop hints.
 * For combat objectives the instruction is already set by overrideCombatSubtaskIntent()
 * upstream, so it is returned as-is to avoid duplication.
 */
export function buildJarvisInstruction(
  instruction: string,
  objective: string,
  envConfig: string,
): string {
  // Combat instructions are already set by overrideCombatSubtaskIntent before execute().
  if (isCombatObjective(objective, envConfig)) {
    return instruction;
  }

  if (EXPLORE_ACTION_RE.test(instruction)) {
    return (
      `${instruction}. ` +
      "Perform a bounded sweep (pan left, pan right, look ahead), then move to a new vantage point if nothing useful is found. " +
      "Do not repeat the exact same camera-only action for the full step."
    );
  }

  return instruction;
}
