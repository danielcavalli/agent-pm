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
  complete(prompt: string): Promise<string>;
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

  async complete(prompt: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = OpenAIResponseSchema.parse(await response.json());
    return data.choices[0]?.message?.content ?? "";
  }
}
