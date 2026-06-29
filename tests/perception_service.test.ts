import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PerceptionService } from "../src/perception/perception_service.ts";
import { CerebrasClient } from "../src/planner/cerebras_client.ts";
import type { WorldState } from "../src/contracts/world_state.ts";

test("PerceptionService uses local structured perception by default", async () => {
  const service = new PerceptionService();
  const result = await service.perceive({
    timestamp: new Date().toISOString(),
    userObjective: "find a resource",
    position: { x: 0, y: 40, z: 0 },
    biomeOrRegionHint: "underground",
    health: 20,
    hunger: 20,
    inventory: [],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: ["iron_ore"],
    nearbyBlocks: ["stone", "iron_ore"],
    nearbyEntities: [],
    lineOfSightTarget: "iron_ore",
    interactionHints: ["reachable_target"],
    goalProgress: 0.2,
    screenshotPath: null,
  });

  assert.equal(result.meta.label, "perception_local");
  assert.equal(result.meta.usage, null);
  assert.ok(result.result.reachableTargets.includes("iron_ore"));
});

test("PerceptionService reports Jarvis-specific structured cues when requested", async () => {
  const service = new PerceptionService();
  const result = await service.perceive(
    {
      timestamp: new Date().toISOString(),
      userObjective: "place a crafting table nearby",
      position: { x: 0, y: 64, z: 0 },
      biomeOrRegionHint: "plains",
      health: 20,
      hunger: 20,
      inventory: [{ item: "crafting_table", count: 1 }],
      equippedItem: "air",
      timeOfDay: "day",
      sceneSummary: null,
      visibleHazards: [],
      perceivedResources: ["oak_tree"],
      nearbyBlocks: ["grass", "dirt"],
      nearbyEntities: [],
      lineOfSightTarget: "grass",
      interactionHints: ["can_place_crafting_table"],
      goalProgress: 0.5,
      screenshotPath: null,
    },
    "jarvis",
  );

  assert.match(result.meta.warning ?? "", /JARVIS route/);
  assert.ok(result.result.confidenceNotes.some((entry) => entry.includes("JARVIS")));
});

test("CerebrasClient attaches a local screenshot to multimodal perception content when enabled", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mine0-perception-"));
  const screenshotPath = path.join(tempDir, "frame.png");
  await writeFile(
    screenshotPath,
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sP7L4wAAAAASUVORK5CYII=", "base64"),
  );

  const client = new CerebrasClient({
    provider: "mock",
    apiKey: null,
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    model: "gemma-4-31b",
    fallbackModel: null,
    plannerAgents: 1,
    rolloutTarget: 3,
    temperature: 0.2,
    maxOutputTokens: 1400,
    maxDecisionSteps: 25,
    maxStalledSteps: 6,
    maxRepeatedActionFailures: 4,
    imageInputEnabled: true,
    modelPerceptionEnabled: true,
    screenshotDirectory: tempDir,
    mineflayer: {
      enabled: false,
      host: null,
      port: 25565,
      username: "Mine0Bot",
      password: null,
      auth: "offline",
      version: false,
      connectTimeoutMs: 20_000,
      actionTimeoutMs: 25_000,
      viewerEnabled: false,
      viewerPort: 3007,
      viewerFirstPerson: true,
      headlessCaptureEnabled: true,
      screenshotWidth: 512,
      screenshotHeight: 512,
    },
  });

  const content = await client.buildUserContent("Describe the visible Minecraft scene.", screenshotPath);
  assert.ok(Array.isArray(content));
  assert.equal(content[0]?.type, "text");
  assert.equal(content[1]?.type, "image_url");
  assert.match(String((content[1] as { image_url?: { url?: string } }).image_url?.url ?? ""), /^data:image\/png;base64,/);
});

test("PerceptionService only forwards screenshots for Jarvis routes", async () => {
  const calls: Array<{ screenshotPath: string | null | undefined }> = [];

  class RecordingClient extends CerebrasClient {
    override async buildUserContent(text: string, screenshotPath?: string | null) {
      calls.push({ screenshotPath });
      return text;
    }

    override async requestStructured() {
      return {
        data: null,
        meta: {
          label: "perception",
          provider: "cerebras" as const,
          model: "gemma-4-31b",
          status: "fallback" as const,
          latencyMs: 0,
          usage: null,
          timeInfo: null,
          warning: "stubbed",
        },
      };
    }
  }

  const service = new PerceptionService();
  const recordingClient = new RecordingClient({
    provider: "mock",
    apiKey: "test-key",
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    model: "gemma-4-31b",
    fallbackModel: null,
    plannerAgents: 1,
    rolloutTarget: 3,
    temperature: 0.2,
    maxOutputTokens: 1400,
    maxDecisionSteps: 25,
    maxStalledSteps: 6,
    maxRepeatedActionFailures: 4,
    imageInputEnabled: true,
    modelPerceptionEnabled: true,
    screenshotDirectory: "artifacts/frames",
    mineflayer: {
      enabled: false,
      host: null,
      port: 25565,
      username: "Mine0Bot",
      password: null,
      auth: "offline",
      version: false,
      connectTimeoutMs: 20_000,
      actionTimeoutMs: 25_000,
      viewerEnabled: false,
      viewerPort: 3007,
      viewerFirstPerson: true,
      headlessCaptureEnabled: true,
      screenshotWidth: 512,
      screenshotHeight: 512,
    },
  });

  (service as unknown as { client: CerebrasClient }).client = recordingClient;
  (service as unknown as { config: { modelPerceptionEnabled: boolean } }).config = {
    modelPerceptionEnabled: true,
  };

  const worldState: WorldState = {
    timestamp: new Date().toISOString(),
    userObjective: "find a tree",
    position: { x: 0, y: 64, z: 0 },
    biomeOrRegionHint: "plains",
    health: 20,
    hunger: 20,
    inventory: [],
    equippedItem: "air",
    timeOfDay: "day",
    sceneSummary: null,
    visibleHazards: [],
    perceivedResources: ["oak_tree"],
    nearbyBlocks: ["grass"],
    nearbyEntities: [],
    lineOfSightTarget: "oak_log",
    interactionHints: [],
    goalProgress: 0.2,
    screenshotPath: "/tmp/frame.png",
  };

  await service.perceive(worldState, "mineflayer");
  await service.perceive(worldState, "jarvis");

  assert.equal(calls[0]?.screenshotPath, null);
  assert.equal(calls[1]?.screenshotPath, "/tmp/frame.png");
});
