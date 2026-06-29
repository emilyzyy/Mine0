import type { WorldState } from "../contracts/index.ts";
import { CerebrasClient, type ProviderCallMeta } from "../planner/cerebras_client.ts";
import { perceptionUserPrompt, perceptionSystemPrompt } from "../planner/planner_prompts.ts";
import { perceptionSchema } from "../planner/planner_schemas.ts";
import { loadPlannerConfig } from "../shared/config.ts";

export interface PerceptionResult {
  sceneSummary: string;
  visibleResources: string[];
  terrainAffordances: string[];
  hazards: string[];
  reachableTargets: string[];
  confidenceNotes: string[];
}

export class PerceptionService {
  private readonly client = new CerebrasClient();
  private readonly config = loadPlannerConfig();

  async perceive(
    worldState: WorldState,
  ): Promise<{ result: PerceptionResult; meta: ProviderCallMeta }> {
    if (!this.config.modelPerceptionEnabled) {
      return {
        result: this.heuristicPerception(worldState),
        meta: {
          label: "perception_local",
          provider: "mock",
          model: "structured-local",
          status: "skipped",
          latencyMs: 0,
          usage: null,
          timeInfo: null,
          warning: "Model perception disabled to conserve tokens; using Mineflayer structured state.",
        },
      };
    }

    const content = await this.client.buildUserContent(
      perceptionUserPrompt(worldState),
    );

    const response = await this.client.requestStructured<PerceptionResult>({
      label: "perception",
      schemaName: "mine0_perception",
      schema: perceptionSchema,
      messages: [
        {
          role: "system",
          content: perceptionSystemPrompt(),
        },
        {
          role: "user",
          content,
        },
      ],
      maxOutputTokens: 500,
      temperature: 0.1,
    });

    if (response.data) {
      return {
        result: response.data,
        meta: response.meta,
      };
    }

    return {
      result: this.heuristicPerception(worldState),
      meta: response.meta,
    };
  }

  private heuristicPerception(worldState: WorldState): PerceptionResult {
    const visibleResources = [...worldState.perceivedResources];
    const terrainAffordances = worldState.interactionHints.length > 0
      ? [...worldState.interactionHints]
      : ["open_grass_path", "reachable_tree_line", "nearby_slope"];
    const hazards = worldState.visibleHazards.length > 0 ? worldState.visibleHazards : ["none_immediate"];
    const reachableTargets = [
      ...new Set(
        [
          ...visibleResources,
          worldState.lineOfSightTarget,
          ...worldState.nearbyBlocks,
        ].filter((value): value is string => Boolean(value)),
      ),
    ].slice(0, 6);
    const confidenceNotes = [
      "Perception is derived from Mineflayer structured state only.",
      "Planner receives structured Mineflayer cues for nearby blocks, entities, line of sight, and interaction affordances.",
    ];

    return {
      sceneSummary: [
        `Line of sight target: ${worldState.lineOfSightTarget ?? "none"}.`,
        `Nearby blocks: ${worldState.nearbyBlocks.slice(0, 5).join(", ") || "none identified"}.`,
        `Nearby entities: ${worldState.nearbyEntities.slice(0, 3).join(", ") || "none nearby"}.`,
      ].join(" "),
      visibleResources,
      terrainAffordances,
      hazards,
      reachableTargets: reachableTargets.length > 0 ? reachableTargets : ["scan_for_resources"],
      confidenceNotes,
    };
  }
}
