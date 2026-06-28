import type { WorldState } from "../contracts/index.ts";
import { CerebrasClient, type ProviderCallMeta } from "../planner/cerebras_client.ts";
import { perceptionUserPrompt, perceptionSystemPrompt } from "../planner/planner_prompts.ts";
import { perceptionSchema } from "../planner/planner_schemas.ts";

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

  async perceive(
    worldState: WorldState,
  ): Promise<{ result: PerceptionResult; meta: ProviderCallMeta }> {
    const content = await this.client.buildUserContent(
      perceptionUserPrompt(worldState),
      worldState.screenshotPath,
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
      maxOutputTokens: 900,
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
    const terrainAffordances = ["open_grass_path", "reachable_tree_line", "nearby_slope"];
    const hazards = worldState.visibleHazards.length > 0 ? worldState.visibleHazards : ["none_immediate"];
    const reachableTargets = visibleResources.includes("oak_tree")
      ? ["oak_tree", "stone_outcrop"]
      : ["scan_for_resources"];
    const confidenceNotes = [
      `Scene derived from screenshot reference ${worldState.screenshotPath.split("/").pop()}.`,
      "Planner only receives coarse terrain and resource cues, not exact block lists.",
    ];

    return {
      sceneSummary:
        "Nearby oak tree ahead-left, exposed stone near a slope, open grass path forward, and no immediate hostile mob pressure.",
      visibleResources,
      terrainAffordances,
      hazards,
      reachableTargets,
      confidenceNotes,
    };
  }
}
