import { Redis } from "ioredis";

/**
 * Единая точка вызова LLM для всех агентов с поддержкой троттлинга через Redis.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiCompletionResult {
  text: string;
  provider: "openrouter" | "groq";
  model: string;
}

export interface AiProviderConfig {
  openrouterApiKey: string;
  groqApiKey: string;
  openrouterModel?: string;
  groqModel?: string;
  redisUrl?: string;
  openrouterRateLimit?: number; // запросов в минуту
  groqRateLimit?: number;       // запросов в минуту
}

const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export class AiClient {
  private redis?: Redis;

  constructor(private readonly config: AiProviderConfig) {
    if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    }
  }

  async complete(messages: ChatMessage[], options: AiCompletionOptions = {}): Promise<AiCompletionResult> {
    const maxAttempts = 3;
    let delay = 12000; // 12 seconds
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.callOpenRouter(messages, options);
      } catch (err) {
        console.warn(`OpenRouter call failed (attempt ${attempt}/${maxAttempts}). Error:`, err);
        try {
          return await this.callGroq(messages, options);
        } catch (groqErr) {
          console.warn(`Groq call failed (attempt ${attempt}/${maxAttempts}). Error:`, groqErr);
          
          const is429 = (err instanceof ProviderError && err.status === 429) || 
                        (groqErr instanceof ProviderError && groqErr.status === 429);
          
          if (is429 && attempt < maxAttempts) {
            console.warn(`Rate limit (429) encountered. Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay += 10000;
            continue;
          }
          
          if (attempt === maxAttempts) {
            throw new Error(
              `Both AI providers failed after ${maxAttempts} attempts. OpenRouter error: ${
                err instanceof Error ? err.message : String(err)
              }. Groq error: ${groqErr instanceof Error ? groqErr.message : String(groqErr)}`
            );
          }
        }
      }
    }
    throw new Error("Unexpected end of LLM call loop");
  }

  private async checkRateLimit(provider: "openrouter" | "groq"): Promise<boolean> {
    if (!this.redis) return true;

    const limit = provider === "openrouter"
      ? (this.config.openrouterRateLimit ?? 5)
      : (this.config.groqRateLimit ?? 5);

    const key = `ratelimit:${provider}`;
    const windowSeconds = 60;
    const now = Date.now();
    const clearBefore = now - windowSeconds * 1000;

    try {
      const multi = this.redis.multi();
      multi.zremrangebyscore(key, 0, clearBefore);
      multi.zcard(key);
      const results = await multi.exec();
      if (!results) return false;
      const count = (results as any)[1][1] as number;

      if (count >= limit) {
        return false;
      }

      await this.redis.zadd(key, now, `${now}-${Math.random()}`);
      await this.redis.expire(key, windowSeconds);
      return true;
    } catch (err) {
      console.warn(`[AiClient] Rate limiter Redis check failed for ${provider}:`, err);
      return true; // В случае падения редиса не блокируем работу LLM
    }
  }

  private async acquireToken(provider: "openrouter" | "groq"): Promise<void> {
    if (!this.redis) return;

    let attempts = 0;
    while (true) {
      const allowed = await this.checkRateLimit(provider);
      if (allowed) {
        break;
      }
      attempts++;
      if (attempts % 5 === 0) {
        console.warn(`[AiClient] Rate limit hit for ${provider}. Waiting for slot...`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  private async callOpenRouter(
    messages: ChatMessage[],
    options: AiCompletionOptions,
  ): Promise<AiCompletionResult> {
    const model = options.model ?? this.config.openrouterModel ?? DEFAULT_OPENROUTER_MODEL;

    await this.acquireToken("openrouter");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
      }),
    });

    if (!res.ok) {
      throw new ProviderError("openrouter", res.status, await safeText(res));
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return { text: data.choices[0]?.message?.content ?? "", provider: "openrouter", model };
  }

  private async callGroq(messages: ChatMessage[], options: AiCompletionOptions): Promise<AiCompletionResult> {
    let model = options.model ?? this.config.groqModel ?? DEFAULT_GROQ_MODEL;

    await this.acquireToken("groq");

    const makeRequest = async (selectedModel: string) => {
      return await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2000,
        }),
      });
    };

    let res = await makeRequest(model);

    if (!res.ok && res.status === 429 && model !== "llama-3.1-8b-instant") {
      console.warn("Groq rate limited on primary model. Trying fallback llama-3.1-8b-instant...");
      res = await makeRequest("llama-3.1-8b-instant");
      model = "llama-3.1-8b-instant";
    }

    if (!res.ok) {
      throw new ProviderError("groq", res.status, await safeText(res));
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return { text: data.choices[0]?.message?.content ?? "", provider: "groq", model };
  }
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: "openrouter" | "groq",
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`${provider} request failed with status ${status}: ${body}`);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable body>";
  }
}
