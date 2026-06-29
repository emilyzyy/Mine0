# Role Split Handoff

## Current Guardrail

Keep Mine0 in `single-decision mode` for now.

- Planner work should produce one bounded proposal only.
- Execution should take the first valid approach immediately.
- Do not re-enable rollout branching or critic fan-out until API-usage limits are intentionally revisited.

This scaffold is ready for the architecture split described in [PROJECT_PLAN.md](/Users/rhb/Desktop/Mine0/PROJECT_PLAN.md).

## Shared foundation

- Core contracts live in [src/contracts](/Users/rhb/Desktop/Mine0/src/contracts).
- The orchestration seam lives in [src/app/decision_loop.ts](/Users/rhb/Desktop/Mine0/src/app/decision_loop.ts).
- The prompt-box entrypoint lives in [src/server.ts](/Users/rhb/Desktop/Mine0/src/server.ts).
- Trace shape for the dashboard lives in [src/dashboard/dashboard_state.ts](/Users/rhb/Desktop/Mine0/src/dashboard/dashboard_state.ts).

## Role 1: Planner

Recommended ownership:

- [src/perception](/Users/rhb/Desktop/Mine0/src/perception)
- [src/planner](/Users/rhb/Desktop/Mine0/src/planner)
- [src/critic](/Users/rhb/Desktop/Mine0/src/critic)
- prompt/schema evolution for `SubgoalIntent` and `PredictedFuture`

Expected next replacements:

- swap heuristic perception with Gemma screenshot prompting
- replace heuristic planner proposals with structured LLM outputs
- replace mocked rollout scoring inputs with parallel imagined futures

## Role 2: Embodiment and Feedback

Recommended ownership:

- [src/executor](/Users/rhb/Desktop/Mine0/src/executor)
- [src/verifier](/Users/rhb/Desktop/Mine0/src/verifier)
- [src/memory](/Users/rhb/Desktop/Mine0/src/memory)
- artifact capture and replay pipeline

Expected next replacements:

- replace mock JARVIS executor with real JARVIS-VLA and MineStudio integration
- replace mock Mineflayer executor with real fallback environment plumbing
- replace heuristic verification with programmatic plus vision-assisted verification
- upgrade memory storage from in-memory plus JSONL to retrieval-ready indexing

## Working agreement

- Shared contract changes should be coordinated and reviewed first.
- Keep executor-specific details out of planner modules.
- Keep provider-specific prompting details out of executor modules.
- Add new fields to contracts only when they are needed by both roles or by the prompt-box/dashboard boundary.
