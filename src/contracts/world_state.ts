import {
  assertArray,
  assertLiteral,
  assertNumber,
  assertObject,
  assertOptionalString,
  assertString,
  assertStringArray,
} from "../shared/schema.ts";

export interface InventoryStack {
  item: string;
  count: number;
}

export interface Position3 {
  x: number;
  y: number;
  z: number;
}

export type TimeOfDay = "day" | "night" | "sunrise" | "sunset";

export interface WorldState {
  timestamp: string;
  userObjective: string;
  position: Position3;
  biomeOrRegionHint: string;
  health: number;
  hunger: number;
  inventory: InventoryStack[];
  equippedItem: string;
  timeOfDay: TimeOfDay;
  sceneSummary: string | null;
  visibleHazards: string[];
  perceivedResources: string[];
  nearbyBlocks: string[];
  nearbyEntities: string[];
  lineOfSightTarget: string | null;
  interactionHints: string[];
  goalProgress: number;
}

export function parsePosition3(value: unknown, label: string): Position3 {
  const objectValue = assertObject(value, label);
  return {
    x: assertNumber(objectValue.x, `${label}.x`),
    y: assertNumber(objectValue.y, `${label}.y`),
    z: assertNumber(objectValue.z, `${label}.z`),
  };
}

export function parseInventoryStack(value: unknown, label: string): InventoryStack {
  const objectValue = assertObject(value, label);
  return {
    item: assertString(objectValue.item, `${label}.item`),
    count: assertNumber(objectValue.count, `${label}.count`),
  };
}

export function parseWorldState(value: unknown): WorldState {
  const objectValue = assertObject(value, "WorldState");
  return {
    timestamp: assertString(objectValue.timestamp, "WorldState.timestamp"),
    userObjective: assertString(objectValue.userObjective, "WorldState.userObjective"),
    position: parsePosition3(objectValue.position, "WorldState.position"),
    biomeOrRegionHint: assertString(
      objectValue.biomeOrRegionHint,
      "WorldState.biomeOrRegionHint",
    ),
    health: assertNumber(objectValue.health, "WorldState.health"),
    hunger: assertNumber(objectValue.hunger, "WorldState.hunger"),
    inventory: assertArray(objectValue.inventory, "WorldState.inventory").map((entry, index) =>
      parseInventoryStack(entry, `WorldState.inventory[${index}]`),
    ),
    equippedItem: assertString(objectValue.equippedItem, "WorldState.equippedItem"),
    timeOfDay: assertLiteral(
      objectValue.timeOfDay,
      ["day", "night", "sunrise", "sunset"] as const,
      "WorldState.timeOfDay",
    ),
    sceneSummary: assertOptionalString(
      objectValue.sceneSummary,
      "WorldState.sceneSummary",
    ),
    visibleHazards: assertStringArray(
      objectValue.visibleHazards,
      "WorldState.visibleHazards",
    ),
    perceivedResources: assertStringArray(
      objectValue.perceivedResources,
      "WorldState.perceivedResources",
    ),
    nearbyBlocks: assertStringArray(
      objectValue.nearbyBlocks,
      "WorldState.nearbyBlocks",
    ),
    nearbyEntities: assertStringArray(
      objectValue.nearbyEntities,
      "WorldState.nearbyEntities",
    ),
    lineOfSightTarget: assertOptionalString(
      objectValue.lineOfSightTarget,
      "WorldState.lineOfSightTarget",
    ),
    interactionHints: assertStringArray(
      objectValue.interactionHints,
      "WorldState.interactionHints",
    ),
    goalProgress: assertNumber(objectValue.goalProgress, "WorldState.goalProgress"),
  };
}
