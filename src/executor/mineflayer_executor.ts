import type { ActionOutcome, CandidateAction, InventoryStack, Position3, SubgoalIntent, WorldState } from "../contracts/index.ts";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { Vec3 } from "vec3";
import { parseActionOutcome, parseWorldState } from "../contracts/index.ts";
import { requiresPlacedCraftingTable } from "../planner/craft_prerequisites.ts";
import { loadPlannerConfig } from "../shared/config.ts";
import { projectPath } from "../shared/fs.ts";
import { MockMinecraftWorld } from "./mock_world.ts";
import type { ExecutorBackend, ExecutorObservation } from "./executor_interface.ts";

const execFileAsync = promisify(execFile);

export class MineflayerExecutor implements ExecutorBackend {
  readonly kind = "mineflayer" as const;
  private activeBackend: "live" | "mock" = "mock";

  get displayName(): string {
    return this.activeBackend === "live"
      ? "Mineflayer structured perception"
      : "Mineflayer structured perception (mock)";
  }

  private readonly config = loadPlannerConfig();
  private readonly world = new MockMinecraftWorld("mineflayer");
  private bot: MineflayerBot | null = null;
  private movementState: MovementState | null = null;
  private viewerStarted = false;
  private screenshotSequence = 0;
  private screenshotCaptureUnavailableReason: string | null = null;
  private readonly liveMode = this.config.mineflayer.enabled && Boolean(this.config.mineflayer.host);

  async observe(userObjective: string): Promise<ExecutorObservation> {
    if (this.liveMode) {
      const bot = await this.ensureBot();
      this.activeBackend = "live";
      return {
        worldState: parseWorldState(this.snapshotLiveWorld(bot, userObjective)),
      };
    }

    this.activeBackend = "mock";
    const screenshotPath = await this.world.captureFrame();
    return {
      worldState: parseWorldState(this.world.snapshot(userObjective, null)),
    };
  }

  async execute(intent: SubgoalIntent, worldState: WorldState): Promise<ActionOutcome> {
    if (this.liveMode) {
      try {
        const bot = await this.ensureBot();
        return await this.executeLive(bot, intent, worldState);
      } catch (error) {
        return parseActionOutcome({
          executedAction: intent.candidateAction,
          status: "failed",
          durationSeconds: 1,
          inventoryDelta: [],
          healthDelta: 0,
          hungerDelta: 0,
          positionDelta: { x: 0, y: 0, z: 0 },
          visualVerification: {
            targetReached: false,
            terrainChangedAsExpected: false,
            hazardPresent: worldState.visibleHazards.length > 0,
          },
          failureReason:
            error instanceof Error
              ? `Mineflayer execution failed: ${error.message}`
              : "Mineflayer execution failed.",
          executor: this.kind,
        });
      }
    }

    const applied = this.world.applyAction(intent.candidateAction);
    return parseActionOutcome({
      executedAction: intent.candidateAction,
      status: applied.status,
      durationSeconds: applied.durationSeconds,
      inventoryDelta: applied.inventoryDelta,
      healthDelta: applied.healthDelta,
      hungerDelta: applied.hungerDelta,
      positionDelta: applied.positionDelta,
      visualVerification: applied.visualVerification,
      failureReason: applied.failureReason,
      executor: this.kind,
    });
  }

  async reset(_userObjective: string): Promise<void> {
    this.world.reset();
    if (this.bot) {
      try {
        this.bot.quit("Mine0 reset");
      } catch {
        // Best-effort disconnect.
      }
    }
    this.bot = null;
    this.movementState = null;
    this.viewerStarted = false;
    this.screenshotSequence = 0;
    this.screenshotCaptureUnavailableReason = null;
    this.activeBackend = "mock";
  }

