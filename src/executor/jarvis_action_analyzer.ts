// Detects repetitive JARVIS action patterns in the action array returned by
// the persistent worker after a /run_goal call. Three modes of loop:
//   1. Exact duplicates — same buttons + camera value repeated
//   2. Dominant action — single action makes up ≥ 70 % of the sequence
//   3. Camera drift — same buttons, camera value varies within ± 15 but never
//      moves meaningfully (the bot is spinning in a tiny arc)
//
// Also exports validateMineStudioAgentAction() for detecting out-of-range
// action values against the standard MineStudio agent action space bounds.

export interface ActionLoopAnalysis {
  /** True when any loop mode was triggered. */
  actionLoopDetected: boolean;
  /** Fraction of actions that are exact duplicates of another action in the sequence. */
  repeatedActionRatio: number;
  /** Number of distinct (buttons, camera) pairs seen. */
  uniqueActionCount: number;
  /** The most frequent action object, or null when the sequence is empty. */
  dominantAction: Record<string, number> | null;
  /** Human-readable reason: "exact_repeated_action" | "camera_drift" | "low_action_diversity" | null */
  loopReason: string | null;
}

/** Threshold: dominant action must be ≥ this fraction of the sequence. */
const DOMINANT_RATIO_THRESHOLD = 0.7;
/** Threshold: non-unique fraction must be ≥ this to flag low diversity. */
const LOW_DIVERSITY_THRESHOLD = 0.7;
/** Camera values must stay within this window to count as drift. */
const CAMERA_DRIFT_WINDOW = 30;
/** Minimum run length in same-buttons group to trigger drift detection. */
const CAMERA_DRIFT_MIN_LENGTH = 4;

export function analyzeActions(
  actions: Array<Record<string, number>>,
): ActionLoopAnalysis {
  if (actions.length === 0) {
    return {
      actionLoopDetected: false,
      repeatedActionRatio: 0,
      uniqueActionCount: 0,
      dominantAction: null,
      loopReason: null,
    };
  }

  // Stringify each action for exact-match counting
  const keys = actions.map((a) => JSON.stringify(a));
  const uniqueSet = new Set(keys);
  const uniqueActionCount = uniqueSet.size;
  const repeatedActionRatio =
    Math.round((1 - uniqueActionCount / actions.length) * 1000) / 1000;

  // Find dominant action
  const counts = new Map<string, number>();
  for (const k of keys) {
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let dominantKey = "";
  let dominantCount = 0;
  for (const [k, n] of counts) {
    if (n > dominantCount) {
      dominantCount = n;
      dominantKey = k;
    }
  }
  const dominantAction: Record<string, number> | null = dominantKey
    ? (JSON.parse(dominantKey) as Record<string, number>)
    : null;
  const dominantRatio = dominantCount / actions.length;

  // Camera drift: group by buttons value, check if camera stays in a small window
  let cameraDriftDetected = false;
  if (actions.length >= CAMERA_DRIFT_MIN_LENGTH) {
    const buttonsGroups = new Map<number, number[]>();
    for (const action of actions) {
      const btns = action["buttons"] ?? 0;
      const cam = action["camera"] ?? 0;
      const group = buttonsGroups.get(btns);
      if (group) {
        group.push(cam);
      } else {
        buttonsGroups.set(btns, [cam]);
      }
    }
    for (const cameras of buttonsGroups.values()) {
      if (
        cameras.length >= CAMERA_DRIFT_MIN_LENGTH &&
        cameras.length >= actions.length * 0.7
      ) {
        const min = Math.min(...cameras);
        const max = Math.max(...cameras);
        if (max - min <= CAMERA_DRIFT_WINDOW) {
          cameraDriftDetected = true;
          break;
        }
      }
    }
  }

  // Determine loop mode in priority order
  let actionLoopDetected = false;
  let loopReason: string | null = null;

  if (dominantRatio >= DOMINANT_RATIO_THRESHOLD) {
    actionLoopDetected = true;
    loopReason = "exact_repeated_action";
  } else if (cameraDriftDetected) {
    actionLoopDetected = true;
    loopReason = "camera_drift";
  } else if (repeatedActionRatio >= LOW_DIVERSITY_THRESHOLD) {
    actionLoopDetected = true;
    loopReason = "low_action_diversity";
  }

  return {
    actionLoopDetected,
    repeatedActionRatio,
    uniqueActionCount,
    dominantAction,
    loopReason,
  };
}

// ---------------------------------------------------------------------------
// MineStudio agent action space bounds (standard defaults).
//
// The MineStudio "agent" action type uses MultiDiscrete:
//   buttons: [8641] → 0–8640 (button bit-combinations for 13 keys)
//   camera:  [121]  → 0–120  (discretized yaw×pitch; 60 = no movement)
//
// NOTE: The "kill/kill_zombie" Hydra config supplies its own CameraConfig which
// may use a different discretization. If repeated out-of-range alerts appear
// in practice but the env steps without errors, verify cfg.camera_config on
// RunPod and update MINESTUDIO_CAMERA_MAX to match the actual bin count − 1.
// ---------------------------------------------------------------------------
export const MINESTUDIO_CAMERA_MAX = 120;
export const MINESTUDIO_BUTTONS_MAX = 8640;

export interface AgentActionValidation {
  valid: boolean;
  /** List of human-readable strings describing each out-of-range field. */
  outOfRangeKeys: string[];
}

/**
 * Validates a single MineStudio agent action dict against the standard agent
 * action space bounds. Returns `valid: false` plus a description for each
 * field that falls outside the expected range.
 */
export function validateMineStudioAgentAction(
  action: Record<string, number>,
): AgentActionValidation {
  const outOfRangeKeys: string[] = [];
  const camera = action["camera"];
  const buttons = action["buttons"];

  if (camera !== undefined && (camera < 0 || camera > MINESTUDIO_CAMERA_MAX)) {
    outOfRangeKeys.push(
      `camera=${camera} (expected 0–${MINESTUDIO_CAMERA_MAX}; check cfg.camera_config if env steps without error)`,
    );
  }
  if (buttons !== undefined && (buttons < 0 || buttons > MINESTUDIO_BUTTONS_MAX)) {
    outOfRangeKeys.push(
      `buttons=${buttons} (expected 0–${MINESTUDIO_BUTTONS_MAX})`,
    );
  }

  return { valid: outOfRangeKeys.length === 0, outOfRangeKeys };
}
