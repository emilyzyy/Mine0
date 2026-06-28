import { appendFile } from "node:fs/promises";
import { ensureProjectDirectories, projectPath } from "./fs.ts";

export async function appendJsonLine(fileName: string, value: unknown): Promise<void> {
  await ensureProjectDirectories();
  const payload = `${JSON.stringify(value)}\n`;
  await appendFile(projectPath("artifacts", "logs", fileName), payload, "utf8");
}

export function isoNow(): string {
  return new Date().toISOString();
}
