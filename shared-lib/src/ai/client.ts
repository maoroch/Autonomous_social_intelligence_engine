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
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

export class AiClient {
  private redis?: Redis;

  constructor(private readonly config: AiProviderConfig) {
    if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    }
  }

  async complete(messages: ChatMessage[], options: AiCompletionOptions = {}): Promise<AiCompletionResult> {
    const forcedProvider = (process.env.AI_PROVIDER || options.preferredProvider) as "gemini" | "groq" | "openrouter" | undefined;
    const isProd = process.env.NODE_ENV === "production";

    let defaultProvider: "gemini" | "groq" | "openrouter";
    if (forcedProvider) {
      defaultProvider = forcedProvider;
    } else if (isProd) {
      defaultProvider = this.config.geminiApiKey ? "gemini" : (this.config.groqApiKey ? "groq" : "openrouter");
    } else {
      defaultProvider = this.config.groqApiKey ? "groq" : (this.config.openrouterApiKey ? "openrouter" : "gemini");
    }

    const preferred = forcedProvider ?? defaultProvider;

    const providers: Record<"gemini" | "openrouter" | "groq", { key?: string; call: () => Promise<AiCompletionResult> }> = {
      gemini: { key: this.config.geminiApiKey, call: () => this.callGemini(messages, options) },
      groq: { key: this.config.groqApiKey, call: () => this.callGroq(messages, options) },
      openrouter: { key: this.config.openrouterApiKey, call: () => this.callOpenRouter(messages, options) },
    };

    const candidateProviders: ("gemini" | "openrouter" | "groq")[] = [preferred];
    for (const p of ["gemini", "openrouter", "groq"] as const) {
      if (p !== preferred && providers[p]?.key) {
        candidateProviders.push(p);
      }
    }

    for (const activeProvider of candidateProviders) {
      const targetProvider = providers[activeProvider];
      if (!targetProvider || !targetProvider.key) continue;

      const maxAttempts = 2;
      let delay = 3000;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await targetProvider.call();
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`Provider '${activeProvider}' failed (attempt ${attempt}/${maxAttempts}). Error: ${errMsg}`);
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay += 2000;
          }
        }
      }
      console.warn(`Falling back from provider '${activeProvider}' to next available candidate...`);
    }

    throw new Error(`All configured AI providers failed.`);
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
    const model = options.model ?? this.config.geminiModel ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
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
        maxOutputTokens: options.maxTokens ?? 4000,
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
    let model = options.model ?? this.config.openrouterModel ?? DEFAULT_OPENROUTER_MODEL;
    if (model === "llama-3.3-70b-versatile") {
      model = "meta-llama/llama-3.3-70b-instruct";
    } else if (model.startsWith("llama-3.1-8b")) {
      model = "meta-llama/llama-3.1-8b-instruct";
    } else if (!model.includes("/") && this.config.openrouterModel) {
      model = this.config.openrouterModel;
    } else if (!model.includes("/")) {
      model = DEFAULT_OPENROUTER_MODEL;
    }

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
        max_tokens: options.maxTokens ?? 4000,
      }),
    });

    if (!res.ok) {
      throw new ProviderError("openrouter", res.status, await safeText(res));
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return { text: data.choices[0]?.message?.content ?? "", provider: "openrouter", model };
  }

  private async callGroq(messages: ChatMessage[], options: AiCompletionOptions): Promise<AiCompletionResult> {
    const candidateModels = [
      process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
    ];

    await this.acquireToken("groq");

    let lastError: Error | null = null;
    for (const model of candidateModels) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.groqApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 4000,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { choices: { message: { content: string } }[] };
          return { text: data.choices[0]?.message?.content ?? "", provider: "groq", model };
        }

        const errText = await safeText(res);
        console.warn(`Groq model '${model}' failed with status ${res.status}: ${errText}. Trying next fallback model...`);
        lastError = new ProviderError("groq", res.status, errText);
      } catch (err: any) {
        console.warn(`Groq model '${model}' request failed: ${err.message}. Trying next fallback model...`);
        lastError = err;
      }
    }

    throw lastError || new Error("All Groq candidate models failed");
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
