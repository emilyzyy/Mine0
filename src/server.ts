import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Mine0App, type RunCycleInput } from "./app/decision_loop.ts";
import { ensureProjectDirectories, projectPath } from "./shared/fs.ts";
import { loadPlannerConfig } from "./shared/config.ts";
import type { DecisionStepTrace, DecisionTrace } from "./dashboard/dashboard_state.ts";

const app = new Mine0App();
const config = loadPlannerConfig();
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
let lastTrace: unknown = null;
let currentRunState: {
  running: boolean;
  startedAt: string | null;
  objective: string | null;
  executorKind: "jarvis" | "jarvis-persistent" | "mineflayer" | null;
  mode: "greedy" | "multiverse" | null;
  completedObjective: boolean;
  stopReason: string | null;
  steps: DecisionStepTrace[];
  latestStep: DecisionStepTrace | null;
  error: string | null;
} = {
  running: false,
  startedAt: null,
  objective: null,
  executorKind: null,
  mode: null,
  completedObjective: false,
  stopReason: null,
  steps: [],
  latestStep: null,
  error: null,
};

function sendJson(response: import("node:http").ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

async function serveStatic(filePath: string, response: import("node:http").ServerResponse) {
  const contentType = filePath.endsWith(".css")
    ? "text/css; charset=utf-8"
    : filePath.endsWith(".js")
      ? "application/javascript; charset=utf-8"
      : "text/html; charset=utf-8";
  const file = await readFile(path.join(publicDir, filePath), "utf8");
  response.writeHead(200, { "content-type": contentType });
  response.end(file);
}

function inferContentType(filePath: string): string {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

await ensureProjectDirectories();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/") {
      await serveStatic("index.html", response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/styles.css") {
      await serveStatic("styles.css", response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/app.js") {
      await serveStatic("app.js", response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/last-trace") {
      sendJson(response, 200, { trace: lastTrace });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/run-status") {
      sendJson(response, 200, currentRunState);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/frame") {
      const requestedPath = url.searchParams.get("path");
      if (!requestedPath) {
        sendJson(response, 400, { error: "path is required" });
        return;
      }

      const normalizedPath = path.resolve(requestedPath);
      const allowedRoots = [
        projectPath("artifacts"),
        projectPath(config.screenshotDirectory),
      ].map((entry) => path.resolve(entry));
      if (!allowedRoots.some((root) => normalizedPath.startsWith(root))) {
        sendJson(response, 403, { error: "frame path is outside the allowed directories" });
        return;
      }

      const image = await readFile(normalizedPath);
      response.writeHead(200, { "content-type": inferContentType(normalizedPath) });
      response.end(image);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/run-cycle") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }

      const raw = Buffer.concat(chunks).toString("utf8");
      const body = JSON.parse(raw) as {
        objective?: string;
        executorKind?: "jarvis" | "jarvis-persistent" | "mineflayer";
        mode?: "greedy" | "multiverse";
      };

      const objective = body.objective?.trim();
      if (!objective) {
        sendJson(response, 400, { error: "objective is required" });
        return;
      }

      const input: RunCycleInput = {
        objective,
        executorKind: body.executorKind ?? (config.mineflayer.enabled ? "mineflayer" : "jarvis"),
        mode: body.mode ?? "greedy",
      };

      currentRunState = {
        running: true,
        startedAt: new Date().toISOString(),
        objective: input.objective,
        executorKind: input.executorKind,
        mode: input.mode,
        completedObjective: false,
        stopReason: null,
        steps: [],
        latestStep: null,
        error: null,
      };

      try {
        const trace = await app.runCycle(input, {
          onStep(step) {
            currentRunState = {
              ...currentRunState,
              steps: [...currentRunState.steps, step],
              latestStep: step,
            };
          },
        });

        lastTrace = trace;
        currentRunState = {
          ...currentRunState,
          running: false,
          completedObjective: trace.completedObjective,
          stopReason: trace.stopReason,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown run error";
        currentRunState = {
          ...currentRunState,
          running: false,
          error: message,
        };
        throw error;
      }

      sendJson(response, 200, { trace: lastTrace });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    sendJson(response, 500, { error: message });
  }
});

const port = 4311;
server.listen(port, () => {
  console.log(`Mine0 prompt box running at http://localhost:${port}`);
});
