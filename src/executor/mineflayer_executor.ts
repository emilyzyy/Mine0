import type { ActionOutcome, CandidateAction, InventoryStack, Position3, SubgoalIntent, WorldState } from "../contracts/index.ts";
import { parseActionOutcome, parseWorldState } from "../contracts/index.ts";
import { loadPlannerConfig } from "../shared/config.ts";
import { projectPath } from "../shared/fs.ts";
import { MockMinecraftWorld } from "./mock_world.ts";
import type { ExecutorBackend, ExecutorObservation } from "./executor_interface.ts";

export class MineflayerExecutor implements ExecutorBackend {
  readonly kind = "mineflayer" as const;
  private activeBackend: "live" | "mock" = "mock";

  get displayName(): string {
    return this.activeBackend === "live"
      ? "Mineflayer + prismarine-viewer"
      : "Mineflayer + prismarine-viewer (mock)";
  }

  private readonly config = loadPlannerConfig();
  private readonly world = new MockMinecraftWorld("mineflayer");
  private bot: MineflayerBot | null = null;
  private movementState: MovementState | null = null;
  private viewerStarted = false;
  private screenshotSequence = 0;
  private headlessCaptureUnavailableReason: string | null = null;
  private readonly liveMode = this.config.mineflayer.enabled && Boolean(this.config.mineflayer.host);

