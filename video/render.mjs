#!/usr/bin/env node
// Detect which optional clips exist, build input props, then invoke the Remotion CLI.
// Usage:
//   node render.mjs
//   DEMO_OBJECTIVE="Kill zombies." node render.mjs
//   DEMO_ASSET_MODE=mock node render.mjs   # force animated replay even if clips exist
//   DEMO_ASSET_MODE=clips node render.mjs  # require real clips, fail if missing

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clipsDir = join(__dirname, "public", "clips");
const outDir = join(__dirname, "out");

const demoAssetMode = (process.env.DEMO_ASSET_MODE ?? "auto").toLowerCase();
if (!["auto", "mock", "clips"].includes(demoAssetMode)) {
  console.error(
    `Invalid DEMO_ASSET_MODE: "${demoAssetMode}". Valid values: auto, mock, clips`
  );
  process.exit(1);
}

const hasUiTree     = existsSync(join(clipsDir, "ui_tree.mp4"));
const hasMcPov      = existsSync(join(clipsDir, "minecraft_pov.mp4"));
const hasSideBySide = existsSync(join(clipsDir, "side_by_side.mp4"));

// Validate clips mode before doing any work
if (demoAssetMode === "clips") {
  const missing = [
    !hasUiTree     && "ui_tree.mp4",
    !hasMcPov      && "minecraft_pov.mp4",
    !hasSideBySide && "side_by_side.mp4",
  ].filter(Boolean);
  if (missing.length) {
    console.error(
      `DEMO_ASSET_MODE=clips but missing clips: ${missing.join(", ")}`
    );
    console.error(`Place them in ${clipsDir} or use DEMO_ASSET_MODE=auto`);
    process.exit(1);
  }
}

const props = {
  hasUiTree,
  hasMcPov,
  hasSideBySide,
  hasTerminal: existsSync(join(clipsDir, "terminal.mp4")),
  hasLogo:     existsSync(join(clipsDir, "logo.png")),
  objective:
    process.env.DEMO_OBJECTIVE ??
    "Find resources, reason through subtasks, and act in Minecraft.",
  demoAssetMode,
};

// Determine what the main demo panel will show
const hasAnyClip = hasUiTree || hasMcPov || hasSideBySide;
const showingReplay =
  demoAssetMode === "mock" || (demoAssetMode === "auto" && !hasAnyClip);

console.log("Mine0 demo video renderer");
console.log("─".repeat(50));
console.log(`Asset mode:    ${demoAssetMode}`);
console.log("Clip scan:");
for (const [k, v] of [
  ["ui_tree.mp4",      hasUiTree],
  ["minecraft_pov.mp4",hasMcPov],
  ["side_by_side.mp4", hasSideBySide],
  ["terminal.mp4",     props.hasTerminal],
  ["logo.png",         props.hasLogo],
]) {
  const found = v ? "✓ found" : "✗ missing";
  console.log(`  ${String(k).padEnd(18)} ${found}`);
}
console.log(`  objective      "${props.objective}"`);
console.log(
  showingReplay
    ? "Main demo:     → animated replay (demo replay fallback)"
    : "Main demo:     → real clips"
);
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
