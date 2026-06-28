import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function projectPath(...segments: string[]): string {
  return path.join(ROOT_DIR, ...segments);
}

export async function ensureProjectDirectories(): Promise<void> {
  const directories = [
    projectPath("artifacts"),
    projectPath("artifacts", "frames"),
    projectPath("artifacts", "logs"),
    projectPath("artifacts", "replays"),
  ];

  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
}

export async function writeJsonArtifact(
  relativePath: string,
  value: unknown,
): Promise<string> {
  const absolutePath = projectPath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(value, null, 2), "utf8");
  return absolutePath;
}

export async function readTextFile(relativePath: string): Promise<string> {
  return readFile(projectPath(relativePath), "utf8");
}
