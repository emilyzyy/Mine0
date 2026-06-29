import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseOrderedDicts,
  parseVideoPath,
  parseTaskReward,
} from "../src/executor/jarvis_remote_executor.ts";

// ---------------------------------------------------------------------------
// parseOrderedDicts
// ---------------------------------------------------------------------------

describe("parseOrderedDicts", () => {
  it("parses a single OrderedDict from verified JARVIS stdout", () => {
    const line = "Action: OrderedDict([('buttons', 288), ('camera', 220)])";
    const results = parseOrderedDicts(line);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], { buttons: 288, camera: 220 });
  });

  it("parses multiple OrderedDicts from multi-step output", () => {
    const text = [
      "Step 0 — Action: OrderedDict([('buttons', 0), ('camera', 180)])",
      "Step 1 — Action: OrderedDict([('buttons', 288), ('camera', 220)])",
    ].join("\n");
    const results = parseOrderedDicts(text);
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], { buttons: 0, camera: 180 });
    assert.deepEqual(results[1], { buttons: 288, camera: 220 });
  });

  it("returns an empty array when no OrderedDicts are present", () => {
    assert.deepEqual(parseOrderedDicts("No actions here"), []);
  });
});

// ---------------------------------------------------------------------------
// parseVideoPath
// ---------------------------------------------------------------------------

describe("parseVideoPath", () => {
  const videoFold = "logs/tiny";

  it("detects a full path that includes the videoFold prefix", () => {
    const stdout = `Episode finished.  Video saved to logs/tiny/episode_1.mp4\n`;
    const path = parseVideoPath(stdout, videoFold);
    assert.equal(path, "logs/tiny/episode_1.mp4");
  });

  it('detects "Episode N saved at <path>.mp4" lines emitted by JARVIS', () => {
    const stdout = "Episode 1 saved at episode_1.mp4\n";
    const path = parseVideoPath(stdout, videoFold);
    assert.equal(path, "episode_1.mp4");
  });

  it('detects case-insensitive "Saved at" variant', () => {
    const stdout = "Recording Saved At rollout_001.mp4";
    const path = parseVideoPath(stdout, videoFold);
    assert.equal(path, "rollout_001.mp4");
  });

  it("prefers the videoFold-prefixed path when both patterns are present", () => {
    const stdout = [
      "Episode 1 saved at episode_1.mp4",
      "Full path: logs/tiny/episode_1.mp4",
    ].join("\n");
    const path = parseVideoPath(stdout, videoFold);
    // The fold-prefix match is attempted first.
    assert.equal(path, "logs/tiny/episode_1.mp4");
  });

  it("returns null when no mp4 path is found", () => {
    assert.equal(parseVideoPath("no video here", videoFold), null);
  });
});

// ---------------------------------------------------------------------------
// parseTaskReward
// ---------------------------------------------------------------------------

describe("parseTaskReward", () => {
  it("returns null when stdout contains no reward signal", () => {
    const stdout = "Running episode...\nStep 0 action taken.\n";
    assert.equal(parseTaskReward(stdout), null);
  });

  it("returns true for reward > 0", () => {
    assert.equal(parseTaskReward("task_reward: 1.0"), true);
    assert.equal(parseTaskReward("reward: 1"), true);
    assert.equal(parseTaskReward("reward=1.0"), true);
  });

  it("returns false for reward = 0", () => {
    assert.equal(parseTaskReward("task_reward: 0"), false);
    assert.equal(parseTaskReward("reward: 0.0"), false);
  });

  it("returns true for explicit task_success keyword", () => {
    assert.equal(parseTaskReward("task_success!"), true);
    assert.equal(parseTaskReward("task_complete at step 5"), true);
  });

  it("returns false for explicit task_fail keyword", () => {
    assert.equal(parseTaskReward("task_failed after 120 frames"), false);
    assert.equal(parseTaskReward("task_failure: zombie survived"), false);
  });

  it("returns null for an ambiguous stdout with generic 'success' words", () => {
    // "success" without "task_" prefix should NOT trigger a match.
    assert.equal(parseTaskReward("SSH connection success."), null);
  });
});
