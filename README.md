# Mine0

Mine0 is a Minecraft agent orchestration layer that uses Cerebras-hosted Gemma for recursive goal planning and routes subtasks through a unified execution layer, including an experimental persistent JARVIS-VLA backend for embodied Minecraft control.

---

## How it works

```
User objective
  → Mine0 recursive planner (Cerebras / Gemma-4-31b)
  → Cerebras/Gemma decomposes objective into ordered subtasks
  → Mine0 executor interface
  → execution backend:
      · JARVIS persistent VLA backend   (embodied visual control via RunPod)
      · Mineflayer control backend      (stable Minecraft scripting adapter)
  → outcome / verification / memory
  → next decision step
```

The planner does not care which executor is used. It emits structured subgoal intents; executors translate those intents into Minecraft actions. Switching backends does not change the planning or memory layers.

---

## Run the Mine0 demo

> **Node 24 required.** Run `nvm use 24` before anything else — Node 18 silently fails on `--experimental-strip-types`.

### Verify everything passes first

```bash
nvm use 24
npm run check        # 128 tests — must all pass
```

### JARVIS persistent backend (primary VLA demo)

See [JARVIS Persistent Backend](#jarvis-persistent-backend) below.

### Mineflayer control backend (stable demo execution)

```bash
export CEREBRAS_API_KEY="your_key_here"

MINE0_MINEFLAYER_ENABLED=1 \
MINE0_MINEFLAYER_HOST=127.0.0.1 \
MINE0_MINEFLAYER_PORT=25565 \
MINE0_MINEFLAYER_USERNAME=Mine0Bot \
MINE0_MINEFLAYER_AUTH=offline \
npm run demo -- "Gather wood and make a crafting table"
```

This runs the full Mine0 planning loop — Cerebras/Gemma decomposes the objective into subtasks, the executor backend sends Minecraft actions, and outcomes feed back into the memory and verification layer. The Mineflayer backend is recommended for live demo reliability.

---

## JARVIS Persistent Backend

The JARVIS backend connects Mine0's planner to a remote JARVIS-VLA model running on RunPod.

- Cerebras/Gemma plans high-level subtasks (text only).
- Each subtask is sent as a natural-language instruction to the persistent JARVIS worker.
- JARVIS-VLA sees the live Minecraft POV frame and outputs low-level MineStudio button/camera actions.
- The worker maintains a persistent Minecraft session across subgoals (no restart per subtask).

**This path is integrated and runnable. Low-level VLA behavior is still experimental** — JARVIS can repeat actions or drift, which is a model behavior issue, not a Mine0 bug.

### Prerequisites

```bash
# Cerebras API key
export CEREBRAS_API_KEY="your_key_here"

# SSH access to RunPod
# ssh root@194.68.245.71 -p 22072 -i ~/.ssh/id_ed25519
# Key must be loadable without a passphrase prompt (or loaded in ssh-agent).

# vLLM server on RunPod must already be running.
# Do NOT kill or restart it — startup takes ~10 minutes.
```

### Health check

```bash
npm run jarvis:worker -- health
```

### Start worker (only if not already running)

```bash
npm run jarvis:worker -- start
```

Check health first — `start` clobbers an existing session.

### Run zombie combat demo

```bash
JARVIS_PERSISTENT_RESET_ON_START=1 \
MINE0_MAX_DECISION_STEPS=3 \
JARVIS_MAX_FRAMES=10 \
npm run jarvis:persistent -- "Kill zombies. Look around to find a zombie, approach it, and attack with your sword."
```

| Variable | Value | Effect |
|----------|-------|--------|
| `JARVIS_PERSISTENT_RESET_ON_START` | `1` | Fresh Minecraft session; `0` reuses existing |
| `MINE0_MAX_DECISION_STEPS` | `3` | High-level planner steps (subtask executions) |
| `JARVIS_MAX_FRAMES` | `10` | Low-level frames per subgoal (~5–15 s game time) |

### Expected log signals

```
planner         : cerebras / gemma-4-31b      ← Cerebras connected
active subtask  : scan_for_zombie             ← combat decomposition active
instruction     : "Look around for a zombie…" ← concrete instruction sent, not abstract token
successCondition: { item: "zombie_defeated" } ← override active
remoteExecutionSucceeded: true                ← worker stepped environment
activeSubtask (step 2) → orient_to_zombie     ← scan-loop fix working
```

Full runbook → [docs/JARVIS_RUNBOOK.md](docs/JARVIS_RUNBOOK.md)

---

## Hackathon Demo Narrative

For the live walkthrough, Mine0 demonstrates the full Cerebras/Gemma planning loop through a stable Minecraft execution backend. The same executor interface also supports our persistent JARVIS-VLA integration, where natural-language subtasks are sent to a remote visual-action model that sees the Minecraft POV and returns controls. This lets Mine0 separate reasoning, memory, verification, and embodied execution — swapping backends without touching the planner.

---

## What works

- **Cerebras/Gemma planner** — live recursive task decomposition from free-form objectives.
- **Recursive subtask decomposition** — zombie/combat objectives decompose into the correct 5-step sequence; no survival/crafting subtasks injected.
- **Memory and verification loop** — outcomes feed back, stall detection fires, repeated failures halt the loop.
- **Mineflayer control backend** — reliable Minecraft scripting for stable demo execution.
- **JARVIS persistent worker** — SSH-based worker on RunPod with session reset/reuse.
- **JARVIS execution artifacts** — session ID, cumulative steps, action logs, latest POV path.
- **Scan-loop advancement** — live runs advance from `scan_for_zombie` → `orient_to_zombie` after repetitive-loop detection; the bug where `skipFailureHeuristics: true` blocked force-advance is fixed.

## Known limitations

- JARVIS-VLA low-level behavior can repeat the same button/camera action across frames — model behavior, not a Mine0 bug.
- `latest_pov.png` file writes can lag; do not treat it as real-time evidence.
- JARVIS backend is experimental; recommend the Mineflayer backend for reliable live demos.
- Camera actions sometimes log `camera=221`, which exceeds the standard 0–120 MineStudio range; the environment steps without error but may contribute to camera drift.

---

## Executor interface

```
src/executor/
  jarvis_persistent_executor.ts   ← JARVIS-VLA backend
  jarvis_executor.ts              ← mock JARVIS (batch, for local tests)
  mineflayer_executor.ts          ← Mineflayer scripting backend
```

All executors implement the same contract: receive a `SubgoalIntent`, return an `ActionOutcome`. The planner, memory, and verification layers are backend-agnostic.

---

## Web dashboard

```bash
node --experimental-strip-types src/server.ts
```

Shows live branch/output from the decision loop.

---

## Suggested role split

- **Planner / reasoning** — `src/planner/`, `src/perception/`, `src/critic/`, prompt files.
- **Executor / environment** — `src/executor/`, `src/verifier/`, `src/memory/`, environment adapters.
- **Shared contracts** — `src/contracts/` (change intentionally).

---

## Safety

- Never commit `.env`, `node_modules/`, `artifacts/demo/`, or `artifacts/videos/`.
- Do not hide backend identity in logs — logs show the actual executor used.
- Do not kill or restart the vLLM server on RunPod without explicit intent.
- Do not push until tests pass (`npm run check`).

---

## Current guardrail

Mine0 runs in **single-proposal mode** to limit API usage: one planner proposal per step, first valid approach executed, no rollout/critic fan-out. This keeps Cerebras usage moderate while the full loop runs to completion.

Safety controls:

```bash
MINE0_MAX_DECISION_STEPS=250
MINE0_MAX_STALLED_STEPS=6
MINE0_MAX_REPEATED_ACTION_FAILURES=4
```

### JARVIS image perception (optional)

In the `jarvis-persistent` route, Mine0 can mirror the latest worker screenshot into `artifacts/frames/jarvis-persistent/` and attach it to Gemma perception prompts:

```bash
MINE0_MODEL_PERCEPTION_ENABLED=1
CEREBRAS_ENABLE_IMAGE_INPUT=1
```

Mineflayer does not use image input for Gemma perception; it remains structured-state only.
