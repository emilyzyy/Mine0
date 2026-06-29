import { JarvisExecutor } from "./jarvis_executor.ts";
import { JarvisRemoteExecutor } from "./jarvis_remote_executor.ts";
import { MineflayerExecutor } from "./mineflayer_executor.ts";
import type { ExecutorBackend, ExecutorKind } from "./executor_interface.ts";

export function createExecutor(kind: ExecutorKind): ExecutorBackend {
  switch (kind) {
    case "jarvis":
      return new JarvisExecutor();
    case "jarvis-remote":
      return new JarvisRemoteExecutor();
    case "mineflayer":
      return new MineflayerExecutor();
  }
}

export * from "./executor_interface.ts";
