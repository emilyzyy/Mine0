# JARVIS Persistent Demo — Runbook

> Branch: `fix/jarvis-demo-control-layer`
> Last verified: 2026-06-29

---

## 1. What Mine0 is

Mine0 is a two-layer Minecraft agent:

| Layer | Component | Sees |
|-------|-----------|------|
| High-level planner | Cerebras / Gemma-4-31b | Text only (world state, objective, task context) |
| Low-level executor | JARVIS-VLA (remote, RunPod) | Live Minecraft POV frame + natural-language instruction |

**How they work together:**

1. Mine0 receives a free-form user objective (e.g., *"Kill zombies"*).
2. Cerebras/Gemma decomposes the objective into an ordered queue of atomic subtasks:
   `scan_for_zombie → orient_to_zombie → approach_zombie → attack_zombie → verify_zombie_outcome`
3. Each subtask is sent as a natural-language instruction to the persistent JARVIS worker on RunPod.
4. JARVIS-VLA looks at the current Minecraft first-person frame and produces low-level MineStudio button/camera actions.
5. The MineStudio environment steps, reward is measured, and Mine0 advances to the next subtask.

Cerebras/Gemma **does not** see the game screen.  JARVIS **does not** know the long-horizon plan.  Mine0 is the bridge.

---

## 2. Branch and test status

```
git checkout fix/jarvis-demo-control-layer
npm run check          # runs all 128 tests — must pass before demo
```

- Use `npm run check`, not `npm test` (there is no `test` script).
- The repo uses Node's built-in test runner (`node --experimental-strip-types --test`), not Vitest or Jest.

---

## 3. Prerequisites

### Node 24

```bash
nvm use 24
node --version   # must print v24.x.x
```

Node 18 (the system default on this machine) will silently fail with `bad option: --experimental-strip-types`.

### Cerebras API key

```bash
export CEREBRAS_API_KEY="your_key_here"
```

Add to `~/.zshrc` or `~/.bashrc` to persist across sessions.  Without it Mine0 falls back to a mock planner and no LLM decomposition happens.

### SSH access to RunPod

```bash
ssh root@194.68.245.71 -p 22072 -i ~/.ssh/id_ed25519
```

Used by `npm run jarvis:worker` to reach the persistent worker.  The key must be loadable without a passphrase prompt (or be loaded in `ssh-agent`).

### vLLM server on RunPod

The JarvisVLA vLLM server should already be running in a tmux session on RunPod.  **Do not kill or restart it** unless the health check says the model is unreachable.  Restarting vLLM takes ~10 minutes.

---

## 4. Local setup

```bash
cd ~/Documents/Mine0
git checkout fix/jarvis-demo-control-layer
git pull
nvm use 24
npm install          # only needed if package.json changed
npm run check        # all 128 tests must pass
```

---

## 5. Health check

```bash
npm run jarvis:worker -- health
```

A healthy response looks like:

```json
{
  "status": "ok",
  "session_id": "d39a87c0",
  "env_alive": true,
  "cumulative_step": 42,
  "env_config": "kill/kill_zombie",
  "started_at": "2026-06-29T10:00:00Z"
}
```

What each field means:

| Field | Expected | Notes |
|-------|----------|-------|
| `status` | `"ok"` | Worker HTTP server is up |
| `env_alive` | `true` | Minecraft/MineStudio process is running |
| `session_id` | any 8-char hex | A session exists from a previous run |
| `env_config` | `"kill/kill_zombie"` | Kill-zombie scenario is loaded |
| `cumulative_step` | > 0 | Environment has stepped at least once |

If `env_alive` is `false`, start a fresh session with `JARVIS_PERSISTENT_RESET_ON_START=1` (see section 7).

---

## 6. Starting the worker (if needed)

The worker is the Python HTTP server running inside the RunPod conda env.  It is separate from the vLLM server.

```bash
npm run jarvis:worker -- start
```

This SCPs the worker script to RunPod and launches it inside tmux.  Wait ~10 seconds, then:

```bash
npm run jarvis:worker -- health
```

**Do not** use `start` if the worker is already running and healthy — it will clobber the existing session.  Check health first.

To tail worker logs:

```bash
npm run jarvis:worker -- logs
```

---

## 7. Run the JARVIS persistent demo

### Zombie combat (primary demo)

```bash
JARVIS_PERSISTENT_RESET_ON_START=1 \
MINE0_MAX_DECISION_STEPS=3 \
JARVIS_MAX_FRAMES=10 \
npm run jarvis:persistent -- "Kill zombies. Look around to find a zombie, approach it, and attack with your sword."
```

### Environment variable guide

| Variable | Value | What it does |
|----------|-------|--------------|
| `JARVIS_PERSISTENT_RESET_ON_START` | `1` | Starts a fresh Minecraft session; use `0` to reuse the existing one |
| `MINE0_MAX_DECISION_STEPS` | `3` | Mine0 planner runs up to 3 high-level decisions (subtask executions) |
| `JARVIS_MAX_FRAMES` | `10` | Each subgoal gets 10 low-level JARVIS frames (~5–15 s of game time) |

Increase `JARVIS_MAX_FRAMES` to `30–60` for more agent time per subtask, at the cost of a longer wall-clock run.

### Reuse session (no Minecraft restart)

```bash
JARVIS_PERSISTENT_RESET_ON_START=0 \
MINE0_MAX_DECISION_STEPS=3 \
JARVIS_MAX_FRAMES=10 \
npm run jarvis:persistent -- "Kill zombies. Look around to find a zombie, approach it, and attack with your sword."
```

