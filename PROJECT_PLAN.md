# Mine0 Project Plan

## Temporary Implementation Guardrail

Until API-usage limits are loosened, the live codebase should stay in `single-decision mode`.

- Generate one planner proposal per cycle.
- Take the first valid approach instead of running parallel planner branches.
- Skip rollout and critic fan-out in the live execution path for now.
- Keep perception structured and Mineflayer-native; do not reintroduce screenshots as planner input.

## Working Title

**MineZero / Mine0**: a Cerebras-powered multiverse planner that learns to play Minecraft by imagining several possible futures before acting.

## Core Pitch

Traditional embodied agents often have to choose between acting quickly and reasoning broadly. Mine0 uses Cerebras to explore multiple candidate futures in parallel before the Minecraft world has time to change, then commits to the best next action.

The goal is not to train a new end-to-end policy from scratch. The goal is to combine:

- high-level multimodal planning with Gemma on Cerebras
- a reliable Minecraft execution backend
- structured verification
- memory-based adaptation from prediction error

## User Prompt Entry Point

Mine0 should start from a **prompt box** where the user tells the agent what to do in natural language rather than selecting from a preset task list or fixed action menu.

Examples:

- `Get me a wooden pickaxe`
- `Gather wood and make a crafting table`
- `Find a safer area and avoid the river`
- `Collect stone for early tools`

The planner should treat this prompt as the active objective, decompose it into bounded subgoals, and replan continuously as the world changes.

## Demo Goal

The initial polished demo should still use a controlled survival world and a simple first objective such as:

`Gather wood, craft a crafting table, and obtain a wooden or stone pickaxe.`

Use a fixed seed with nearby trees and exposed stone. The compelling part is not reaching diamonds. The compelling part is watching several planning branches disagree, simulate outcomes, select a plan, act, discover whether they were right, and adapt after the user gives Mine0 a natural-language objective.

## System Overview

At every decision step, Mine0 should:

1. collect limited structured state from the active Minecraft backend
2. run perception to turn structured signals into a compact scene description
3. retrieve relevant memories
4. generate a single bounded plan in single-decision mode
5. execute the first valid action from that plan
6. verify the actual outcome against the predicted one
7. store the experience and replan

This is an online planning loop with in-context adaptation through memory, not gradient-based learning.

## Design Principles

- Structured perception must matter. Do not give the planner a perfect list of nearby blocks if limited state is supposed to drive scene understanding.
- Planning outputs must be structured JSON, not vague prose.
- Execution must be bounded and verifiable.
- Memory should influence future decisions through retrieval, not weight updates.
- The first milestone should optimize for reliability and observability, not action-space breadth.

## Execution Backends

Mine0 supports two interchangeable embodiment backends.

### Option A: JARVIS-VLA

JARVIS-VLA is the **primary** embodiment backend. It is the preferred path because Gemma can plan in natural language and JARVIS can directly execute bounded atomic instructions through visual keyboard-and-mouse control.

High-level flow:

1. the user enters a natural-language objective in the prompt box
2. Gemma decomposes that objective into a bounded atomic instruction such as `Collect three oak logs`
3. JARVIS-VLA receives the instruction plus the Minecraft observation
4. JARVIS-VLA executes low-level controls through MineStudio
5. the system returns the resulting observation and state
6. Mine0 verifies whether the result matched the prediction

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

Mineflayer is the **backup** embodiment backend in case JARVIS-VLA proves too difficult or unstable to get working for the first demo.

Mineflayer already supports:

- navigation and pathfinding
- mining and collecting blocks
- crafting
- inventory management
- block placement
- combat and interaction

Use Mineflayer-native structured perception for Gemma rather than image input.

In this fallback mode, Gemma can still reason from the user's freeform prompt, but the executor may need to translate the chosen intent into a smaller set of validated skills such as:

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

This mode resembles Voyager’s idea of an LLM operating Minecraft through high-level executable skills, but Mine0’s contribution is multimodal, parallel-future planning powered by Cerebras. Mineflayer is not the main product vision; it is the fallback body if the JARVIS path is blocked.

## Recommended Phase 1 Choice

Start with **JARVIS-VLA as the intended primary backend** and keep **Mineflayer + structured perception** ready as the contingency path if JARVIS integration cannot be stabilized quickly enough.

Recommended sequencing:

- design the planner around freeform user objectives from the prompt box
- define the executor interface around bounded atomic instructions
- attempt JARVIS-VLA integration first
- maintain Mineflayer as the fallback executor for demo reliability

Keep the abstraction boundary clean so both backends can share the same planner contracts.

## Role Split

The architecture is intentionally split into two roles with a small shared interface.

### Role 1: Planner

Input:

- structured state
- user prompt / objective
- retrieved memories

Output:

- one selected atomic instruction or macro-action

Responsibilities:

- Cerebras / Gemma API client
- image formatting and structured outputs
- Gemma perception agent
- user-prompt interpretation
- goal decomposition
- concurrent planner agents
- parallel future rollout agents
- critic and universe scoring
- selected next subgoal
- memory injection into prompts
- branch data for the dashboard

Pipeline:

`WorldState + UserObjective + Memory -> Perception -> Selected Instruction`

Example output:

