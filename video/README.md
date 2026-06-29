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
| `ui_tree.mp4` | Left panel placeholder in the main demo scene |
| `minecraft_pov.mp4` | Right panel placeholder in the main demo scene |
| `side_by_side.mp4` | Both panels — used as a single full-width recording if present |
| `terminal.mp4` | Reserved slot (shown in studio preview) |
| `logo.png` | Reserved logo slot |

**Priority:**
- If `side_by_side.mp4` exists → used full-width in scene 4.
- Otherwise → `ui_tree.mp4` (left) and `minecraft_pov.mp4` (right) side by side.
- If either is missing → clean animated placeholder renders instead. **No crash.**

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