  private async ensureBot(): Promise<MineflayerBot> {
    if (this.bot?.player) {
      return this.bot;
    }

    const mineflayerModule = await import("mineflayer");
    const mineflayer = (mineflayerModule.default ?? mineflayerModule) as {
      createBot(options: Record<string, unknown>): MineflayerBot;
    };
    const pathfinderModule = await import("mineflayer-pathfinder");
    const pathfinder = ((pathfinderModule as Record<string, unknown>).pathfinder ??
      (pathfinderModule.default as Record<string, unknown> | undefined)?.pathfinder) as
      | ((bot: MineflayerBot) => void)
      | undefined;
    const MovementsCtor = ((pathfinderModule as Record<string, unknown>).Movements ??
      (pathfinderModule.default as Record<string, unknown> | undefined)?.Movements) as
      | (new (bot: MineflayerBot) => MovementState["movements"])
      | undefined;
    const goalsModule = ((pathfinderModule as Record<string, unknown>).goals ??
      (pathfinderModule.default as Record<string, unknown> | undefined)?.goals) as
      | MovementState["goals"]
      | undefined;

    if (!pathfinder || !MovementsCtor || !goalsModule) {
      throw new Error("Mineflayer pathfinder module did not expose the expected API.");
    }

    const bot = mineflayer.createBot({
      host: this.config.mineflayer.host,
      port: this.config.mineflayer.port,
      username: this.config.mineflayer.username,
      password: this.config.mineflayer.password ?? undefined,
      auth: this.config.mineflayer.auth,
      version: this.config.mineflayer.version,
    });

    bot.loadPlugin(pathfinder);
    const movementState: MovementState = {
      movements: new MovementsCtor(bot),
      goals: goalsModule,
    };
    movementState.movements.allow1by1towers = false;
    movementState.movements.canDig = true;
    movementState.movements.allowParkour = false;
    movementState.movements.allowSprinting = true;
    movementState.movements.allowFreeMotion = true;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out while connecting the Mineflayer bot."));
      }, this.config.mineflayer.connectTimeoutMs);

      const onSpawn = () => {
        cleanup();
        resolve();
      };
      const onError = (error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const onKicked = (reason: unknown) => {
        cleanup();
        reject(new Error(`Mineflayer bot was kicked: ${String(reason)}`));
      };
      const cleanup = () => {
        clearTimeout(timer);
        bot.off("spawn", onSpawn);
        bot.off("error", onError);
        bot.off("kicked", onKicked);
      };

      bot.once("spawn", onSpawn);
      bot.once("error", onError);
      bot.once("kicked", onKicked);
    });

    bot.pathfinder.setMovements(movementState.movements);

    this.bot = bot;
    this.movementState = movementState;
    return bot;
  }

  private async captureLiveScreenshot(bot: MineflayerBot): Promise<string> {
    if (!this.config.mineflayer.headlessCaptureEnabled || this.screenshotCaptureUnavailableReason) {
      return "";
    }

    try {
      const screenshotDirectory = projectPath(this.config.screenshotDirectory, "mineflayer-live");
      await import("node:fs/promises").then(({ mkdir }) => mkdir(screenshotDirectory, { recursive: true }));
      const screenshotPath = projectPath(
        this.config.screenshotDirectory,
        "mineflayer-live",
        `frame_${String(++this.screenshotSequence).padStart(4, "0")}.png`,
      );
      await this.ensureViewerStarted(bot);
      await this.captureViewerScreenshot(screenshotPath);
      return screenshotPath;
    } catch (error) {
      this.screenshotCaptureUnavailableReason =
        error instanceof Error ? error.message : "Mineflayer viewer screenshot capture failed.";
      return "";
    }
  }

  private async ensureViewerStarted(bot: MineflayerBot): Promise<void> {
    if (this.viewerStarted || (!this.config.mineflayer.viewerEnabled && !this.config.mineflayer.headlessCaptureEnabled)) {
      return;
    }

    try {
      const viewerModule = await import("prismarine-viewer");
      const mineflayerViewer = ((viewerModule as Record<string, unknown>).mineflayer ??
        (viewerModule.default as Record<string, unknown> | undefined)?.mineflayer) as
        | ((bot: MineflayerBot, options: Record<string, unknown>) => unknown)
        | undefined;
      if (!mineflayerViewer) {
        throw new Error("prismarine-viewer mineflayer viewer mode is unavailable.");
      }

      mineflayerViewer(bot, {
        port: this.config.mineflayer.viewerPort,
        firstPerson: this.config.mineflayer.viewerFirstPerson,
        viewDistance: 6,
      });
      this.viewerStarted = true;
      await this.sleep(1_500);
    } catch (error) {
      this.screenshotCaptureUnavailableReason =
        error instanceof Error ? error.message : "Mineflayer viewer could not be initialized.";
    }
  }

  private async captureViewerScreenshot(screenshotPath: string): Promise<void> {
    const browserPath = this.findBrowserExecutable();
    if (!browserPath) {
      throw new Error("No supported Chrome or Edge executable was found for Mineflayer viewer screenshots.");
    }

    const viewerUrl = `http://127.0.0.1:${this.config.mineflayer.viewerPort}`;
    const args = [
      "--headless=new",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-angle=swiftshader",
      "--hide-scrollbars",
      "--mute-audio",
      `--window-size=${this.config.mineflayer.screenshotWidth},${this.config.mineflayer.screenshotHeight}`,
      "--run-all-compositor-stages-before-draw",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--virtual-time-budget=8000",
      `--screenshot=${screenshotPath}`,
      viewerUrl,
    ];

    await execFileAsync(browserPath, args, { timeout: 20_000 });
  }

  private findBrowserExecutable(): string | null {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ];

    return candidates.find((candidate) => {
      return existsSync(candidate);
    }) ?? null;
  }

  private snapshotLiveWorld(bot: MineflayerBot, userObjective: string): WorldState {
    const inventory = this.readInventory(bot);
    const perceivedResources = this.scanResources(bot);
    const nearbyBlocks = this.scanNearbyBlocks(bot);
    const nearbyEntities = this.scanNearbyEntities(bot);
    const lineOfSightTarget = this.readLineOfSightTarget(bot);
    const interactionHints = this.buildInteractionHints(bot, inventory, perceivedResources, nearbyBlocks);

    return {
      timestamp: new Date().toISOString(),
      userObjective,
      position: {
        x: Number(bot.entity.position.x.toFixed(2)),
        y: Number(bot.entity.position.y.toFixed(2)),
        z: Number(bot.entity.position.z.toFixed(2)),
      },
      biomeOrRegionHint: bot.game.dimension ?? "unknown_region",
      health: Number(bot.health ?? 20),
      hunger: Number(bot.food ?? 20),
      inventory,
      equippedItem: bot.heldItem?.name ?? "air",
      timeOfDay: this.toTimeOfDay(bot.time?.timeOfDay ?? 6000),
      sceneSummary: [
        `Line of sight: ${lineOfSightTarget ?? "none"}.`,
        `Nearby blocks: ${nearbyBlocks.slice(0, 5).join(", ") || "none"}.`,
        `Nearby entities: ${nearbyEntities.slice(0, 3).join(", ") || "none"}.`,
      ].join(" "),
      visibleHazards: this.scanHazards(bot),
      perceivedResources,
      nearbyBlocks,
      nearbyEntities,
      lineOfSightTarget,
      interactionHints,
      goalProgress: this.estimateGoalProgress(userObjective, inventory),
    };
  }

  private async executeLive(
    bot: MineflayerBot,
    intent: SubgoalIntent,
    worldState: WorldState,
  ): Promise<ActionOutcome> {
    const startedAt = Date.now();
    const beforePosition = this.positionFromBot(bot);
    const beforeInventory = this.inventoryMap(this.readInventory(bot));
    const beforeHealth = Number(bot.health ?? worldState.health);
    const beforeHunger = Number(bot.food ?? worldState.hunger);
    let failureReason: string | null = null;
    let status: ActionOutcome["status"] = "success";

    try {
      await this.runAction(bot, intent.candidateAction);
    } catch (error) {
      status = "failed";
      failureReason = error instanceof Error ? error.message : "Mineflayer action failed.";
    }

    const afterInventoryStacks = this.readInventory(bot);
    const afterInventory = this.inventoryMap(afterInventoryStacks);
    const inventoryDelta = this.diffInventory(beforeInventory, afterInventory);
    const positionAfter = this.positionFromBot(bot);
    const positionDelta = {
      x: Number((positionAfter.x - beforePosition.x).toFixed(2)),
      y: Number((positionAfter.y - beforePosition.y).toFixed(2)),
      z: Number((positionAfter.z - beforePosition.z).toFixed(2)),
    };
    const collected = inventoryDelta.reduce((sum, entry) => sum + Math.max(0, entry.countChange), 0);
    const targetCount = Number(intent.candidateAction.arguments.count ?? 1);

    if (status === "success" && intent.candidateAction.name === "collect" && collected < targetCount) {
      status = collected > 0 ? "partial_success" : "failed";
      failureReason =
        collected > 0
          ? `Collected ${collected} of ${targetCount} requested items within the action timeout.`
          : "No matching resource was collected.";
    }

    return parseActionOutcome({
      executedAction: intent.candidateAction,
      status,
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      inventoryDelta,
      healthDelta: Number((Number(bot.health ?? beforeHealth) - beforeHealth).toFixed(2)),
      hungerDelta: Number((Number(bot.food ?? beforeHunger) - beforeHunger).toFixed(2)),
      positionDelta,
      visualVerification: {
        targetReached: status !== "failed",
        terrainChangedAsExpected: intent.candidateAction.name !== "scan" || status !== "failed",
        hazardPresent: this.scanHazards(bot).length > 0,
      },
      failureReason,
      executor: this.kind,
    });
  }

  private async runAction(bot: MineflayerBot, action: CandidateAction): Promise<void> {
    switch (action.name) {
      case "scan":
        await this.scan(bot, String(action.arguments.direction ?? "forward"));
        return;
      case "explore":
        await this.explore(bot, String(action.arguments.direction ?? "forward"));
        return;
      case "collect":
        await this.collect(bot, String(action.arguments.block_type ?? "oak_log"), Number(action.arguments.count ?? 1));
        return;
      case "craft":
        await this.craft(bot, String(action.arguments.item ?? "crafting_table"), Number(action.arguments.count ?? 1));
        return;
      case "smelt":
        await this.smelt(
          bot,
          String(action.arguments.item ?? "iron_ingot"),
          String(action.arguments.input_item ?? "iron_ore"),
          Number(action.arguments.count ?? 1),
        );
        return;
      case "equip":
        await this.equip(bot, String(action.arguments.item ?? "air"));
        return;
      case "place":
        await this.place(bot, String(action.arguments.block_type ?? "oak_planks"), String(action.arguments.location ?? "nearby"));
        return;
      default:
        throw new Error(`Unsupported Mineflayer action: ${action.name}`);
    }
  }

  private async scan(bot: MineflayerBot, direction: string): Promise<void> {
    const baseYaw = bot.entity.yaw;
    const yaw = this.directionToYaw(baseYaw, direction);
    await bot.look(yaw, 0, true);
    await this.sleep(350);
    await bot.look(yaw + Math.PI / 2, 0, true);
    await this.sleep(350);
    await bot.look(yaw - Math.PI / 2, 0, true);
    await this.sleep(350);
    await bot.look(baseYaw, 0, true);
  }

  private async explore(bot: MineflayerBot, direction: string): Promise<void> {
    if (direction === "down") {
      await this.descendForSearch(bot);
      return;
    }

    const movementState = this.requireMovementState();
    const yaw = this.directionToYaw(bot.entity.yaw, direction);
    await bot.look(yaw, 0, true);

    const offset = this.directionOffsetFromYaw(yaw, 6);
    const position = {
      x: Math.floor(bot.entity.position.x + offset.x),
      y: Math.floor(bot.entity.position.y),
      z: Math.floor(bot.entity.position.z + offset.z),
    };
    const goal = new movementState.goals.GoalNear(position.x, position.y, position.z, 1);

    try {
      await this.withTimeout(bot.pathfinder.goto(goal), 8_000, "Explore pathing timed out.");
      return;
    } catch {
      // Fallback to direct controls for simpler early-demo exploration on older versions.
    }

    bot.setControlState("forward", true);
    bot.setControlState("sprint", true);
    await this.sleep(2_500);
    bot.clearControlStates();
  }

  private async descendForSearch(bot: MineflayerBot): Promise<void> {
    const origin = bot.entity.position.floored();
    const forward = this.horizontalStepFromYaw(bot.entity.yaw);
    const footPosition = new Vec3(origin.x + forward.x, origin.y - 1, origin.z + forward.z);
    const headPosition = footPosition.offset(0, 1, 0);
    const upperPosition = footPosition.offset(0, 2, 0);

    for (const target of [upperPosition, headPosition, footPosition]) {
      const block = bot.blockAt(target);
      if (!this.isDiggableSearchBlock(block)) {
        continue;
      }

      await this.gotoBlock(bot, { x: origin.x, y: origin.y, z: origin.z }, 1);
      await bot.lookAt(target.offset(0.5, 0.5, 0.5), true);
      const harvestTool = bot.pathfinder.bestHarvestTool(block);
      if (harvestTool) {
        try {
          await bot.equip(harvestTool, "hand");
        } catch {
          // Keep going if tool equipping fails.
        }
      }
      await this.withTimeout(bot.dig(block, true), this.config.mineflayer.actionTimeoutMs, "Digging staircase timed out.");
      await this.sleep(150);
    }

    const standingBlock = bot.blockAt(footPosition);
    if (standingBlock && this.isSolidPlacementSupport(standingBlock)) {
      throw new Error("Downward exploration could not clear a safe step.");
    }

    await this.gotoBlock(bot, { x: footPosition.x, y: footPosition.y, z: footPosition.z }, 0);
  }

  private async collect(bot: MineflayerBot, blockType: string, count: number): Promise<void> {
    const aliases = this.resourceAliases(blockType);
    let collected = 0;

    while (collected < count) {
      const block = bot.findBlock({
        matching: (candidate: { name?: string }) => {
          const name = candidate.name;
          if (!name) {
            return false;
          }
          return aliases.some((alias) => name === alias || name.endsWith(alias));
        },
        maxDistance: 48,
      });
      if (!block) {
        if (collected > 0) {
          return;
        }
        throw new Error(`Could not find a nearby block matching ${blockType}.`);
      }

      await this.gotoBlock(bot, block.position, 1);
      const harvestTool = bot.pathfinder.bestHarvestTool(block);
      if (harvestTool) {
        try {
          await bot.equip(harvestTool, "hand");
        } catch {
          // Keep going without the tool when equip fails.
        }
      }
      await this.withTimeout(bot.dig(block, true), this.config.mineflayer.actionTimeoutMs, "Digging timed out.");
      collected += 1;
      await this.sleep(250);
    }
  }

  private async craft(bot: MineflayerBot, itemName: string, count: number): Promise<void> {
    const normalizedItemName = this.normalizeLegacyItemName(itemName);
    const item = bot.registry.itemsByName[normalizedItemName];
    if (!item) {
      throw new Error(`Unknown craft item: ${itemName}`);
    }

    const needsWorkstation = requiresPlacedCraftingTable(normalizedItemName);
    let heldTableBlock =
      normalizedItemName === "crafting_table" ? null : this.findNearbyCraftingTableBlock(bot);

    if (needsWorkstation && !heldTableBlock) {
      throw new Error(`No available recipe for ${itemName}. Place a crafting table nearby first.`);
    }

    if (heldTableBlock) {
      await this.gotoBlock(bot, heldTableBlock.position, 2);
      heldTableBlock = this.findNearbyCraftingTableBlock(bot, 8) ?? heldTableBlock;
    }

    const recipes = bot.recipesFor(item.id, null, count, heldTableBlock ?? null);
    const recipe = recipes[0];
    if (!recipe) {
      throw new Error(
        needsWorkstation
          ? `No available recipe for ${itemName}. Place a crafting table nearby first.`
          : `No available recipe for ${itemName}.`,
      );
    }

    await this.withTimeout(bot.craft(recipe, count, heldTableBlock ?? null), this.config.mineflayer.actionTimeoutMs, "Crafting timed out.");
  }

  private findNearbyCraftingTableBlock(bot: MineflayerBot, maxDistance = 32) {
    return bot.findBlock({
      matching: (block: { name?: string }) => block.name === "crafting_table",
      maxDistance,
    });
  }

  private findNearbyFurnaceBlock(bot: MineflayerBot, maxDistance = 32) {
    return bot.findBlock({
      matching: (block: { name?: string }) => block.name === "furnace",
      maxDistance,
    });
  }

  private findFuelItem(bot: MineflayerBot): { name: string; count: number } | null {
    const inventoryItems = bot.inventory.items();
    return inventoryItems.find((entry) => ["coal", "charcoal", "planks", "log", "wood"].includes(entry.name)) ?? null;
  }

  private smeltableInventoryInputs(bot: MineflayerBot): string[] {
    const inventoryNames = new Set(bot.inventory.items().map((entry) => entry.name));
    return ["iron_ore", "gold_ore", "sand", "cobblestone"].filter((item) => inventoryNames.has(item));
  }

  private async smelt(bot: MineflayerBot, outputItemName: string, inputItemName: string, count: number): Promise<void> {
    const furnace = this.findNearbyFurnaceBlock(bot);
    if (!furnace) {
      throw new Error("No nearby furnace is available for smelting.");
    }

    const normalizedInput = this.normalizeLegacyItemName(inputItemName);
    const inputItem = bot.inventory.items().find((entry) => entry.name === normalizedInput);
    if (!inputItem) {
      throw new Error(`Cannot smelt ${outputItemName}; ${inputItemName} is not in inventory.`);
    }

    const fuelItem = this.findFuelItem(bot);
    if (!fuelItem) {
      throw new Error("Cannot smelt items because no furnace fuel is available.");
    }

    await this.gotoBlock(bot, furnace.position, 2);
    const furnaceWindow = await this.withTimeout(bot.openFurnace(furnace), 8_000, "Opening furnace timed out.");

    try {
      await this.withTimeout(furnaceWindow.putInput(inputItem.type ?? inputItem, null, Math.min(count, inputItem.count)), 8_000, "Loading furnace input timed out.");
      await this.withTimeout(furnaceWindow.putFuel(fuelItem.type ?? fuelItem, null, 1), 8_000, "Loading furnace fuel timed out.");
      await this.waitForSmeltOutput(furnaceWindow, count);
      await this.withTimeout(furnaceWindow.takeOutput(), 8_000, "Taking furnace output timed out.");
    } finally {
      furnaceWindow.close();
    }
  }

  private async waitForSmeltOutput(furnaceWindow: OpenedFurnace, count: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < this.config.mineflayer.actionTimeoutMs) {
      const outputCount = Number(furnaceWindow.outputItem()?.count ?? 0);
      if (outputCount >= count || outputCount > 0) {
        return;
      }
      await this.sleep(250);
    }

    throw new Error("Smelting timed out before output became available.");
  }

  private findInventoryItem(bot: MineflayerBot, itemName: string) {
    return bot.inventory.items().find((entry) => entry.name === itemName) ?? null;
  }

  private async equipInventoryItem(bot: MineflayerBot, itemName: string): Promise<void> {
    const item = this.findInventoryItem(bot, itemName);
    if (!item) {
      throw new Error(`Item not in inventory: ${itemName}`);
    }
    await this.withTimeout(bot.equip(item, "hand"), 5_000, "Equip timed out.");
  }

  private async equip(bot: MineflayerBot, itemName: string): Promise<void> {
    const normalizedItemName = this.normalizeLegacyItemName(itemName);
    await this.equipInventoryItem(bot, normalizedItemName);
  }

  private async place(bot: MineflayerBot, blockType: string, location: string): Promise<void> {
    const normalizedBlockType = this.normalizeLegacyItemName(blockType);
    if (!this.findInventoryItem(bot, normalizedBlockType)) {
      throw new Error(`Cannot place ${blockType}; it is not in inventory.`);
    }

    if (!bot.registry.blocksByName?.[normalizedBlockType]) {
      await this.usePlaceableItem(bot, normalizedBlockType, location);
      return;
    }

    const placementTargets = this.sortPlacementTargetsAwayFromBot(
      bot,
      this.resolveAllPlacementTargets(bot, normalizedBlockType, location),
    );
    const failureReasons: string[] = [];

    for (const target of placementTargets) {
      try {
        await this.preparePlacementClearance(bot, target);
        await this.equipInventoryItem(bot, normalizedBlockType);
        await bot.lookAt(target.clickTarget, true);
        try {
          await this.withTimeout(target.execute(bot), this.config.mineflayer.actionTimeoutMs, "Place action timed out.");
        } catch (error) {
          if (!this.placementSucceeded(bot, target, normalizedBlockType)) {
            throw error;
          }
        }
        if (!this.placementSucceeded(bot, target, normalizedBlockType)) {
          throw new Error(`Placement did not result in a ${normalizedBlockType} block at the target position.`);
        }
        return;
      } catch (error) {
        failureReasons.push(error instanceof Error ? error.message : "Unknown placement failure.");
      }
    }

    throw new Error(
      failureReasons.length > 0
        ? `Unable to find a valid nearby placement spot for ${blockType}: ${failureReasons.join(" | ")}`
        : `Unable to find a valid nearby placement spot for ${blockType}.`,
    );
  }

  private async usePlaceableItem(bot: MineflayerBot, itemName: string, location: string): Promise<void> {
    const needsWater = /water|river|lake|ocean|pond/i.test(location);
    const target = needsWater
      ? bot.findBlock({
          matching: (block) => block.name === "water" || block.name === "flowing_water",
          maxDistance: 24,
        })
      : bot.blockAtCursor?.(6) ?? null;
    if (!target) {
      throw new Error(`No reachable ${needsWater ? "water" : "interaction"} target is available for ${itemName}.`);
    }

    if (needsWater && bot.entity.position.distanceTo(target.position) > 5) {
      await this.gotoBlock(bot, target.position, 3);
    }
    const beforeCount = this.findInventoryItem(bot, itemName)?.count ?? 0;
    await this.equipInventoryItem(bot, itemName);
    await bot.lookAt(new Vec3(target.position.x + 0.5, target.position.y + 0.8, target.position.z + 0.5), true);
    bot.activateItem();
    await this.sleep(800);

    const afterCount = this.findInventoryItem(bot, itemName)?.count ?? 0;
    if (afterCount >= beforeCount) {
      throw new Error(`Using ${itemName} did not consume or place the item at the selected target.`);
    }
  }

  private resolveAllPlacementTargets(
    bot: MineflayerBot,
    blockType: string,
    location: string,
  ): PlacementAttempt[] {
    if (this.isTallPlacementBlock(blockType)) {
      return this.findTallBlockPlacementTargets(bot, location);
    }

    return this.findFlatBlockPlacementTargets(bot, location);
  }

  private isTallPlacementBlock(blockType: string): boolean {
    return blockType.includes("door");
  }

  private async preparePlacementClearance(bot: MineflayerBot, target: PlacementAttempt): Promise<void> {
    if (this.botOccupiesAnyBlock(bot, target.occupiedBlocks)) {
      await this.stepClearOfBlocks(bot, target.occupiedBlocks);
    }

    await this.clearPlacementBlocks(bot, target.occupiedBlocks);

    if (target.standPosition && !this.isAdjacentStandPosition(bot, target.standPosition)) {
      await this.gotoBlock(bot, target.standPosition, 0);
    }
  }

  private async clearPlacementBlocks(bot: MineflayerBot, occupiedBlocks: Vec3[]): Promise<void> {
    for (const position of occupiedBlocks) {
      const block = bot.blockAt(position);
      if (!this.isClearablePlacementBlock(block)) {
        continue;
      }

      const harvestTool = bot.pathfinder.bestHarvestTool(block);
      if (harvestTool) {
        try {
          await bot.equip(harvestTool, "hand");
        } catch {
          // Keep going if tool equipping fails.
        }
      }
      await bot.lookAt(position.offset(0.5, 0.5, 0.5), true);
      await this.withTimeout(bot.dig(block, true), this.config.mineflayer.actionTimeoutMs, "Clearing placement space timed out.");
      await this.sleep(150);
    }
  }

  private sortPlacementTargetsAwayFromBot(bot: MineflayerBot, targets: PlacementAttempt[]): PlacementAttempt[] {
    return [...targets].sort((left, right) => {
      const leftBlocked = this.botOccupiesAnyBlock(bot, left.occupiedBlocks) ? 1 : 0;
      const rightBlocked = this.botOccupiesAnyBlock(bot, right.occupiedBlocks) ? 1 : 0;
      if (leftBlocked !== rightBlocked) {
        return leftBlocked - rightBlocked;
      }

      const leftDistance = bot.entity.position.distanceTo(left.clickTarget);
      const rightDistance = bot.entity.position.distanceTo(right.clickTarget);
      return leftDistance - rightDistance;
    });
  }

  private botOccupiesAnyBlock(bot: MineflayerBot, blocks: Vec3[]): boolean {
    return blocks.some((block) => this.botOccupiesBlock(bot, block));
  }

  private botOccupiesBlock(bot: MineflayerBot, block: Vec3): boolean {
    const feet = this.botFeetBlock(bot);
    const head = feet.offset(0, 1, 0);
    return (
      this.blockTooCloseToBot(bot, block) ||
      this.sameBlock(feet, block) ||
      this.sameBlock(head, block)
    );
  }

  private sameBlock(
    left: { x: number; y: number; z: number },
    right: { x: number; y: number; z: number },
  ): boolean {
    return left.x === right.x && left.y === right.y && left.z === right.z;
  }

  private botFeetBlock(bot: MineflayerBot): Vec3 {
    return bot.entity.position.floored();
  }

  private blockTooCloseToBot(bot: MineflayerBot, position: Vec3): boolean {
    const center = position.offset(0.5, 0.5, 0.5);
    return bot.entity.position.distanceTo(center) < 1.15;
  }

  private isAdjacentStandPosition(
    bot: MineflayerBot,
    standPosition: { x: number; y: number; z: number },
  ): boolean {
    const feet = bot.entity.position.floored();
    return (
      Math.abs(feet.x - standPosition.x) <= 1 &&
      Math.abs(feet.z - standPosition.z) <= 1 &&
      Math.abs(feet.y - standPosition.y) <= 1
    );
  }

  private async stepClearOfBlocks(bot: MineflayerBot, occupiedBlocks: Vec3[]): Promise<void> {
    if (!this.botOccupiesAnyBlock(bot, occupiedBlocks)) {
      return;
    }

    const anchor = occupiedBlocks[0] ?? this.botFeetBlock(bot);
    const candidates = [
      anchor.offset(2, 0, 0),
      anchor.offset(-2, 0, 0),
      anchor.offset(0, 0, 2),
      anchor.offset(0, 0, -2),
      anchor.offset(2, 0, 2),
      anchor.offset(-2, 0, 2),
      anchor.offset(2, 0, -2),
      anchor.offset(-2, 0, -2),
    ];

    for (const candidate of candidates) {
      try {
        await this.gotoBlock(bot, candidate, 0);
        if (!this.botOccupiesAnyBlock(bot, occupiedBlocks)) {
          return;
        }
      } catch {
        continue;
      }
    }
  }

  private findFlatBlockPlacementTargets(bot: MineflayerBot, location: string): PlacementAttempt[] {
    return this.resolvePlacementTargets(bot, location)
      .map((target) => {
        const targetPosition = new Vec3(
          target.support.position.x,
          target.support.position.y + 1,
          target.support.position.z,
        );

        return {
          occupiedBlocks: [targetPosition],
          clickTarget: target.targetCenter,
          execute: async (activeBot: MineflayerBot) => {
            await activeBot.placeBlock(target.support, new Vec3(0, 1, 0));
          },
        };
      });
  }

  private placementSucceeded(bot: MineflayerBot, target: PlacementAttempt, blockType: string): boolean {
    return target.occupiedBlocks.some((position) => {
      const block = bot.blockAt(position) as BotBlock | null;
      return (block?.name ?? "") === blockType;
    });
  }

  private findTallBlockPlacementTargets(bot: MineflayerBot, location: string): PlacementAttempt[] {
    const origin = bot.entity.position.floored();
    const horizontalOffsets = location === "ahead"
      ? [
          { x: 0, z: 1 },
          { x: 1, z: 1 },
          { x: -1, z: 1 },
          { x: 1, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: -1 },
        ]
      : [
          { x: 0, z: 1 },
          { x: 1, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: -1 },
          { x: 1, z: 1 },
          { x: -1, z: 1 },
          { x: 1, z: -1 },
          { x: -1, z: -1 },
        ];
    const targets: PlacementAttempt[] = [];

    for (const offset of horizontalOffsets) {
      const bottomPosition = new Vec3(origin.x + offset.x, origin.y, origin.z + offset.z);
      const topPosition = bottomPosition.offset(0, 1, 0);
      if (this.botOccupiesAnyBlock(bot, [bottomPosition, topPosition])) {
        continue;
      }

      const bottomBlock = bot.blockAt(bottomPosition);
      const topBlock = bot.blockAt(topPosition);
      if (!this.isReplaceablePlacementSpace(bottomBlock) || !this.isReplaceablePlacementSpace(topBlock)) {
        continue;
      }

      const groundBelowDoor = bot.blockAt(bottomPosition.offset(0, -1, 0));
      if (!this.isSolidPlacementSupport(groundBelowDoor)) {
        continue;
      }

      for (const face of [
        new Vec3(1, 0, 0),
        new Vec3(-1, 0, 0),
        new Vec3(0, 0, 1),
        new Vec3(0, 0, -1),
      ]) {
        const reference = bot.blockAt(bottomPosition.minus(face));
        if (!this.isSolidPlacementSupport(reference)) {
          continue;
        }

        const standPosition = bottomPosition.plus(face.scaled(2));
        targets.push({
          occupiedBlocks: [bottomPosition, topPosition],
          standPosition: { x: standPosition.x, y: standPosition.y, z: standPosition.z },
          clickTarget: bottomPosition.offset(0.5, 0.5, 0.5),
          execute: async (activeBot: MineflayerBot) => {
            await activeBot.placeBlock(reference, face);
          },
        });

        if (groundBelowDoor) {
          targets.push({
            occupiedBlocks: [bottomPosition, topPosition],
            standPosition: { x: standPosition.x, y: standPosition.y, z: standPosition.z },
            clickTarget: groundBelowDoor.position.offset(0.5, 1, 0.5),
            execute: async (activeBot: MineflayerBot) => {
              await activeBot.placeBlock(groundBelowDoor, new Vec3(0, 1, 0));
            },
          });
        }
      }
    }

    return dedupePlacementAttempts(targets);
  }

  private resolvePlacementTargets(
    bot: MineflayerBot,
    location: string,
  ): Array<{
    support: BotBlock;
    targetCenter: Vec3;
  }> {
    if (location === "nearby") {
      return dedupePlacementTargets([
        ...this.findPlacementTargets(bot, "underfoot"),
        ...this.findPlacementTargets(bot, "ahead"),
      ]);
    }

    if (location === "ahead") {
      return dedupePlacementTargets([
        ...this.findPlacementTargets(bot, "underfoot"),
        ...this.findPlacementTargets(bot, "ahead"),
      ]);
    }

    return this.findPlacementTargets(bot, location);
  }

  private async gotoBlock(bot: MineflayerBot, position: { x: number; y: number; z: number }, range: number): Promise<void> {
    const movementState = this.requireMovementState();
    const goal = new movementState.goals.GoalNear(position.x, position.y, position.z, range);
    await this.withTimeout(bot.pathfinder.goto(goal), this.config.mineflayer.actionTimeoutMs, "Pathing timed out.");
  }

  private requireMovementState(): MovementState {
    if (!this.movementState) {
      throw new Error("Mineflayer movement state is not initialized.");
    }
    return this.movementState;
  }

  private readInventory(bot: MineflayerBot): InventoryStack[] {
    const aggregated = new Map<string, number>();
    for (const item of bot.inventory.items()) {
      aggregated.set(item.name, (aggregated.get(item.name) ?? 0) + item.count);
    }

    return [...aggregated.entries()].map(([item, count]) => ({ item, count }));
  }

  private inventoryMap(inventory: InventoryStack[]): Map<string, number> {
    return new Map(inventory.map((stack) => [stack.item, stack.count]));
  }

  private diffInventory(before: Map<string, number>, after: Map<string, number>) {
    const items = new Set([...before.keys(), ...after.keys()]);
    return [...items]
      .map((item) => ({
        item,
        countChange: (after.get(item) ?? 0) - (before.get(item) ?? 0),
      }))
      .filter((entry) => entry.countChange !== 0);
  }

  private positionFromBot(bot: MineflayerBot): Position3 {
    return {
      x: Number(bot.entity.position.x.toFixed(2)),
      y: Number(bot.entity.position.y.toFixed(2)),
      z: Number(bot.entity.position.z.toFixed(2)),
    };
  }

  private scanResources(bot: MineflayerBot): string[] {
    const resources = new Set<string>();
    const candidates = [
      { label: "oak_tree", aliases: ["oak_log", "oak_leaves", "spruce_log", "birch_log", "log", "log2", "leaves", "leaves2"] },
      { label: "stone_outcrop", aliases: ["stone", "cobblestone", "stonebrick", "stone_brick_stairs"] },
      { label: "crafting_table", aliases: ["crafting_table"] },
      { label: "water", aliases: ["water"] },
      { label: "coal_ore", aliases: ["coal_ore", "deepslate_coal_ore"] },
    ];

    for (const candidate of candidates) {
      const found = bot.findBlock({
        matching: (block: { name?: string }) =>
          Boolean(block.name && candidate.aliases.some((alias) => block.name === alias)),
        maxDistance: 24,
      });
      if (found) {
        resources.add(candidate.label);
      }
    }

    if (resources.size === 0) {
      resources.add("unknown_resources");
    }

    return [...resources];
  }

  private scanNearbyBlocks(bot: MineflayerBot): string[] {
    const blockNames = new Set<string>();
    const candidates = [
      "stone",
      "cobblestone",
      "coal_ore",
      "iron_ore",
      "crafting_table",
      "log",
      "log2",
      "leaves",
      "dirt",
      "grass",
      "sand",
      "water",
    ];

    for (const candidate of candidates) {
      const found = bot.findBlock({
        matching: (block: { name?: string }) => block.name === candidate,
        maxDistance: 16,
      });
      if (found?.name) {
        blockNames.add(found.name);
      }
    }

    return [...blockNames];
  }

  private scanNearbyEntities(bot: MineflayerBot): string[] {
    return Object.values(bot.entities)
      .filter((entity) => entity.position.distanceTo(bot.entity.position) <= 16)
      .map((entity) => {
        const label = entity.name ?? entity.type ?? "unknown_entity";
        const distance = entity.position.distanceTo(bot.entity.position).toFixed(1);
        return `${label}@${distance}`;
      })
      .slice(0, 8);
  }

  private readLineOfSightTarget(bot: MineflayerBot): string | null {
    const lookedBlock = bot.blockAtCursor?.(16);
    if (lookedBlock?.name) {
      return lookedBlock.name;
    }

    const nearestInterestingBlock = bot.findBlock({
      matching: (block: { name?: string }) => Boolean(block.name && block.name !== "air"),
      maxDistance: 6,
    });
    return nearestInterestingBlock?.name ?? null;
  }

  private buildInteractionHints(
    bot: MineflayerBot,
    inventory: InventoryStack[],
    perceivedResources: string[],
    nearbyBlocks: string[],
  ): string[] {
    const hints = new Set<string>();
    const count = (aliases: string[]) =>
      inventory
        .filter((stack) => aliases.includes(stack.item))
        .reduce((sum, stack) => sum + stack.count, 0);

    if (count(["crafting_table"]) > 0) {
      hints.add("crafting_table_in_inventory");
      const underfootTargets = this.findPlacementTargets(bot, "underfoot");
      const aheadTargets = this.findPlacementTargets(bot, "ahead");
      if (underfootTargets.length > 0) {
        hints.add("can_place_crafting_table_underfoot");
      }
      if (underfootTargets.length > 0 || aheadTargets.length > 0) {
        hints.add("can_place_crafting_table");
      }
    }
    if (count(["wooden_door", "door"]) > 0) {
      hints.add("wooden_door_in_inventory");
      if (this.findTallBlockPlacementTargets(bot, "nearby").length > 0) {
        hints.add("can_place_wooden_door");
        hints.add("can_place_door");
      }
    }
    if (count(["furnace"]) > 0) {
      hints.add("furnace_in_inventory");
      if (this.findFlatBlockPlacementTargets(bot, "nearby").length > 0) {
        hints.add("can_place_furnace");
      }
    }
    const nearbyCraftingTable = this.findNearbyCraftingTableBlock(bot);
    const nearbyFurnace = this.findNearbyFurnaceBlock(bot);
    if (nearbyCraftingTable || nearbyBlocks.includes("crafting_table")) {
      hints.add("crafting_table_nearby");
    }
    if (nearbyFurnace || nearbyBlocks.includes("furnace")) {
      hints.add("furnace_nearby");
    }
    if (perceivedResources.includes("stone_outcrop") || nearbyBlocks.includes("stone")) {
      hints.add("stone_visible");
    }
    if (perceivedResources.includes("oak_tree") || nearbyBlocks.includes("log") || nearbyBlocks.includes("log2")) {
      hints.add("tree_visible");
    }
    if (count(["planks"]) >= 2) {
      hints.add("can_craft_sticks");
    }
    const hasWorkstationAccess = Boolean(nearbyCraftingTable || nearbyBlocks.includes("crafting_table"));
    if (count(["planks"]) >= 3 && count(["stick"]) >= 2 && hasWorkstationAccess) {
      hints.add("can_craft_wooden_pickaxe");
    }
    if (count(["cobblestone"]) >= 3 && count(["stick"]) >= 2 && hasWorkstationAccess) {
      hints.add("can_craft_stone_pickaxe");
    }
    if ((nearbyFurnace || nearbyBlocks.includes("furnace")) && this.findFuelItem(bot)) {
      const smeltableInputs = this.smeltableInventoryInputs(bot);
      if (smeltableInputs.length > 0) {
        hints.add("can_smelt");
      }
      for (const inputItem of smeltableInputs) {
        hints.add(`can_smelt_${inputItem}`);
      }
    }
    if (/(pickaxe)/i.test(bot.heldItem?.name ?? "")) {
      hints.add("holding_pickaxe");
    }
    hints.add("structured_perception_only");
    return [...hints];
  }

  private scanHazards(bot: MineflayerBot): string[] {
    const hazards = new Set<string>();
    if (bot.health <= 8) {
      hazards.add("low_health");
    }
    if (bot.food <= 6) {
      hazards.add("low_hunger");
    }
    const lava = bot.findBlock({
      matching: (block: { name?: string }) => block.name === "lava",
      maxDistance: 12,
    });
    if (lava) {
      hazards.add("lava_nearby");
    }
    const hostileMobNearby = Object.values(bot.entities).some((entity) =>
      entity.type === "mob" &&
      entity.position.distanceTo(bot.entity.position) < 12 &&
      /(zombie|skeleton|creeper|spider|drowned|witch|enderman)/i.test(entity.name ?? ""),
    );
    if (hostileMobNearby) {
      hazards.add("hostile_mob_nearby");
    }
    return [...hazards];
  }

  private estimateGoalProgress(userObjective: string, inventory: InventoryStack[]): number {
    const countItem = (aliases: string[]) =>
      inventory
        .filter((stack) => aliases.includes(stack.item))
        .reduce((sum, stack) => sum + stack.count, 0);
    const normalized = userObjective.toLowerCase();
    if (normalized.includes("diamond")) {
      if (countItem(["diamond_pickaxe"]) > 0 || countItem(["diamond"]) > 0) return 1;
      if (countItem(["iron_pickaxe"]) > 0) return 0.8;
      if (countItem(["stone_pickaxe"]) > 0) return 0.55;
      if (countItem(["wooden_pickaxe"]) > 0) return 0.35;
      if (countItem(["crafting_table"]) > 0) return 0.2;
    }
    if (normalized.includes("pickaxe")) {
      if (countItem(["stone_pickaxe"]) > 0 || countItem(["wooden_pickaxe"]) > 0) return 1;
      if (countItem(["crafting_table"]) > 0) return 0.7;
      if (countItem(["oak_log", "log"]) >= 3 || countItem(["oak_planks", "planks"]) >= 4) return 0.35;
    }
    if (normalized.includes("crafting table") && countItem(["crafting_table"]) > 0) return 1;
    if (countItem(["oak_log", "log"]) > 0) return 0.2;
    return 0.05;
  }

  private toTimeOfDay(ticks: number): WorldState["timeOfDay"] {
    const normalized = ((ticks % 24000) + 24000) % 24000;
    if (normalized < 1000 || normalized >= 23000) return "sunrise";
    if (normalized < 12000) return "day";
    if (normalized < 13000) return "sunset";
    return "night";
  }

  private directionToYaw(currentYaw: number, direction: string): number {
    switch (direction) {
      case "left":
        return currentYaw + Math.PI / 2;
      case "right":
        return currentYaw - Math.PI / 2;
      case "back":
      case "backward":
        return currentYaw + Math.PI;
      case "forward_left":
        return currentYaw + Math.PI / 4;
      case "forward_right":
        return currentYaw - Math.PI / 4;
      default:
        return currentYaw;
    }
  }

  private directionOffset(direction: string): { x: number; z: number } {
    switch (direction) {
      case "left":
        return { x: -6, z: 0 };
      case "right":
        return { x: 6, z: 0 };
      case "back":
      case "backward":
        return { x: 0, z: 6 };
      case "forward_left":
        return { x: -4, z: -4 };
      case "forward_right":
        return { x: 4, z: -4 };
      default:
        return { x: 0, z: -6 };
    }
  }

  private directionOffsetFromYaw(yaw: number, distance: number): { x: number; z: number } {
    return {
      x: -Math.sin(yaw) * distance,
      z: Math.cos(yaw) * distance,
    };
  }

  private horizontalStepFromYaw(yaw: number): { x: number; z: number } {
    const offset = this.directionOffsetFromYaw(yaw, 1);
    const x = Math.round(offset.x);
    const z = Math.round(offset.z);
    if (x === 0 && z === 0) {
      return { x: 0, z: 1 };
    }
    return { x, z };
  }

  private resourceAliases(blockType: string): string[] {
    if (blockType === "oak_log") {
      return ["oak_log", "birch_log", "spruce_log", "jungle_log", "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log", "log", "log2"];
    }
    return [blockType];
  }

  private normalizeLegacyItemName(itemName: string): string {
    switch (itemName) {
      case "oak_planks":
        return "planks";
      case "oak_log":
        return "log";
      case "door":
        return "wooden_door";
      default:
        return itemName;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private findPlacementTargets(
    bot: MineflayerBot,
    location: string,
  ): Array<{
    support: BotBlock;
    targetCenter: Vec3;
  }> {
    const origin = bot.entity.position.floored();
    const preferredOffsets = location === "underfoot" || location === "nearby"
      ? [
          { x: 0, z: 1 },
          { x: 1, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: -1 },
          { x: 1, z: 1 },
          { x: -1, z: 1 },
          { x: 1, z: -1 },
          { x: -1, z: -1 },
        ]
      : [
          { x: 0, z: 1 },
          { x: 1, z: 1 },
          { x: -1, z: 1 },
          { x: 1, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: -1 },
        ];

    const targets: Array<{ support: BotBlock; targetCenter: Vec3 }> = [];
    for (const offset of preferredOffsets) {
      const supportPosition = new Vec3(origin.x + offset.x, origin.y - 1, origin.z + offset.z);
      const support = bot.blockAt(supportPosition);
      if (!this.isSolidPlacementSupport(support)) {
        continue;
      }

      const targetPosition = new Vec3(supportPosition.x, supportPosition.y + 1, supportPosition.z);
      const targetBlock = bot.blockAt(targetPosition);
      if (!this.isPlaceableOrClearableSpace(targetBlock)) {
        continue;
      }

      targets.push({
        support,
        targetCenter: targetPosition.offset(0.5, 0.5, 0.5),
      });
    }

    return targets;
  }

  private isSolidPlacementSupport(block: unknown): block is BotBlock {
    const candidate = block as BotBlock | null;
    if (!candidate?.position || !candidate.name) {
      return false;
    }

    return !["air", "cave_air", "void_air", "water", "lava"].includes(candidate.name);
  }

  private isReplaceablePlacementSpace(block: unknown): boolean {
    const candidate = block as BotBlock | null;
    return !candidate || ["air", "cave_air", "void_air", "tallgrass", "snow"].includes(candidate.name ?? "air");
  }

  private isClearablePlacementBlock(block: unknown): block is BotBlock {
    const candidate = block as BotBlock | null;
    if (!candidate?.name || !candidate.position) {
      return false;
    }

    return !this.isReplaceablePlacementSpace(candidate) && ![
      "bedrock",
      "water",
      "flowing_water",
      "lava",
      "flowing_lava",
    ].includes(candidate.name);
  }

  private isPlaceableOrClearableSpace(block: unknown): boolean {
    return this.isReplaceablePlacementSpace(block) || this.isClearablePlacementBlock(block);
  }

  private isDiggableSearchBlock(block: unknown): block is BotBlock {
    const candidate = block as BotBlock | null;
    if (!candidate?.name || !candidate.position) {
      return false;
    }

    return ![
      "air",
      "cave_air",
      "void_air",
      "water",
      "flowing_water",
      "lava",
      "flowing_lava",
      "bedrock",
    ].includes(candidate.name);
  }
}

function dedupePlacementTargets(
  targets: Array<{ support: BotBlock; targetCenter: Vec3 }>,
): Array<{ support: BotBlock; targetCenter: Vec3 }> {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.support.position.x},${target.support.position.y},${target.support.position.z}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupePlacementAttempts(targets: PlacementAttempt[]): PlacementAttempt[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = target.occupiedBlocks
      .map((block) => `${block.x},${block.y},${block.z}`)
      .join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

interface PlacementAttempt {
  occupiedBlocks: Vec3[];
  standPosition?: { x: number; y: number; z: number };
  clickTarget: Vec3;
  execute: (bot: MineflayerBot) => Promise<void>;
}

interface BotBlock {
  name?: string;
  position: { x: number; y: number; z: number };
}

interface MineflayerBot {
  player?: unknown;
  game: { dimension?: string };
  time?: { timeOfDay?: number };
  health: number;
  food: number;
  heldItem: { name: string } | null;
  entity: {
    position: {
      x: number;
      y: number;
      z: number;
      offset(x: number, y: number, z: number): {
        x: number;
        y: number;
        z: number;
        floored(): { x: number; y: number; z: number };
      };
      floored(): { x: number; y: number; z: number };
      distanceTo(other: { x: number; y: number; z: number }): number;
    };
    yaw: number;
    pitch: number;
  };
  inventory: {
    items(): Array<{ name: string; count: number; type?: number }>;
  };
  registry: {
    itemsByName: Record<string, { id: number }>;
    blocksByName?: Record<string, { id: number }>;
  };
  entities: Record<string, { type?: string; name?: string; position: { distanceTo(other: { x: number; y: number; z: number }): number } }>;
  pathfinder: {
    setMovements(movements: MovementState["movements"]): void;
    goto(goal: unknown): Promise<void>;
    bestHarvestTool(block: unknown): { name: string; count: number } | null;
  };
  loadPlugin(plugin: (bot: MineflayerBot) => void): void;
  setControlState(control: string, state: boolean): void;
  clearControlStates(): void;
  once(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  quit(reason?: string): void;
  findBlock(options: {
    matching: (block: { name?: string }) => boolean;
    maxDistance: number;
  }): { name?: string; position: { x: number; y: number; z: number } } | null;
  dig(block: unknown, forceLook?: boolean): Promise<void>;
  recipesFor(itemId: number, metadata: number | null, count: number, craftingTable: unknown): unknown[];
  craft(recipe: unknown, count: number, craftingTable: unknown): Promise<void>;
  openFurnace(block: unknown): Promise<OpenedFurnace>;
  equip(item: unknown, destination: string): Promise<void>;
  activateItem(): void;
  look(yaw: number, pitch: number, force?: boolean): Promise<void>;
  lookAt(position: { x: number; y: number; z: number }, force?: boolean): Promise<void>;
  placeBlock(referenceBlock: unknown, faceVector: { x: number; y: number; z: number }): Promise<void>;
  blockAt(position: { x: number; y: number; z: number }): unknown | null;
  blockAtCursor?(maxDistance: number): { name?: string; position: { x: number; y: number; z: number } } | null;
}

interface MovementState {
  movements: {
    allow1by1towers: boolean;
    canDig: boolean;
    allowParkour: boolean;
    allowSprinting: boolean;
    allowFreeMotion: boolean;
  };
  goals: {
    GoalNear: new (x: number, y: number, z: number, range: number) => unknown;
  };
}

interface OpenedFurnace {
  putInput(itemType: unknown, metadata: number | null, count: number): Promise<void>;
  putFuel(itemType: unknown, metadata: number | null, count: number): Promise<void>;
  takeOutput(): Promise<void>;
  outputItem(): { count?: number } | null;
  close(): void;
}
