import { loadPlannerConfig, type PlannerConfig } from "../shared/config.ts";

export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ProviderCallMeta {
  label: string;
  provider: "mock" | "cerebras";
  model: string;
  status: "success" | "fallback" | "skipped";
  latencyMs: number;
  usage: ProviderUsage | null;
  timeInfo: Record<string, number> | null;
  warning: string | null;
}

type ChatRole = "system" | "user";

interface TextContentPart {
  type: "text";
  text: string;
}

type MessageContent = string | Array<TextContentPart>;

interface ChatMessage {
  role: ChatRole;
  content: MessageContent;
}

interface StructuredRequest {
  label: string;
  schemaName: string;
  schema: Record<string, unknown>;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

interface StructuredResponse<T> {
  data: T | null;
  meta: ProviderCallMeta;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .flatMap((entry) => {
        if (entry && typeof entry === "object" && "text" in entry && typeof entry.text === "string") {
          return [entry.text];
        }

        return [];
      })
      .join("\n");
  }

  return "";
}

export class CerebrasClient {
  readonly config: PlannerConfig;

  constructor(config = loadPlannerConfig()) {
    this.config = config;
  }

  async buildUserContent(text: string): Promise<MessageContent> {
    return text;
  }

  async requestStructured<T>(request: StructuredRequest): Promise<StructuredResponse<T>> {
    if (!this.config.apiKey) {
      return {
        data: null,
        meta: {
          label: request.label,
          provider: "mock",
          model: "mock",
          status: "skipped",
          latencyMs: 0,
          usage: null,
          timeInfo: null,
          warning: "CEREBRAS_API_KEY is not configured.",
        },
      };
    }

    const preferredModels = [this.config.model];
    if (
      this.config.fallbackModel &&
      this.config.fallbackModel !== this.config.model
    ) {
      preferredModels.push(this.config.fallbackModel);
    }

    let lastError: string | null = null;

    for (let index = 0; index < preferredModels.length; index += 1) {
      const model = preferredModels[index] ?? this.config.model;
      const startedAt = Date.now();

      try {
        const response = await fetch(this.config.baseUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: request.messages,
            temperature: request.temperature ?? this.config.temperature,
            max_completion_tokens:
              request.maxOutputTokens ?? this.config.maxOutputTokens,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: request.schemaName,
                strict: true,
                schema: request.schema,
              },
            },
          }),
        });

        const json = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          lastError = JSON.stringify(json);
          continue;
        }

        const choices = Array.isArray(json.choices) ? json.choices : [];
        const firstChoice = choices[0] as
          | { message?: { content?: unknown } }
          | undefined;
        const content = extractTextContent(firstChoice?.message?.content);
        const parsed = JSON.parse(content) as T;
        const usageObject =
          json.usage && typeof json.usage === "object"
            ? (json.usage as Record<string, unknown>)
            : null;
        const timeInfo =
          json.time_info && typeof json.time_info === "object"
            ? (json.time_info as Record<string, unknown>)
            : null;

        return {
          data: parsed,
          meta: {
            label: request.label,
            provider: "cerebras",
            model,
            status: index === 0 ? "success" : "fallback",
            latencyMs: Date.now() - startedAt,
            usage: usageObject
              ? {
                  promptTokens: asNumber(usageObject.prompt_tokens) ?? 0,
                  completionTokens: asNumber(usageObject.completion_tokens) ?? 0,
                  totalTokens: asNumber(usageObject.total_tokens) ?? 0,
                }
              : null,
            timeInfo: timeInfo
              ? Object.fromEntries(
                  Object.entries(timeInfo).flatMap(([key, value]) => {
                    const numeric = asNumber(value);
                    return numeric === null ? [] : [[key, numeric]];
                  }),
                )
              : null,
            warning: index === 0 ? null : `Fell back to ${model} after a prior model error.`,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown Cerebras request error.";
      }
    }

    return {
      data: null,
      meta: {
        label: request.label,
        provider: "cerebras",
        model: this.config.model,
        status: "fallback",
        latencyMs: 0,
        usage: null,
        timeInfo: null,
        warning: lastError ?? "Cerebras request failed.",
      },
    };
  }
}
