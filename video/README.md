# Mine0 Demo Video Generator

Generates a polished 60-second MP4 demo video for Mine0 using [Remotion](https://www.remotion.dev/).
All animations are programmatic — no manual editing required.
Drop in real screen recordings to replace the animated placeholders.

---

## Quick start

```bash
cd video
npm install
npm run render
open out/mine0-demo.mp4
```

With a custom objective shown on screen:

```bash
DEMO_OBJECTIVE="Kill zombies. Look around, approach, and attack." npm run render
```

---

## Drop in real recordings

Place clips into `video/public/clips/` and rerun `npm run render`. No code changes needed.

| File | What it replaces |
|------|-----------------|
| `ui_tree.mp4` | Left panel in the main demo scene |
| `minecraft_pov.mp4` | Right panel in the main demo scene |
| `side_by_side.mp4` | Both panels — used as a single full-width recording if present |
| `terminal.mp4` | Reserved slot |
| `logo.png` | Reserved logo slot |

**Priority:**
- If `side_by_side.mp4` exists → used full-width in scene 4.
- Otherwise → `ui_tree.mp4` (left) and `minecraft_pov.mp4` (right) side by side.
- If neither exists → the **animated demo replay fallback** renders automatically.

---

## Demo replay fallback

When no clips are available the main demo scene renders a fully animated
"system walkthrough" — no placeholder text, no missing-clip warnings.

**Left panel — Mine0 task/world model:**
9 tasks animate live (`task_001` → `task_009`), each transitioning
`pending → active → complete / verified`. Active rows glow green with a
progress bar; completed tasks reveal a concise note.

**Right panel — stylized Minecraft POV:**
A CSS/SVG POV advances through 6 phases:
1. Outdoor night → inspect inventory (missing helmet slot highlighted)
2. Cave transition → mine iron ore (ore-break particles)
3. Furnace panel → smelt ingots (fill bar + output slot)
4. Crafting table → helmet recipe (staggered ingot appearance)
5. Equip animation → helmet flies to armor slot
6. Verify → verifier + memory badges

**Bottom strip:** Live event log cycling `[GOAL]` `[PLAN]` `[STATE]` `[ACT]` `[VER]` `[MEM]`
events as the walkthrough progresses.

The watermark reads "system walkthrough" — not "live gameplay".
No fake latency numbers. Cerebras/Gemma "plans from structured context", not from live video.

---

## Preview interactively

```bash
npm run studio
```

Opens Remotion Studio in your browser. Scrub through the timeline,
inspect individual scenes, and test with different props.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEMO_OBJECTIVE` | `Find resources, reason through subtasks, and act in Minecraft.` | Objective shown in scene 2 |
| `DEMO_ASSET_MODE` | `auto` | `auto` — use clips if present, else demo replay; `mock` — force demo replay even if clips exist; `clips` — require real clips, exit 1 if missing |

---

## Output

| Property | Value |
|----------|-------|
| Resolution | 1920 × 1080 |
| Frame rate | 30 fps |
| Duration | 60 seconds (1800 frames) |
| Codec | H.264 |
| Output path | `video/out/mine0-demo.mp4` |

---

## Scene breakdown

| Scene | Time | Content |
|-------|------|---------|
| 1 — Title | 0–4 s | "Mine0" with animated tag cloud |
| 2 — Objective | 4–10 s | Console-style typing of the objective |
| 3 — Decision Tree | 10–22 s | Animated 6-node agent loop |
| 4 — Main Demo | 22–38 s | Screen recordings or placeholders |
| 5 — Closed Loop | 38–48 s | Planner → Executor → Verifier → Memory cards |
| 6 — Recovery | 48–55 s | Log lines showing loop detection + recovery |
| 7 — Architecture | 55–60 s | Final architecture text + title card |

---

## Requirements

- Node.js ≥ 18 (Node 24 recommended — same as the Mine0 root project)
- `npm install` inside `video/` (separate from the root `node_modules`)
- First install downloads Chromium (~170 MB) for headless rendering

---

## What NOT to commit

`video/out/` is gitignored. Do not commit rendered MP4s unless they are small
reference clips. Large video files should be shared via a file host or attached to a PR.
