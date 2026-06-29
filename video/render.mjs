#!/usr/bin/env node
// Detect which optional clips exist, build input props, then invoke the Remotion CLI.
// Usage:
//   node render.mjs
//   DEMO_OBJECTIVE="Kill zombies." node render.mjs

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clipsDir = join(__dirname, "public", "clips");
const outDir = join(__dirname, "out");

const props = {
  hasUiTree: existsSync(join(clipsDir, "ui_tree.mp4")),
  hasMcPov: existsSync(join(clipsDir, "minecraft_pov.mp4")),
  hasSideBySide: existsSync(join(clipsDir, "side_by_side.mp4")),
  hasTerminal: existsSync(join(clipsDir, "terminal.mp4")),
  hasLogo: existsSync(join(clipsDir, "logo.png")),
  objective:
    process.env.DEMO_OBJECTIVE ??
    "Find resources, reason through subtasks, and act in Minecraft.",
};

console.log("Mine0 demo video renderer");
console.log("─".repeat(50));
console.log("Asset scan:");
for (const [k, v] of Object.entries(props)) {
  if (k === "objective") continue;
  const found = v ? "✓ found" : "✗ missing — placeholder will render";
  console.log(`  ${k.padEnd(14)} ${found}`);
}
console.log(`  objective      "${props.objective}"`);
console.log("─".repeat(50));

mkdirSync(outDir, { recursive: true });
const propsFile = join(outDir, ".render-props.json");
writeFileSync(propsFile, JSON.stringify(props, null, 2));

const outputPath = join(outDir, "mine0-demo.mp4");

const cmd = [
  "npx",
  "remotion",
  "render",
  "src/index.ts",
  "Mine0Demo",
  outputPath,
  `--props=${propsFile}`,
  "--overwrite",
].join(" ");

console.log(`\nRunning: ${cmd}\n`);

try {
  execSync(cmd, { stdio: "inherit", cwd: __dirname });
  console.log(`\n✓ Rendered: ${outputPath}`);
} catch (err) {
  console.error("\n✗ Render failed:", err.message);
  process.exit(1);
}
