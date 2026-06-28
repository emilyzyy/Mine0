# Mine0

Phase 0 scaffold for the Mine0 project plan: shared contracts, schema validation, mocked planner loop, pluggable executor interface, and a minimal prompt-box dashboard.

## What is implemented

- canonical contracts for `WorldState`, `CandidateAction`, `PredictedFuture`, `SubgoalIntent`, `ActionOutcome`, and `MemoryEntry`
- zero-dependency runtime validation and parsing
- executor abstraction with `jarvis` and `mineflayer` mock backends
- Cerebras-backed planner-side perception and planning services with mock fallback
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

To use live Cerebras planning, create a local `.env` from [.env.example](/Users/rhb/Desktop/Mine0/.env.example) and set `CEREBRAS_API_KEY`.

Run one CLI cycle:

```bash
node --experimental-strip-types src/cli.ts "Gather wood and make a crafting table"
```

Run the built-in checks:

```bash
node --experimental-strip-types --test tests/*.test.ts
```

## Suggested role split

- Role 1 can stay mostly inside `src/planner/`, `src/perception/`, `src/critic/`, and prompt/schema files.
- Role 2 can stay mostly inside `src/executor/`, `src/verifier/`, `src/memory/`, and environment adapters.
- Shared contracts should change intentionally inside `src/contracts/`.

## Notes

- This scaffold is intentionally dependency-free because the local environment currently has Node but no package manager on `PATH`.
- The `jarvis` and `mineflayer` executors are mock implementations that preserve the interface boundary while real integrations are built.
- The planner reads `CEREBRAS_API_KEY`, `CEREBRAS_MODEL`, and `CEREBRAS_FALLBACK_MODEL` from the environment. If no API key is set, the app falls back to heuristic planner-side behavior.
- If `MINE0_SCREENSHOT_DIR` contains `.png`, `.jpg`, `.jpeg`, or `.webp` frames, the mock executor will use those files as the screenshot input in lexicographic order instead of the placeholder frame.
- `CEREBRAS_ENABLE_IMAGE_INPUT=1` will attach those screenshots to the Cerebras perception prompt.