Use `0` when you want to continue from the same world state without paying the 30–60 s Minecraft startup cost.

---

## 8. Expected good log signals

Look for these in the terminal output:

```
planner         : cerebras / gemma-4-31b
```
Confirms Cerebras is connected.  If it says `mock`, the API key is missing or wrong.

```
active subtask  : scan_for_zombie
```
Confirms the zombie combat decomposition is running (not a survival/crafting tree).

```
instruction     : "Look around for a zombie. Sweep the camera once left and once right..."
```
Confirms the concrete subtask-specific instruction is sent, not the abstract LLM token `visual_detection`.

```
successCondition: { item: "zombie_defeated", count: 1 }
```
Confirms the override is active; `oak_log` here means the override failed.

```
remoteExecutionSucceeded: true
cumulativeStepBefore: 0
cumulativeStepAfter: 10
```
Confirms the JARVIS worker stepped the environment and the frames ran.

```
activeSubtask (step 2) → orient_to_zombie   (not scan_for_zombie)
```
Confirms the scan-loop fix is working: after a repetitive camera loop on `scan_for_zombie`, Mine0 advances to the next subtask instead of repeating the same scan forever.

---

## 9. Known caveats — be honest in the demo

- **Low-level action quality is flaky.** JARVIS-VLA can repeat the same button/camera action across frames even with good instructions.  This is a model behavior issue, not a Mine0 bug.
- **`latest_pov.png` can be stale or glitchy.** It is saved after every frame but file writes can lag; do not treat it as real-time evidence of agent behavior.
- **The control layer works better than the embodied behavior.** Mine0 correctly decomposes the objective, sends concrete instructions, and advances past loops.  Whether JARVIS actually kills a zombie depends on its visual grounding at the time.
- **Do not claim the agent reliably kills zombies.**  Claim instead: the planner produces the right subtask sequence, the right instruction reaches JARVIS, and loop recovery works.
- **Camera range.** Logged actions sometimes show `camera=221`, which exceeds the standard MineStudio 0–120 range.  The environment steps without error (likely the kill_zombie config uses a wider discretization), but it may contribute to repeated camera drift.

---

## 10. Optional non-zombie demos

### Explore / scan

Lower risk — no combat, simpler evaluation:

```bash
JARVIS_PERSISTENT_RESET_ON_START=1 \
MINE0_MAX_DECISION_STEPS=3 \
JARVIS_MAX_FRAMES=20 \
npm run jarvis:persistent -- "Move forward, look around, and explore the area."
```

### Find a tree

Slightly more complex — has a clear visual goal:

```bash
JARVIS_PERSISTENT_RESET_ON_START=1 \
MINE0_MAX_DECISION_STEPS=3 \
JARVIS_MAX_FRAMES=20 \
npm run jarvis:persistent -- "Find a tree. Look around for an oak tree, move toward it, and try to mine one log."
```

### Avoid for a first demo

- **"Mine iron"** — requires finding a cave, a pickaxe, and ore.  This is a long survival progression with many prerequisite subtasks and is a poor first demo choice.

---

## 11. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Prompt shows `root@...:#` | You are already inside RunPod.  Do not SSH again — run commands directly. |
| Prompt shows your Mac terminal | SSH to RunPod is fine if needed. |
| Shell shows `bquote>` | Press **Ctrl+C** to cancel the incomplete command. |
| `bad option: --experimental-strip-types` | Wrong Node version.  Run `nvm use 24`. |
| `planner: mock / mock` in banner | `CEREBRAS_API_KEY` is not set or is invalid. |
| Worker health `env_alive: false` | Run with `JARVIS_PERSISTENT_RESET_ON_START=1` to start a fresh session. |
| `Worker SSH/curl failed` | Check SSH key path and RunPod host/port in `.env`. |
| `npm test` fails | Use `npm run check` instead — there is no `test` script. |
| Tests mention Vitest | Wrong repo or wrong branch.  This repo uses Node's built-in `--test` runner. |

### What NOT to commit

```
artifacts/demo/
artifacts/videos/
.env
node_modules/
```

These are gitignored but double-check with `git status` before committing.

---

## 12. Architecture reference

```
┌─────────────────────────────────────┐
│           Mine0 (local)             │
│                                     │
│  objective: "Kill zombies"          │
│       │                             │
│  ┌────▼──────────────┐              │
│  │  Cerebras/Gemma   │  text only   │
│  │  (planner)        │              │
│  └────┬──────────────┘              │
│       │  subtasks:                  │
│       │  scan_for_zombie            │
│       │  orient_to_zombie           │
│       │  approach_zombie            │
│       │  attack_zombie              │
│       │                             │
│  ┌────▼──────────────┐              │
│  │  JarvisPersistent │  SSH/curl    │
│  │  Executor         │──────────────┼──► RunPod worker (port 8765)
│  └───────────────────┘              │         │
└─────────────────────────────────────┘         │ /run_goal
                                                │
                                      ┌─────────▼──────────┐
                                      │   JARVIS-VLA agent  │
                                      │   (reads POV frame) │
                                      └─────────┬──────────┘
                                                │ actions
                                      ┌─────────▼──────────┐
                                      │  MineStudio / Java  │
                                      │  Minecraft 1.8.8    │
                                      └────────────────────┘
```

---

*Questions or issues → check `src/executor/jarvis_persistent_executor.ts` (Mine0 side) and `remote/jarvis_persistent_worker.py` (RunPod side).*
