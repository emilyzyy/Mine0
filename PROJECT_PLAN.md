# Mine0 Project Plan

## Working Title

**MineZero / Mine0**: a Cerebras-powered multiverse planner that learns to play Minecraft by imagining several possible futures before acting.

## Core Pitch

Traditional embodied agents often have to choose between acting quickly and reasoning broadly. Mine0 uses Cerebras to explore multiple candidate futures in parallel before the Minecraft world has time to change, then commits to the best next action.

The goal is not to train a new end-to-end policy from scratch. The goal is to combine:

- high-level multimodal planning with Gemma on Cerebras
- a reliable Minecraft execution backend
- structured verification
- memory-based adaptation from prediction error

## Demo Goal

The initial polished demo should run in a controlled survival world and:

1. inspect the environment
2. gather wood
3. craft a crafting table
4. obtain a wooden or stone pickaxe

Use a fixed seed with nearby trees and exposed stone. The compelling part is not reaching diamonds. The compelling part is watching several planning branches disagree, simulate outcomes, select a plan, act, discover whether they were right, and adapt.

## System Overview

At every decision step, Mine0 should:

1. capture a first-person Minecraft screenshot
2. collect limited structured state
3. run perception to turn the screenshot into a structured scene description
4. retrieve relevant memories
5. generate several competing plans
6. roll out several predicted futures concurrently
7. score futures with a critic
8. execute only the first action from the best future
9. verify the actual outcome against the predicted one
10. store the experience and replan

This is an online planning loop with in-context adaptation through memory, not gradient-based learning.

## Design Principles

- Vision must matter. Do not give the planner a perfect list of nearby blocks if the screenshot is supposed to drive scene understanding.
- Planning outputs must be structured JSON, not vague prose.
- Execution must be bounded, allowlisted, and verifiable.
- Memory should influence future decisions through retrieval, not weight updates.
- The first milestone should optimize for reliability and observability, not action-space breadth.

## Execution Backends

Mine0 supports two interchangeable embodiment backends.

### Option A: JARVIS-VLA

JARVIS-VLA is the more visually impressive backend because Gemma imagines and selects the future, while a pretrained VLA physically realizes it through visual keyboard-and-mouse control.

High-level flow:

1. Gemma produces a bounded atomic instruction such as `Collect three oak logs`
2. JARVIS-VLA receives the instruction plus the Minecraft observation
3. JARVIS-VLA executes low-level controls through MineStudio
4. the system returns the resulting observation and state
5. Mine0 verifies whether the result matched the prediction

Suggested positioning:

- Gemma = planner and strategist
- Cerebras = parallel future simulation engine
- JARVIS-VLA = visuomotor controller
- MineStudio = environment and action interface

Loose inspiration: pi0-style separation between high-level multimodal reasoning and learned low-level control.

References:

