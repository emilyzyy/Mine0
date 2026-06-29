# Role Split Handoff

## Current Guardrail

Keep Mine0 in `single-decision mode` for now.

- Planner work should produce one bounded proposal only.
- Execution should take the first valid approach immediately.
- Do not re-enable rollout branching or critic fan-out until API-usage limits are intentionally revisited.

This scaffold is ready for the architecture split described in [PROJECT_PLAN.md](./PROJECT_PLAN.md).

## Shared foundation

- Core contracts live in [src/contracts](./src/contracts).
- The orchestration seam lives in [src/app/decision_loop.ts](./src/app/decision_loop.ts).
- The prompt-box entrypoint lives in [src/server.ts](./src/server.ts).
- Trace shape for the dashboard lives in [src/dashboard/dashboard_state.ts](./src/dashboard/dashboard_state.ts).

## Role 1: Planner

Recommended ownership:

- [src/perception](./src/perception)
- [src/planner](./src/planner)
- [src/critic](./src/critic)
- prompt/schema evolution for `SubgoalIntent` and `PredictedFuture`

Expected next replacements:

- keep shared Gemma perception/task-management prompts aligned to the active route (`jarvis` vs `mineflayer`)
- replace heuristic planner proposals with structured LLM outputs
- keep single-proposal execution as the live default; any future rollout work should stay disabled unless intentionally reintroduced

## Role 2: Embodiment and Feedback

Recommended ownership:

- [src/executor](./src/executor)
- [src/verifier](./src/verifier)
- [src/memory](./src/memory)
- artifact capture and replay pipeline

Expected next replacements:

- replace mock JARVIS executor with real JARVIS-VLA and MineStudio integration
- replace mock Mineflayer executor with real fallback environment plumbing
- replace heuristic verification with programmatic plus vision-assisted verification
- upgrade memory storage from in-memory plus JSONL to retrieval-ready indexing

## Working agreement

- Shared contract changes should be coordinated and reviewed first.
- Keep executor-specific details out of planner modules.
- Keep runtime backend selection explicit. Do not add automatic multi-route arbitration between Jarvis and Mineflayer inside the planner loop.
- Keep provider-specific prompting details out of executor modules.
- Add new fields to contracts only when they are needed by both roles or by the prompt-box/dashboard boundary.
