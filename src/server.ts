import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Mine0App } from "./app/decision_loop.ts";
import { ensureProjectDirectories } from "./shared/fs.ts";

const app = new Mine0App();
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
let lastTrace: unknown = null;

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

    if (request.method === "POST" && url.pathname === "/api/run-cycle") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }

      const raw = Buffer.concat(chunks).toString("utf8");
      const body = JSON.parse(raw) as {
        objective?: string;
        executorKind?: "jarvis" | "mineflayer";
        mode?: "greedy" | "multiverse";
      };

      const objective = body.objective?.trim();
      if (!objective) {
        sendJson(response, 400, { error: "objective is required" });
        return;
      }

      lastTrace = await app.runCycle({
        objective,
        executorKind: body.executorKind ?? "jarvis",
        mode: body.mode ?? "multiverse",
      });

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