- [JARVIS-VLA](https://craftjarvis.github.io/JarvisVLA/)
- [MineStudio](https://github.com/CraftJarvis/MineStudio)

### Option B: Mineflayer

Mineflayer is the more controllable engineering path and likely the better first implementation path for a reliable demo.

Mineflayer already supports:

- navigation and pathfinding
- mining and collecting blocks
- crafting
- inventory management
- block placement
- combat and interaction

Use `prismarine-viewer` to render the first-person image for Gemma.

In this mode, Gemma selects only allowlisted macro-actions such as:

- `scan(direction)`
- `explore(direction)`
- `collect(block_type, count)`
- `craft(item, count)`
- `equip(item)`
- `place(block_type, location)`

Stretch actions for later:

- `eat()`
- `retreat()`
- combat-related actions

This mode resembles Voyager’s idea of an LLM operating Minecraft through high-level executable skills, but Mine0’s contribution is multimodal, parallel-future planning powered by Cerebras.

## Recommended Phase 1 Choice

Start with **Mineflayer + prismarine-viewer** for the first end-to-end demo.

Reasons:

- easier to debug and verify
- lower execution variance
- simpler success detection
- faster iteration on planner interfaces
- less risk than integrating a full visuomotor model at the start

Keep the abstraction boundary clean so JARVIS-VLA can be added later without changing the planner contracts.

## Role Split

The architecture is intentionally split into two roles with a small shared interface.

### Role 1: Dotoro

Input:

- Minecraft screenshot
- structured state
- goal
- retrieved memories

Output:

- one selected atomic instruction or macro-action

Responsibilities:

- Cerebras / Gemma API client
- image formatting and structured outputs
- Gemma perception agent
- goal decomposition
- concurrent planner agents
- parallel future rollout agents
- critic and universe scoring
- selected next subgoal
- memory injection into prompts
- branch data for the dashboard

Pipeline:

`Screenshot + WorldState + Goal + Memory -> Perception -> Competing Plans -> Imagined Futures -> Critic -> Selected Instruction`

Example output:

```json
{
  "instruction": "Collect three oak logs",
  "success_condition": {
    "item": "oak_log",
    "count": 3
  },
  "maximum_steps": 400
}
```

### Role 2: Embodiment and Feedback

Input:

- selected instruction from Role 1

Output:

- observed result and relevant memories

Responsibilities:

- run Minecraft environment
- capture screenshots and state
- execute the selected action
- enforce action limits and safety conditions
- detect task success, timeout, or failure
- verify actual outcome
- calculate state deltas and prediction error
- store and retrieve memories
- stream execution and metrics to the dashboard

Pipeline:

`Selected Instruction -> Execution -> New Screenshot + State -> Verification -> Memory Update`

### Shared Interface

Only three objects should cross between the two roles:

- `WorldState`
- `SubgoalIntent`
- `ActionOutcome`

This keeps both teammates from editing the same modules and keeps the backend swappable.

## Canonical Data Contracts

The core pipeline should be:

`WorldState -> CandidateAction -> PredictedFuture -> ActionOutcome`

### WorldState

`WorldState` should contain limited but meaningful structured context:

```json
{
  "timestamp": "2026-06-28T17:00:00Z",
  "goal": "obtain_stone_pickaxe",
  "position": {"x": 120.5, "y": 65.0, "z": -31.2},
  "biome_or_region_hint": "forest_edge",
  "health": 20,
  "hunger": 18,
  "inventory": [
    {"item": "oak_log", "count": 2}
  ],
  "equipped_item": "air",
  "time_of_day": "day",
  "scene_summary": null,
  "visible_hazards": [],
  "goal_progress": 0.1,
  "screenshot_path": "artifacts/frames/step_001.png"
}
```

Suggested fields:

- inventory
- health and hunger
- position
- time of day
- current objective
- coarse progress toward objective
- perceived resources
- hazards
- screenshot reference

Do not expose a perfect machine-readable list of all nearby blocks to the planner.

### CandidateAction

All actions should be strict, allowlisted, and validated against schema.

```json
{
  "name": "collect",
  "arguments": {
    "block_type": "oak_log",
    "count": 3
  },
  "reason": "wood is required for tools and a nearby tree is visible"
}
```

Recommended initial allowlist:

- `scan(direction)`
- `explore(direction)`
- `collect(block_type, count)`
- `craft(item, count)`
- `equip(item)`
- `place(block_type, location)`

### PredictedFuture

A future must be structured enough for the critic to compare branches consistently.

```json
{
  "candidate_action": {
    "name": "collect",
    "arguments": {"block_type": "oak_log", "count": 3}
  },
  "preconditions": ["oak tree visible", "reachable path"],
  "predicted_steps": [
    {
      "action": "approach nearest oak tree",
      "expected_result": "arrive within mining distance"
    },
    {
      "action": "collect 3 oak logs",
      "expected_result": "inventory gains 3 oak logs"
    }
  ],
  "success_probability": 0.88,
  "estimated_seconds": 22,
  "risk": 0.08,
  "resource_cost": 0,
  "goal_progress": 0.25
}
```

Minimum required fields:

- candidate action
- preconditions
- predicted steps
- success probability
- estimated duration
- risk
- resource cost
- expected goal progress

### ActionOutcome

`ActionOutcome` captures what actually happened.

```json
{
  "executed_action": {
    "name": "collect",
    "arguments": {"block_type": "oak_log", "count": 3}
  },
  "status": "partial_success",
  "duration_seconds": 31,
  "inventory_delta": [
    {"item": "oak_log", "count_change": 2}
  ],
  "health_delta": 0,
  "hunger_delta": -1,
  "position_delta": {"x": 7.3, "y": 0.0, "z": -4.1},
  "visual_verification": {
    "target_reached": true,
    "terrain_changed_as_expected": true,
    "hazard_present": false
  },
  "failure_reason": null
}
```

## Perception

The perception stage should convert the screenshot into a compact scene model suitable for planning.

Expected outputs:

- visible resource types
- terrain affordances
- hazards
- likely reachable targets
- confidence notes

Example perception summary:

- nearby oak tree ahead-left
- exposed stone visible near slope
- open grass path forward
- no immediate hostile mobs
- river nearby may slow traversal

This scene model should be merged into `WorldState.scene_summary`.

## Planning and Rollouts

### Planner Stage

Use 3 planner agents to propose distinct high-level strategies for the current state. Examples:

- gather wood immediately
- move toward exposed stone first if already enough wood exists
- reposition to a safer or more reachable location before collecting

Validate and deduplicate their proposed actions before rollouts.

### Rollout Stage

For each valid candidate, run 4 to 6 imagined futures concurrently at first.

Do not start with 10 branches on day one. Measure token use and latency first, then increase branch count later if budgets allow.

Each rollout should predict:

- likely state changes
- success probability
- duration
- risks
- resource cost
- likely next observation

## Critic and Scoring

The critic should score futures with a fixed rubric rather than freeform preference.

Suggested scoring factors:

- goal progress
- success probability
- risk
- time cost
- resource cost
- consistency with retrieved memory

Example conceptual formula:

```text
score =
  0.40 * goal_progress +
  0.30 * success_probability -
  0.15 * risk -
  0.10 * normalized_time_cost -
  0.05 * normalized_resource_cost
```

Memory can be used as an adjustment term or by modifying the underlying probability and risk estimates before final scoring.

## Verification

Verification should be hybrid.

### Programmatic Verification

Use code to verify:

- inventory changes
- health changes
- hunger changes
- position and distance traveled
- execution duration
- whether the executor reported success
- whether the expected item now exists

### Vision-Assisted Verification

Use Gemma or another visual verifier to judge:

- whether terrain changed as expected
- whether a hazard is still present
- whether the bot reached the visually intended location
- whether the final scene matches the predicted result

This avoids one LLM merely agreeing with another LLM and gives genuine prediction-error measurement.

## Memory and Learning

Mine0 should adapt through memory, not weight updates.

Store:

- attempted action
- predicted outcome
- actual outcome
- prediction error
- environmental context
- successful action sequences
- failure conditions

### Memory Retrieval Keys

Retrieve experiences by:

- goal
- action type
- environment tags
- failure type
- resource context
- hazard context

### Reusable Skill Definition

A reusable skill is:

- a successful sequence of allowlisted macro-actions
- plus the preconditions under which that sequence tends to work

### Failure Policy

When execution fails:

1. stop the action
2. record the failure and prediction error
3. replan from the new state
4. do not blindly retry the same action unless circumstances changed

## Exact Decision Loop

The implementation target should follow this loop:

1. capture screenshot and structured state
2. run perception to produce a scene model
3. retrieve relevant past experiences
4. run 3 planner agents to propose distinct strategies
5. validate and deduplicate actions
6. run 4 to 6 future rollouts concurrently
7. score them with the critic
8. execute only the first action of the winning future
9. capture resulting screenshot and state
10. compare prediction against reality
11. store the experience
12. replan
13. stop on success or failure condition

## Dashboard Requirements

To make Cerebras speed visibly meaningful, the demo should show:

- 6 to 10 alternative futures eventually, after the initial stable version
- a live decision tree of branches
- per-branch latency
- Cerebras `time_info`
- the selected branch clearly highlighted
- a comparison against a slower provider using identical prompts

Core message:

Mine0 can evaluate broader planning breadth within the same latency budget.

## Baseline Comparison

The evaluation should compare two modes on the same fixed seed.

### Greedy Baseline

One planning agent selects the next action immediately with no multiverse rollout competition.

### Mine0 Multiverse Mode

Several branches imagine futures, score them, and then act.

### Metrics

Measure:

- goal completion
- number of failed actions
- total decisions
- planning latency
- predicted versus actual outcomes
- whether retrieved memory changes a later decision

## Initial Module Plan

The codebase should be organized around clean typed interfaces.

Suggested top-level modules:

- `src/contracts/`
- `src/planner/`
- `src/perception/`
- `src/memory/`
- `src/critic/`
- `src/executor/`
- `src/verifier/`
- `src/dashboard/`
- `src/evaluation/`

Suggested contract files:

- `world_state.ts`
- `candidate_action.ts`
- `predicted_future.ts`
- `action_outcome.ts`
- `memory_entry.ts`

Suggested service files:

- `planner_service.ts`
- `rollout_service.ts`
- `critic_service.ts`
- `memory_service.ts`
- `verification_service.ts`
- `executor_interface.ts`
- `mineflayer_executor.ts`
- `jarvis_executor.ts`

## Recommended Implementation Phases

### Phase 0: Contracts and Skeleton

Build:

- typed shared data contracts
- JSON schema validation
- logging and artifact directories
- pluggable executor interface

Success criteria:

- `WorldState`, `SubgoalIntent`, and `ActionOutcome` flow through a mocked loop end to end

### Phase 1: Reliable Minecraft Loop

Build:

- Mineflayer backend
- screenshot capture with prismarine-viewer
- state extraction
- bounded action execution

Success criteria:

- scripted allowlisted actions can execute and return structured outcomes

### Phase 2: Perception and Planner

Build:

- Gemma perception prompt
- planner prompt
- rollout prompt
- critic prompt
- structured output parser

Success criteria:

- one decision cycle runs from screenshot to selected action

### Phase 3: Verification and Memory

Build:

- prediction versus actual comparison
- memory write path
- memory retrieval path
- failure tagging

Success criteria:

- repeated scenarios show changed branch scoring due to prior failures or successes

### Phase 4: Dashboard and Demo

Build:

- branch tree UI
- latency display
- selected branch highlight
- baseline comparison mode
- replay artifacts

Success criteria:

- polished live demo on fixed seed

### Phase 5: JARVIS-VLA Backend

Build:

- MineStudio integration
- JARVIS executor adapter
- parity with executor interface

Success criteria:

- planner can swap from Mineflayer to JARVIS without changing upstream contracts

## Risks and Mitigations

### Risk: Vision becomes decorative

Mitigation:

- do not give the planner exact nearby block lists
- rely on screenshot plus limited state for semantic target selection

### Risk: Action hallucination

Mitigation:

- strict JSON schema
- allowlisted actions
- argument validation
- executor-side safety checks

### Risk: Demo instability

Mitigation:

- use a fixed seed
- reduce action space
- start with Mineflayer
- cap action duration and retries

### Risk: Planning latency hides Cerebras value

Mitigation:

- show branch-level latency and provider comparison
- keep rollout outputs compact and structured

### Risk: Too much surface area at once

Mitigation:

- defer combat, food management, and advanced retreat behavior
- optimize first for the wood-to-pickaxe path

## Near-Term Deliverables

The next concrete build target should be:

1. define the typed `WorldState -> CandidateAction -> PredictedFuture -> ActionOutcome` contracts
2. build a pluggable executor interface
3. implement the Mineflayer execution backend first
4. add screenshot capture and state extraction
5. wire one full planning loop with mocked Cerebras outputs
6. replace mocks with real perception, planning, rollout, and critic calls
7. add verification and memory
8. build the dashboard and baseline comparison

## One-Sentence Summary

Mine0 is a Minecraft embodied agent architecture where Gemma on Cerebras imagines several structured futures in parallel, selects the best next action, executes it through a swappable controller, verifies what actually happened, and improves through memory-driven replanning.
