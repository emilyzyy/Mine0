# Mine0

## Current Guardrail

For now, Mine0 must stay in `single-proposal mode` to limit API usage.

- Generate only one planner proposal per step.
- Execute the first valid approach instead of branching into rollouts or critic scoring.
- A run may continue across many decision steps; stop it only when the objective is complete or the bot is clearly stuck in a loop.
- Treat any future multiverse or parallel-planner work as disabled until this guardrail is intentionally removed.

Phase 0+ scaffold for the Mine0 project plan: shared contracts, schema validation, multiverse planner loop, pluggable executor interface, and a minimal prompt-box dashboard.

## What is implemented

- canonical contracts for `WorldState`, `CandidateAction`, `PredictedFuture`, `SubgoalIntent`, `ActionOutcome`, and `MemoryEntry`
- zero-dependency runtime validation and parsing
- executor abstraction with `jarvis` mock and `mineflayer` live-or-mock backends
- shared Gemma task decomposition, refinement, and task-stack flow for both routes, with route-specific prompt context
- Cerebras-backed perception, planning, rollout, and critic services with mock fallback
- end-to-end decision loop driven by a freeform objective
- simple HTTP server with a prompt box and live branch/output view
- baseline comparison scaffold for greedy vs multiverse mode

## Quick start

Run the web scaffold:

```bash
node --experimental-strip-types src/server.ts
```

If `node` is not installed on your shell, use the bundled runtime:

```bash
/Users/rhb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --experimental-strip-types src/server.ts
```

To use live Cerebras planning, create a local `.env` from `.env.example` and set `CEREBRAS_API_KEY`.

To use a live Mineflayer bot instead of the mock fallback, enable:

```bash
MINE0_MINEFLAYER_ENABLED=1
MINE0_MINEFLAYER_HOST=127.0.0.1
MINE0_MINEFLAYER_PORT=25565
MINE0_MINEFLAYER_USERNAME=Mine0Bot
MINE0_MINEFLAYER_AUTH=offline
```

Optional viewer:

```bash
MINE0_MINEFLAYER_VIEWER_ENABLED=1
MINE0_MINEFLAYER_VIEWER_PORT=3007
```

Run one CLI cycle:

```bash
node --experimental-strip-types src/cli.ts "Gather wood and make a crafting table"
```

You can also force the backend explicitly:

```bash
node --experimental-strip-types src/cli.ts --executor=mineflayer "Gather wood and make a crafting table"
```

## Watching The Bot

The easiest way to see what Mine0 is doing in-game is to join the same local Minecraft server yourself.

1. Start the server in `C:\Users\dorot\dev\mc-server-1.8.8`.
2. Open Minecraft Java Edition on version `1.8.8`.
3. Add a multiplayer server or direct connect to `127.0.0.1:25565`.
4. Run Mine0 with `--executor=mineflayer`.
5. You will see the bot join as `Mine0Bot` and move around like another player.

To join from another device on the same home network, use the host machine LAN IP instead of `127.0.0.1`.
Current LAN IP on this machine: `10.0.0.3`

Example:

```text
10.0.0.3:25565
```

Optional browser viewer:

- Set `MINE0_MINEFLAYER_VIEWER_ENABLED=1` in `.env`.
- This may require installing the `canvas` package separately on Windows before `prismarine-viewer` works reliably.

## Enabling Cerebras

Single-decision Cerebras planning is still supported.

Add your key to `.env`:

```bash
CEREBRAS_API_KEY=your-real-key
```

Optional:

```bash
CEREBRAS_MODEL=gemma-4-31b
CEREBRAS_FALLBACK_MODEL=gpt-oss-120b
CEREBRAS_ENABLE_IMAGE_INPUT=1
MINE0_SCREENSHOT_DIR=artifacts/frames
```

With that set, the app will use Cerebras for perception and the one allowed planner decision each cycle. Without the key, it falls back to the local heuristic planner.

The run loop no longer stops after a tiny fixed budget. Instead, it keeps working until the objective is done or one of the stuck detectors fires. The safety controls are:

```bash
MINE0_MAX_DECISION_STEPS=250
MINE0_MAX_STALLED_STEPS=6
MINE0_MAX_REPEATED_ACTION_FAILURES=4
```

This still keeps Cerebras usage moderate because each step only makes one perception call and one planner call.

Run the built-in checks:

```bash
node --experimental-strip-types --test tests/*.test.ts
```

## Suggested role split

- Role 1 can stay mostly inside `src/planner/`, `src/perception/`, `src/critic/`, and prompt/schema files.
- Role 2 can stay mostly inside `src/executor/`, `src/verifier/`, `src/memory/`, and environment adapters.
- Shared contracts should change intentionally inside `src/contracts/`.

## Notes

- `jarvis` is still a mock executor.
- `mineflayer` now supports a real local bot session when the Mineflayer environment variables are configured, and otherwise falls back to the mock world so tests and local exploration stay stable.
- Backend choice is explicit per run. Mine0 does not auto-switch between Jarvis and Mineflayer mid-run, and it always executes the first selected planner approach.
- The planner reads `CEREBRAS_API_KEY`, `CEREBRAS_MODEL`, and `CEREBRAS_FALLBACK_MODEL` from the environment. If no API key is set, the app falls back to heuristic planner-side behavior.
- If `MINE0_SCREENSHOT_DIR` contains `.png`, `.jpg`, `.jpeg`, or `.webp` frames, the mock executor will use those files as the screenshot input in lexicographic order instead of the placeholder frame.
- `CEREBRAS_ENABLE_IMAGE_INPUT=1` will attach those screenshots to the Cerebras perception prompt.
- In live Mineflayer mode, Mine0 now tries to capture a true first-person JPEG on each observation step and shows those frames in the web dashboard.
- True live POV capture currently depends on `prismarine-viewer` headless mode, which in turn needs `node-canvas-webgl` to install successfully on your machine.
- On this Windows setup, `npm install node-canvas-webgl` currently fails without Visual Studio Build Tools and the `Desktop development with C++` workload, so Mine0 will fall back to placeholder frames until that dependency is available.
- Even when `mode` is set to `multiverse`, the current implementation intentionally executes only the first planner proposal and skips rollout/critic fan-out to keep API usage down.
- The prompt-box dashboard shows the single selected branch and keeps the trace shape compatible with future expansion.
