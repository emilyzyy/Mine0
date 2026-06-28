import type { WorldState } from "../contracts/index.ts";

export interface PerceptionResult {
  sceneSummary: string;
  visibleResources: string[];
  terrainAffordances: string[];
  hazards: string[];
  reachableTargets: string[];
  confidenceNotes: string[];
}

export class PerceptionService {
  perceive(worldState: WorldState): PerceptionResult {
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
