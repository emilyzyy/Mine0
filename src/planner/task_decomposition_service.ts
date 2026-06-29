import type { SubgoalIntent } from "../contracts/subgoal_intent.ts";
import type { WorldState } from "../contracts/world_state.ts";
import {
  CerebrasClient,
  type ProviderCallMeta,
} from "./cerebras_client.ts";
import { subtaskRequirementMet } from "./subtask_progress.ts";
import {
  taskDecompositionSystemPrompt,
  taskDecompositionUserPrompt,
  taskRefinementSystemPrompt,
  taskRefinementUserPrompt,
} from "./planner_prompts.ts";
import { taskDecompositionSchema, taskRefinementSchema } from "./planner_schemas.ts";
import type { Subtask, TaskPlanningContext } from "./task_stack_service.ts";

const ALLOWED_ACTIONS = new Set([
  "scan",
  "explore",
  "collect",
  "craft",
  "smelt",
  "equip",
  "place",
  "use",
]);

interface RawSubtask {
  id: string;
  description: string;
  planningFocus: string;
  expectedAction: string;
  targetItem: string;
  targetCount: number;
  destination: string;
}

interface DecompositionResponse {
  reasoning: string;
  subtasks: RawSubtask[];
}

interface RefinementResponse {
  reasoning: string;
  prerequisiteSubtasks: RawSubtask[];
}

function slugifyId(value: string, index: number): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || `subtask_${index + 1}`;
}

function optionalField(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTargetCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return 1;
}

export function normalizeLlmSubtasks(rawSubtasks: RawSubtask[], objective: string): Subtask[] {
  const seen = new Set<string>();
  const normalized: Subtask[] = [];

  for (const [index, raw] of rawSubtasks.entries()) {
    const expectedAction = raw.expectedAction.trim().toLowerCase();
    if (!ALLOWED_ACTIONS.has(expectedAction)) {
      continue;
    }

    let id = slugifyId(raw.id || raw.description || raw.planningFocus, index);
    if (seen.has(id)) {
      id = `${id}_${index + 1}`;
    }
    seen.add(id);

    normalized.push({
      id,
      description: raw.description.trim() || raw.planningFocus.trim() || objective,
      planningFocus: raw.planningFocus.trim() || raw.description.trim() || objective,
      compound: false,
      parentId: "goal",
      expectedAction,
      targetItem: optionalField(raw.targetItem),
      targetCount: normalizeTargetCount(raw.targetCount),
      destination: optionalField(raw.destination),
    });
  }

  return normalized;
}

function subtaskSatisfiedByInventory(subtask: Subtask, worldState: WorldState): boolean {
  if (!subtask.targetItem) {
    return false;
  }

  if (subtask.expectedAction === "place" || subtask.expectedAction === "use") {
    return false;
  }

  if (
    subtask.expectedAction === "explore" ||
    subtask.expectedAction === "scan" ||
    /(locate|search|pathfind|reach)\b/.test(subtask.planningFocus.toLowerCase())
  ) {
    return false;
  }

  return subtaskRequirementMet(subtask, worldState.inventory);
}

export function filterSatisfiedSubtasks(subtasks: Subtask[], worldState: WorldState): Subtask[] {
  return subtasks.filter((subtask) => !subtaskSatisfiedByInventory(subtask, worldState));
}

export class TaskDecompositionService {
  private readonly client: CerebrasClient;

  constructor(client = new CerebrasClient()) {
    this.client = client;
  }

  async decomposeObjective(
    objective: string,
    worldState: WorldState,
    memorySummary: string[] = [],
  ): Promise<{ subtasks: Subtask[] | null; meta: ProviderCallMeta }> {
    if (!this.client.config.apiKey) {
      return {
        subtasks: null,
        meta: {
          label: "task_decomposition",
          provider: "mock",
          model: "mock",
          status: "skipped",
          latencyMs: 0,
          usage: null,
          timeInfo: null,
          warning: "Using heuristic task decomposition because CEREBRAS_API_KEY is not configured.",
        },
      };
    }

    const result = await this.client.requestStructured<DecompositionResponse>({
      label: "task_decomposition",
      schemaName: "task_decomposition",
      schema: taskDecompositionSchema,
      messages: [
        { role: "system", content: taskDecompositionSystemPrompt() },
        { role: "user", content: taskDecompositionUserPrompt(objective, worldState, memorySummary) },
      ],
      maxOutputTokens: 2048,
      temperature: 0.2,
    });

    if (!result.data?.subtasks?.length) {
      return { subtasks: null, meta: result.meta };
    }

    const normalized = normalizeLlmSubtasks(result.data.subtasks, objective);
    if (normalized.length === 0) {
      return { subtasks: null, meta: result.meta };
    }

    const filtered = filterSatisfiedSubtasks(normalized, worldState);
    return {
      subtasks: filtered.length > 0 ? filtered : null,
      meta: result.meta,
    };
  }

  async refineOnFailure(
    objective: string,
    taskContext: TaskPlanningContext,
    failureReason: string,
    worldState: WorldState,
    intent: SubgoalIntent,
  ): Promise<{ subtasks: Subtask[]; meta: ProviderCallMeta }> {
    if (!this.client.config.apiKey) {
      return {
        subtasks: [],
        meta: {
          label: "task_refinement",
          provider: "mock",
          model: "mock",
          status: "skipped",
          latencyMs: 0,
          usage: null,
          timeInfo: null,
          warning: "Skipped LLM task refinement because CEREBRAS_API_KEY is not configured.",
        },
      };
    }

    const failedAction = intent.candidateAction.name;
    const result = await this.client.requestStructured<RefinementResponse>({
      label: "task_refinement",
      schemaName: "task_refinement",
      schema: taskRefinementSchema,
      messages: [
        { role: "system", content: taskRefinementSystemPrompt() },
        {
          role: "user",
          content: taskRefinementUserPrompt(objective, worldState, taskContext, failureReason, failedAction),
        },
      ],
      maxOutputTokens: 1024,
      temperature: 0.2,
    });

    if (!result.data?.prerequisiteSubtasks?.length) {
      return { subtasks: [], meta: result.meta };
    }

    const pendingIds = new Set(taskContext.pendingSubtasks.map((entry) => entry.id));
    const completedIds = new Set(taskContext.completedSubtasks.map((entry) => entry.id));
    const normalized = normalizeLlmSubtasks(result.data.prerequisiteSubtasks, objective).filter(
      (subtask) => !pendingIds.has(subtask.id) && !completedIds.has(subtask.id),
    );

    return {
      subtasks: filterSatisfiedSubtasks(normalized, worldState),
      meta: result.meta,
    };
  }
}
