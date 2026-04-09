import { z } from "zod";

const OpenAIResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z
    .array(
      z.object({
        index: z.number(),
        message: z.object({
          role: z.string(),
          content: z.string(),
        }),
        finish_reason: z.string(),
      }),
    )
    .length(1),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

export interface LLMClient {
  complete(prompt: string, options?: LLMRequestOptions): Promise<string>;
}

export interface LLMRequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  onRetry?: (event: {
    attempt: number;
    maxAttempts: number;
    reason: string;
  }) => void;
}

export function createLLMClient(): LLMClient {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required for LLM features. " +
        "Please set it before running consolidation with semantic clustering.",
    );
  }

  return new OpenAIClient(apiKey);
}

class OpenAIClient implements LLMClient {
  private apiKey: string;
  private model = "gpt-4o-mini";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async complete(prompt: string, options?: LLMRequestOptions): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? 30000;
    const maxRetries = options?.maxRetries ?? 2;
    const maxAttempts = maxRetries + 1;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.completeOnce(prompt, timeoutMs);
      } catch (error) {
        const normalized = normalizeLlmError(error, timeoutMs);
        lastError = normalized;

        if (!normalized.retryable || attempt >= maxAttempts) {
          throw normalized;
        }

        options?.onRetry?.({
          attempt,
          maxAttempts,
          reason: normalized.message,
        });
      }
    }

    throw lastError ?? new Error("LLM request failed");
  }

  private async completeOnce(
    prompt: string,
    timeoutMs: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMRequestError(
          `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`,
          isRetryableStatus(response.status),
        );
      }

      const data = OpenAIResponseSchema.parse(await response.json());
      return data.choices[0]?.message?.content ?? "";
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

class LLMRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "LLMRequestError";
    this.retryable = retryable;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function normalizeLlmError(error: unknown, timeoutMs: number): LLMRequestError {
  if (error instanceof LLMRequestError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new LLMRequestError(
      `OpenAI response validation failed: ${error.issues[0]?.message ?? "invalid response"}`,
      false,
    );
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new LLMRequestError(
        `OpenAI request timed out after ${timeoutMs}ms`,
        true,
      );
    }

    return new LLMRequestError(error.message, true);
  }

  return new LLMRequestError("OpenAI request failed", true);
}
