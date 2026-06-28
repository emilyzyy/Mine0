# Mine0

Phase 0 scaffold for the Mine0 project plan: shared contracts, schema validation, mocked planner loop, pluggable executor interface, and a minimal prompt-box dashboard.

## What is implemented

- canonical contracts for `WorldState`, `CandidateAction`, `PredictedFuture`, `SubgoalIntent`, `ActionOutcome`, and `MemoryEntry`
- zero-dependency runtime validation and parsing
- executor abstraction with `jarvis` and `mineflayer` mock backends
- mocked perception, planning, rollout, critic, verification, and memory services
- end-to-end decision loop driven by a freeform objective
- simple HTTP server with a prompt box and live branch/output view
- baseline comparison scaffold for greedy vs multiverse mode

## Quick start

Run the web scaffold:

```bash
node --experimental-strip-types src/server.ts
```

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
