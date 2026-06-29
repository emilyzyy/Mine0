import type { WorldState } from "../contracts/index.ts";
import type { ExecutorKind } from "../executor/executor_interface.ts";
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
    executorKind: ExecutorKind = "mineflayer",
  ): Promise<{ result: PerceptionResult; meta: ProviderCallMeta }> {
    if (!this.config.modelPerceptionEnabled) {
      return {
        result: this.heuristicPerception(worldState, executorKind),
        meta: {
          label: "perception_local",
          provider: "mock",
          model: "structured-local",
          status: "skipped",
          latencyMs: 0,
          usage: null,
          timeInfo: null,
          warning:
            executorKind === "jarvis"
              ? "Model perception disabled to conserve tokens; using structured observation cues tailored for the JARVIS route."
              : "Model perception disabled to conserve tokens; using Mineflayer structured state.",
        },
      };
    }

    const content = await this.client.buildUserContent(
      perceptionUserPrompt(worldState, executorKind),
    );

    const response = await this.client.requestStructured<PerceptionResult>({
      label: "perception",
      schemaName: "mine0_perception",
      schema: perceptionSchema,
      messages: [
        {
          role: "system",
          content: perceptionSystemPrompt(executorKind),
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
      result: this.heuristicPerception(worldState, executorKind),
      meta: response.meta,
    };
  }

  private heuristicPerception(worldState: WorldState, executorKind: ExecutorKind): PerceptionResult {
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
      executorKind === "jarvis"
        ? "Perception is derived from structured observation cues prepared for the JARVIS route."
        : "Perception is derived from Mineflayer structured state only.",
      executorKind === "jarvis"
        ? "Planner receives nearby, visible, and reachable cues that a JARVIS-style visual-control executor can act on."
        : "Planner receives structured Mineflayer cues for nearby blocks, entities, line of sight, and interaction affordances.",
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