```json
{
  "objective": "Get me a wooden pickaxe",
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
- collect structured state
- execute the selected action
- enforce action limits and safety conditions
- detect task success, timeout, or failure
- verify actual outcome
- calculate state deltas and prediction error
- store and retrieve memories
- stream execution and metrics to the dashboard

Pipeline:

`Selected Instruction -> Execution -> New State -> Verification -> Memory Update`

### Shared Interface

Only three core objects should cross between the two roles:

- `WorldState`
- `SubgoalIntent`
- `ActionOutcome`

This keeps both teammates from editing the same modules and keeps the backend swappable.

The user prompt should enter the system as a separate top-level input that Role 1 owns and interprets.

## Canonical Data Contracts

The core pipeline should be:

`WorldState -> CandidateAction -> PredictedFuture -> ActionOutcome`

### WorldState

`WorldState` should contain limited but meaningful structured context:

```json
{
  "timestamp": "2026-06-28T17:00:00Z",
  "user_objective": "Get me a stone pickaxe",
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
  "goal_progress": 0.1
}
```

Suggested fields:

- inventory
- health and hunger
- position
- time of day
- current user objective
- coarse progress toward objective
- perceived resources
- hazards
- structured nearby-block and interaction cues

Do not expose a perfect machine-readable list of all nearby blocks to the planner.

### CandidateAction

All action proposals should be strict, validated against schema, and compatible with the selected executor.

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

For the Mineflayer fallback path, the recommended initial skill allowlist is:

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

The perception stage should convert structured Mineflayer signals into a compact scene model suitable for planning.

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

In single-decision mode, propose one bounded next step for the current state and user prompt. Examples:

- gather wood immediately
- move toward exposed stone first if already enough wood exists
- reposition to a safer or more reachable location before collecting

### Rollout Stage

Rollout fan-out is disabled in the live path for now.

Each selected step should still predict:

- likely state changes
- success probability
- duration
- risks
- resource cost
- likely next observation

## Critic and Scoring

The critic should score futures with a fixed rubric rather than freeform preference.

Suggested scoring factors:

- objective progress
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

### Structured Verification

Use structured Mineflayer state to judge:

- whether terrain changed as expected
- whether a hazard is still present
- whether the bot reached the intended location
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

- user objective
- action type
- environment tags
- failure type
- resource context
- hazard context

### Reusable Skill Definition

A reusable skill is:

- a successful sequence of bounded actions or validated fallback skills
- plus the preconditions under which that sequence tends to work

### Failure Policy

When execution fails:

1. stop the action
2. record the failure and prediction error
3. replan from the new state
4. do not blindly retry the same action unless circumstances changed

## Exact Decision Loop

The implementation target should follow this loop:

1. collect structured state
2. run perception to produce a scene model
3. retrieve relevant past experiences
4. propose one bounded strategy
5. execute the selected action
6. compare prediction against reality
7. store the experience
8. replan
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

- `WorldState`, `SubgoalIntent`, and `ActionOutcome` flow through a mocked loop end to end, driven by a freeform user prompt

### Phase 1: Reliable Minecraft Loop

Build:

- executor interface for bounded atomic instructions
- JARVIS-VLA backend attempt
- structured state extraction
- Mineflayer fallback backend with structured perception
- bounded action execution

Success criteria:

- a prompt-box objective can be turned into an executable bounded instruction and return a structured outcome through at least one backend

### Phase 2: Perception and Planner

Build:

- Gemma perception prompt
- planner prompt
- rollout prompt
- critic prompt
- structured output parser

Success criteria:

- one decision cycle runs from structured state to selected action

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

### Phase 5: Backend Hardening and Parity

Build:

- full MineStudio integration
- JARVIS executor hardening
- Mineflayer fallback parity
- backend swap testing

Success criteria:

- planner can swap between JARVIS and Mineflayer without changing upstream contracts

## Risks and Mitigations

### Risk: Vision becomes decorative

Mitigation:

- do not give the planner exact nearby block lists
- rely on structured state plus limited perception cues for semantic target selection

### Risk: Action hallucination

Mitigation:

- strict JSON schema
- executor-side capability checks
- argument validation
- executor-side safety checks

### Risk: JARVIS integration instability

Mitigation:

- keep Mineflayer as a fully usable fallback backend
- preserve a backend-agnostic executor contract
- reduce the first demo to a constrained world and bounded objectives

### Risk: Demo instability

Mitigation:

- use a fixed seed
- reduce action scope
- keep the first prompt objective narrow
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
2. add a prompt-box driven `UserObjective` entrypoint
3. build a pluggable executor interface
4. attempt the JARVIS execution backend first
5. implement the Mineflayer fallback backend
6. add structured state extraction
7. wire one full planning loop with mocked Cerebras outputs
8. replace mocks with real perception, planning, rollout, and critic calls
9. add verification and memory
10. build the dashboard and baseline comparison

## One-Sentence Summary

Mine0 is a Minecraft embodied agent architecture where a user gives a natural-language objective in a prompt box, Gemma on Cerebras imagines several structured futures in parallel, selects the best next action, executes it through JARVIS if possible or Mineflayer as backup, verifies what actually happened, and improves through memory-driven replanning.
