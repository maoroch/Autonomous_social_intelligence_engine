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
  preferredProvider?: "gemini" | "openrouter" | "groq";
}

export interface AiCompletionResult {
  text: string;
  provider: "gemini" | "openrouter" | "groq";
  model: string;
}

export interface AiProviderConfig {
  geminiApiKey?: string;
  openrouterApiKey?: string;
  groqApiKey?: string;
  geminiModel?: string;
  openrouterModel?: string;
  groqModel?: string;
  redisUrl?: string;
  geminiRateLimit?: number;     // запросов в минуту (default: 12)
  openrouterRateLimit?: number; // запросов в минуту (default: 30)
  groqRateLimit?: number;       // запросов в минуту (default: 30)
}

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct";
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
    let delay = 3000; // 3 seconds

    const preferred = options.preferredProvider ?? (this.config.geminiApiKey ? "gemini" : "openrouter");

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 1. Primary Attempt (Preferred Provider)
      try {
        if (preferred === "gemini" && this.config.geminiApiKey) {
          return await this.callGemini(messages, options);
        } else if (preferred === "openrouter" && this.config.openrouterApiKey) {
          return await this.callOpenRouter(messages, options);
        } else if (preferred === "groq" && this.config.groqApiKey) {
          return await this.callGroq(messages, options);
        }
      } catch (primaryErr) {
        console.warn(`Primary provider (${preferred}) failed (attempt ${attempt}/${maxAttempts}). Error:`, primaryErr);
      }

      // 2. Fallback Chain
      try {
        if (this.config.geminiApiKey && preferred !== "gemini") {
          return await this.callGemini(messages, options);
        }
        if (this.config.openrouterApiKey && preferred !== "openrouter") {
          return await this.callOpenRouter(messages, options);
        }
        if (this.config.groqApiKey && preferred !== "groq") {
          return await this.callGroq(messages, options);
        }
      } catch (fallbackErr) {
        console.warn(`Fallback provider failed (attempt ${attempt}/${maxAttempts}). Error:`, fallbackErr);
      }

      if (attempt < maxAttempts) {
        console.warn(`All providers rate-limited or failed. Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay += 3000;
      }
    }

    throw new Error("All AI providers failed after multiple attempts.");
  }

  private async checkRateLimit(provider: "gemini" | "openrouter" | "groq"): Promise<boolean> {
    if (!this.redis) return true;

    const limit = provider === "gemini"
      ? (this.config.geminiRateLimit ?? 12)
      : provider === "openrouter"
      ? (this.config.openrouterRateLimit ?? 30)
      : (this.config.groqRateLimit ?? 30);

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

  private async acquireToken(provider: "gemini" | "openrouter" | "groq"): Promise<void> {
    if (!this.redis) return;

    let attempts = 0;
    while (attempts < 120) {
      const allowed = await this.checkRateLimit(provider);
      if (allowed) {
        break;
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private async callGemini(
    messages: ChatMessage[],
    options: AiCompletionOptions,
  ): Promise<AiCompletionResult> {
    const model = options.model ?? this.config.geminiModel ?? DEFAULT_GEMINI_MODEL;
    await this.acquireToken("gemini");

    const systemMsg = messages.find((m) => m.role === "system");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    if (contents.length === 0 && systemMsg) {
      contents.push({ role: "user", parts: [{ text: systemMsg.content }] });
    }

    const payload: any = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2000,
      },
    };

    if (systemMsg && contents.length > 0) {
      payload.systemInstruction = {
        parts: [{ text: systemMsg.content }],
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.geminiApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new ProviderError("gemini", res.status, await safeText(res));
    }

    const data = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { text, provider: "gemini", model };
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
    public readonly provider: "gemini" | "openrouter" | "groq",
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
