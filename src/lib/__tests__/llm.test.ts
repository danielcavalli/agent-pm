import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLLMClient } from "../llm.js";

const successPayload = {
  id: "resp_123",
  object: "chat.completion",
  created: 1,
  model: "gpt-4o-mini",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: '{"ok":true}',
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 1,
    completion_tokens: 1,
    total_tokens: 2,
  },
};

describe("llm client retry and timeout controls", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.OPENAI_API_KEY;
  });

  it("retries once after a timeout and succeeds", async () => {
    const onRetry = vi.fn();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => successPayload,
      });

    vi.stubGlobal("fetch", fetchMock);

    const client = createLLMClient();
    const pending = client.complete("hello", {
      timeoutMs: 1000,
      maxRetries: 1,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;

    expect(response).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        maxAttempts: 2,
        reason: "OpenAI request timed out after 1000ms",
      }),
    );
  });

  it("stops after the configured number of retry attempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => "temporary failure",
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createLLMClient();

    await expect(
      client.complete("hello", {
        timeoutMs: 1000,
        maxRetries: 1,
      }),
    ).rejects.toThrow("OpenAI API error: 500 Server Error - temporary failure");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