  async observe(userObjective: string): Promise<ExecutorObservation> {
    if (this.liveMode) {
      const bot = await this.ensureBot();
      this.activeBackend = "live";
      const screenshotPath = await this.captureLiveScreenshot(bot);
      return {
        worldState: parseWorldState(this.snapshotLiveWorld(bot, userObjective, screenshotPath)),
      };
    }

    this.activeBackend = "mock";
    const screenshotPath = await this.world.captureFrame();
    return {
      worldState: parseWorldState(this.world.snapshot(userObjective, null, screenshotPath)),
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
    this.headlessCaptureUnavailableReason = null;
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

    if (this.config.mineflayer.viewerEnabled && !this.viewerStarted) {
      const viewerModule = await import("prismarine-viewer");
      const mineflayerViewer = ((viewerModule as Record<string, unknown>).mineflayer ??
        (viewerModule.default as Record<string, unknown> | undefined)?.mineflayer) as
        | ((bot: MineflayerBot, options: Record<string, unknown>) => void)
        | undefined;
      if (mineflayerViewer) {
        mineflayerViewer(bot, {
          port: this.config.mineflayer.viewerPort,
          firstPerson: this.config.mineflayer.viewerFirstPerson,
          viewDistance: 6,
        });
        this.viewerStarted = true;
      }
    }

    this.bot = bot;
    this.movementState = movementState;
    return bot;
  }

  private async captureLiveScreenshot(bot: MineflayerBot): Promise<string> {
    if (!this.config.mineflayer.headlessCaptureEnabled || this.headlessCaptureUnavailableReason) {
      return this.world.captureFrame();
    }

    try {
      const screenshotDirectory = projectPath(this.config.screenshotDirectory, "mineflayer-live");
      await import("node:fs/promises").then(({ mkdir }) => mkdir(screenshotDirectory, { recursive: true }));
      const frameBuffer = await this.captureSingleHeadlessFrame(bot);
      const screenshotPath = projectPath(
        this.config.screenshotDirectory,
        "mineflayer-live",
        `frame_${String(++this.screenshotSequence).padStart(4, "0")}.jpg`,
      );
      await import("node:fs/promises").then(({ writeFile }) => writeFile(screenshotPath, frameBuffer));
      return screenshotPath;
    } catch (error) {
      this.headlessCaptureUnavailableReason =
        error instanceof Error ? error.message : "Headless POV capture failed.";
      return this.world.captureFrame();
    }
  }

  private async captureSingleHeadlessFrame(bot: MineflayerBot): Promise<Buffer> {
    const viewerModule = await import("prismarine-viewer");
    const headlessViewer = ((viewerModule as Record<string, unknown>).headless ??
      (viewerModule.default as Record<string, unknown> | undefined)?.headless) as
      | ((bot: MineflayerBot, options: Record<string, unknown>) => unknown)
      | undefined;
    if (!headlessViewer) {
      throw new Error("prismarine-viewer headless mode is unavailable.");
    }

    const net = await import("node:net");

    return await new Promise<Buffer>((resolve, reject) => {
      const server = net.createServer();
      let settled = false;

      const finish = (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        handler();
        server.close();
      };

      server.on("connection", (socket) => {
        let pending = Buffer.alloc(0);
        socket.on("data", (chunk) => {
          pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
          if (pending.length < 4) {
            return;
          }

          const frameLength = pending.readUInt32LE(0);
          if (pending.length < 4 + frameLength) {
            return;
          }

          const frame = pending.subarray(4, 4 + frameLength);
          socket.destroy();
          finish(() => resolve(frame));
        });
        socket.on("error", (error) => finish(() => reject(error)));
      });
      server.on("error", (error) => finish(() => reject(error)));

      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          finish(() => reject(new Error("Could not allocate a local port for POV capture.")));
          return;
        }

        try {
          headlessViewer(bot, {
            output: `127.0.0.1:${address.port}`,
            frames: 1,
            width: this.config.mineflayer.screenshotWidth,
            height: this.config.mineflayer.screenshotHeight,
            viewDistance: 4,
          });
        } catch (error) {
          finish(() =>
            reject(
              error instanceof Error ? error : new Error("Failed to start prismarine headless capture."),
            ),
          );
        }
      });

      setTimeout(() => {
        finish(() => reject(new Error("Timed out while waiting for a headless POV frame.")));
      }, 10_000);
    });
  }

  private snapshotLiveWorld(bot: MineflayerBot, userObjective: string, screenshotPath: string): WorldState {
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
      inventory: this.readInventory(bot),
      equippedItem: bot.heldItem?.name ?? "air",
      timeOfDay: this.toTimeOfDay(bot.time?.timeOfDay ?? 6000),
      sceneSummary: null,
      visibleHazards: this.scanHazards(bot),
      perceivedResources: this.scanResources(bot),
      goalProgress: this.estimateGoalProgress(userObjective, this.readInventory(bot)),
      screenshotPath,
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
      case "equip":
        await this.equip(bot, String(action.arguments.item ?? "air"));
        return;
      case "place":
        await this.place(bot, String(action.arguments.block_type ?? "oak_planks"), String(action.arguments.location ?? "ahead"));
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
    const movementState = this.requireMovementState();
    const yaw = this.directionToYaw(bot.entity.yaw, direction);
    await bot.look(yaw, 0, true);

    const offset = this.directionOffsetFromYaw(yaw, 6);
    const position = bot.entity.position.offset(offset.x, 0, offset.z).floored();
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

    const heldTableBlock = normalizedItemName === "crafting_table" ? null : bot.findBlock({
      matching: (block: { name?: string }) => block.name === "crafting_table",
      maxDistance: 8,
    });
    const recipes = bot.recipesFor(item.id, null, count, heldTableBlock ?? null);
    const recipe = recipes[0];
    if (!recipe) {
      throw new Error(`No available recipe for ${itemName}.`);
    }

    await this.withTimeout(bot.craft(recipe, count, heldTableBlock ?? null), this.config.mineflayer.actionTimeoutMs, "Crafting timed out.");
  }

  private async equip(bot: MineflayerBot, itemName: string): Promise<void> {
    const normalizedItemName = this.normalizeLegacyItemName(itemName);
    const item = bot.inventory.items().find((entry) => entry.name === normalizedItemName);
    if (!item) {
      throw new Error(`Item not in inventory: ${itemName}`);
    }
    await this.withTimeout(bot.equip(item, "hand"), 5_000, "Equip timed out.");
  }

  private async place(bot: MineflayerBot, blockType: string, location: string): Promise<void> {
    const normalizedBlockType = this.normalizeLegacyItemName(blockType);
    const item = bot.inventory.items().find((entry) => entry.name === normalizedBlockType);
    if (!item) {
      throw new Error(`Cannot place ${blockType}; it is not in inventory.`);
    }
    await bot.equip(item, "hand");

    const placementTargets = this.findPlacementTargets(bot, location);
    const failureReasons: string[] = [];

    for (const target of placementTargets) {
      try {
        await this.gotoBlock(bot, target.support.position, 1);
        await bot.lookAt(target.targetCenter, true);
        await this.withTimeout(
          bot.placeBlock(target.support, { x: 0, y: 1, z: 0 }),
          this.config.mineflayer.actionTimeoutMs,
          "Place action timed out.",
        );
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
    return bot.inventory.items().map((item) => ({
      item: item.name,
      count: item.count,
    }));
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
    const countItem = (item: string) => inventory.find((stack) => stack.item === item)?.count ?? 0;
    const normalized = userObjective.toLowerCase();
    if (normalized.includes("pickaxe")) {
      if (countItem("stone_pickaxe") > 0 || countItem("wooden_pickaxe") > 0) return 1;
      if (countItem("crafting_table") > 0) return 0.7;
      if (countItem("oak_log") >= 3 || countItem("oak_planks") >= 4) return 0.35;
    }
    if (normalized.includes("crafting table") && countItem("crafting_table") > 0) return 1;
    if (countItem("oak_log") > 0) return 0.2;
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
    targetCenter: { x: number; y: number; z: number };
  }> {
    const origin = bot.entity.position.floored();
    const preferredOffsets = location === "underfoot"
      ? [
          { x: 1, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: 1 },
          { x: 0, z: -1 },
        ]
      : [
          { x: 0, z: 1 },
          { x: 1, z: 1 },
          { x: -1, z: 1 },
          { x: 1, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: -1 },
        ];

    const targets: Array<{ support: BotBlock; targetCenter: { x: number; y: number; z: number } }> = [];
    for (const offset of preferredOffsets) {
      const supportPosition = {
        x: origin.x + offset.x,
        y: origin.y - 1,
        z: origin.z + offset.z,
      };
      const support = bot.blockAt(supportPosition);
      if (!this.isSolidPlacementSupport(support)) {
        continue;
      }

      const targetPosition = {
        x: supportPosition.x,
        y: supportPosition.y + 1,
        z: supportPosition.z,
      };
      const targetBlock = bot.blockAt(targetPosition);
      if (!this.isReplaceablePlacementSpace(targetBlock)) {
        continue;
      }

      targets.push({
        support,
        targetCenter: {
          x: targetPosition.x + 0.5,
          y: targetPosition.y + 0.5,
          z: targetPosition.z + 0.5,
        },
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
    items(): Array<{ name: string; count: number }>;
  };
  registry: {
    itemsByName: Record<string, { id: number }>;
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
  equip(item: unknown, destination: string): Promise<void>;
  look(yaw: number, pitch: number, force?: boolean): Promise<void>;
  lookAt(position: { x: number; y: number; z: number }, force?: boolean): Promise<void>;
  placeBlock(referenceBlock: unknown, faceVector: { x: number; y: number; z: number }): Promise<void>;
  blockAt(position: { x: number; y: number; z: number }): unknown | null;
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
