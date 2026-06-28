import { writeFile } from "node:fs/promises";
import type { CandidateAction, InventoryStack, Position3 } from "../contracts/index.ts";
import { isoNow } from "../shared/logger.ts";
import { projectPath } from "../shared/fs.ts";

const EMPTY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sP7L4wAAAAASUVORK5CYII=";

export interface MockWorldSnapshot {
  position: Position3;
  biomeOrRegionHint: string;
  health: number;
  hunger: number;
  inventory: InventoryStack[];
  equippedItem: string;
  timeOfDay: "day" | "night" | "sunrise" | "sunset";
  visibleHazards: string[];
  perceivedResources: string[];
}

export class MockMinecraftWorld {
  private readonly seedLabel: string;
  private position: Position3;
  private inventory: InventoryStack[];
  private health: number;
  private hunger: number;
  private equippedItem: string;
  private timeOfDay: "day" | "night" | "sunrise" | "sunset";
  private visibleHazards: string[];
  private perceivedResources: string[];
  private biomeOrRegionHint: string;
  private frameIndex: number;

  constructor(seedLabel: string) {
    this.seedLabel = seedLabel;
    this.position = { x: 120.5, y: 65, z: -31.2 };
    this.inventory = [];
    this.health = 20;
    this.hunger = 18;
    this.equippedItem = "air";
    this.timeOfDay = "day";
    this.visibleHazards = [];
    this.perceivedResources = ["oak_tree", "grass_path", "stone_outcrop"];
    this.biomeOrRegionHint = "forest_edge";
    this.frameIndex = 0;
  }

  reset(): void {
    this.position = { x: 120.5, y: 65, z: -31.2 };
    this.inventory = [];
    this.health = 20;
    this.hunger = 18;
    this.equippedItem = "air";
    this.timeOfDay = "day";
    this.visibleHazards = [];
    this.perceivedResources = ["oak_tree", "grass_path", "stone_outcrop"];
    this.biomeOrRegionHint = "forest_edge";
    this.frameIndex = 0;
  }

  async captureFrame(): Promise<string> {
    this.frameIndex += 1;
    const fileName = `step_${String(this.frameIndex).padStart(3, "0")}.png`;
    const absolutePath = projectPath("artifacts", "frames", fileName);
    await writeFile(absolutePath, Buffer.from(EMPTY_PNG_BASE64, "base64"));
    return absolutePath;
  }

  snapshot(userObjective: string, sceneSummary: string | null, screenshotPath: string) {
    return {
      timestamp: isoNow(),
      userObjective,
      position: this.position,
      biomeOrRegionHint: this.biomeOrRegionHint,
      health: this.health,
      hunger: this.hunger,
      inventory: this.inventory.map((stack) => ({ ...stack })),
      equippedItem: this.equippedItem,
      timeOfDay: this.timeOfDay,
      sceneSummary,
      visibleHazards: [...this.visibleHazards],
      perceivedResources: [...this.perceivedResources],
      goalProgress: this.estimateGoalProgress(userObjective),
      screenshotPath,
    };
  }

  applyAction(action: CandidateAction) {
    const inventoryDelta: Array<{ item: string; countChange: number }> = [];
    let durationSeconds = 18;
    let status: "success" | "partial_success" | "failed" | "timeout" = "success";
    let failureReason: string | null = null;
    let positionDelta: Position3 = { x: 0, y: 0, z: 0 };
    let healthDelta = 0;
    let hungerDelta = -1;
    let targetReached = true;
    let terrainChangedAsExpected = true;
    let hazardPresent = this.visibleHazards.length > 0;

    const changeInventory = (item: string, countChange: number) => {
      const existing = this.inventory.find((stack) => stack.item === item);
      if (existing) {
        existing.count += countChange;
      } else {
        this.inventory.push({ item, count: countChange });
      }

      this.inventory = this.inventory.filter((stack) => stack.count > 0);
      inventoryDelta.push({ item, countChange });
    };

    switch (action.name) {
      case "collect": {
        const blockType = String(action.arguments.block_type ?? "oak_log");
        const count = Number(action.arguments.count ?? 1);
        const grantedCount = this.seedLabel === "mineflayer" ? count : Math.max(1, count - 1);
        changeInventory(blockType, grantedCount);
        durationSeconds = this.seedLabel === "mineflayer" ? 19 : 24;
        positionDelta = { x: 5.2, y: 0, z: -2.1 };
        this.position = {
          x: this.position.x + positionDelta.x,
          y: this.position.y,
          z: this.position.z + positionDelta.z,
        };
        if (grantedCount < count) {
          status = "partial_success";
          failureReason = "Only part of the requested resource was reachable within the step budget.";
        }
        break;
      }
      case "craft": {
        const item = String(action.arguments.item ?? "crafting_table");
        const count = Number(action.arguments.count ?? 1);
        if (this.countItem("oak_log") + this.countItem("oak_planks") < 2) {
          status = "failed";
          failureReason = "Missing required wood resources for crafting.";
          durationSeconds = 7;
          targetReached = false;
          terrainChangedAsExpected = false;
          break;
        }
        if (this.countItem("oak_log") > 0) {
          changeInventory("oak_log", -1);
          changeInventory("oak_planks", 4);
        }
        changeInventory(item, count);
        durationSeconds = 10;
        this.equippedItem = item;
        break;
      }
      case "equip": {
        const item = String(action.arguments.item ?? "air");
        if (this.countItem(item) < 1) {
          status = "failed";
          failureReason = `Cannot equip ${item}; it is not in inventory.`;
          durationSeconds = 3;
          targetReached = false;
          terrainChangedAsExpected = false;
          break;
        }
        this.equippedItem = item;
        durationSeconds = 4;
        break;
      }
      case "explore":
      case "scan": {
        durationSeconds = action.name === "explore" ? 12 : 5;
        positionDelta = action.name === "explore" ? { x: 8, y: 0, z: -1.4 } : { x: 0, y: 0, z: 0 };
        this.position = {
          x: this.position.x + positionDelta.x,
          y: this.position.y,
          z: this.position.z + positionDelta.z,
        };
        if (!this.perceivedResources.includes("oak_tree")) {
          this.perceivedResources.push("oak_tree");
        }
        break;
      }
      default: {
        status = "failed";
        failureReason = `Unsupported mock action: ${action.name}`;
        durationSeconds = 2;
        targetReached = false;
        terrainChangedAsExpected = false;
        break;
      }
    }

    this.hunger += hungerDelta;
    this.health += healthDelta;
    return {
      durationSeconds,
      inventoryDelta,
      healthDelta,
      hungerDelta,
      positionDelta,
      status,
      failureReason,
      visualVerification: {
        targetReached,
        terrainChangedAsExpected,
        hazardPresent,
      },
    };
  }

  private countItem(item: string): number {
    return this.inventory.find((stack) => stack.item === item)?.count ?? 0;
  }

  private estimateGoalProgress(userObjective: string): number {
    const normalized = userObjective.toLowerCase();
    if (normalized.includes("pickaxe")) {
      if (this.countItem("wooden_pickaxe") > 0 || this.countItem("stone_pickaxe") > 0) {
        return 1;
      }
      if (this.countItem("crafting_table") > 0) {
        return 0.75;
      }
      if (this.countItem("oak_log") >= 3 || this.countItem("oak_planks") >= 4) {
        return 0.4;
      }
    }

    if (normalized.includes("crafting table") && this.countItem("crafting_table") > 0) {
      return 1;
    }

    if (this.countItem("oak_log") > 0) {
      return 0.2;
    }

    return 0.05;
  }
}
