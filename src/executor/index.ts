import { JarvisExecutor } from "./jarvis_executor.ts";
import { JarvisPersistentExecutor } from "./jarvis_persistent_executor.ts";
import { MineflayerExecutor } from "./mineflayer_executor.ts";
import type { ExecutorBackend, ExecutorKind } from "./executor_interface.ts";

let cachedMineflayerExecutor: MineflayerExecutor | null = null;

export function createExecutor(kind: ExecutorKind): ExecutorBackend {
  switch (kind) {
    case "jarvis":
      return new JarvisExecutor();
    case "jarvis-persistent":
      return new JarvisPersistentExecutor();
    case "mineflayer":
      cachedMineflayerExecutor ??= new MineflayerExecutor();
      return cachedMineflayerExecutor;
  }
}

export * from "./executor_interface.ts";
