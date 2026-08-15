const numberFrom = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithRetry(url, init, { attempts = 3, timeoutMs = 90000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(timeoutMs) });
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) return response;
      const retryAfter = Number(response.headers.get("retry-after"));
      await response.text();
      await wait(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 30000) : 750 * (2 ** (attempt - 1)));
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
      await wait(750 * (2 ** (attempt - 1)));
    }
  }
  throw lastError || new Error("Falha de rede sem resposta");
}

function usageFromOpenAI(data) {
  return {
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
    promptCacheHitTokens: data.usage?.prompt_cache_hit_tokens || 0,
    promptCacheMissTokens: data.usage?.prompt_cache_miss_tokens || 0,
  };
}

async function openAICompatibleRequest({
  provider,
  apiKey,
  baseUrl,
  model,
  system,
  user,
  options,
}) {
  if (!apiKey) throw new Error(`${provider}: chave não configurada`);
  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens || 8192,
  };
  if (options.jsonMode) payload.response_format = { type: "json_object" };
  if (options.thinking === "disabled") payload.thinking = { type: "disabled" };

  const startedAt = Date.now();
  const response = await fetchWithRetry(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, {
    attempts: numberFrom(options.attempts, numberFrom(process.env.AI_HTTP_RETRY_ATTEMPTS, 3)),
    timeoutMs: numberFrom(options.timeoutMs, numberFrom(process.env.AI_HTTP_TIMEOUT_MS, 90000)),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    const error = new Error(`${provider} API: ${response.status} - ${detail}`);
    error.status = response.status;
    error.retryAfter = response.headers.get("retry-after");
    throw error;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason || "";
  if (["length", "max_tokens"].includes(String(finishReason).toLowerCase())) {
    const error = new Error(`${provider}: resposta truncada ao atingir o limite de saída`);
    error.code = "OUTPUT_TRUNCATED";
    throw error;
  }
  if (!content) throw new Error(`${provider}: resposta vazia`);
  return {
    provider,
    model: data.model || model,
    content,
    usage: usageFromOpenAI(data),
    durationMs: Date.now() - startedAt,
    finishReason,
  };
}

export class ProviderClients {
  constructor(env = process.env) {
    this.env = env;
  }

  isConfigured(provider) {
    if (provider === "groq") return Boolean(this.env.GROQ_API_KEY);
    if (provider === "gemini") return Boolean(this.env.GEMINI_API_KEY);
    if (provider === "deepseek") return Boolean(this.env.DEEPSEEK_API_KEY);
    return false;
  }

  async generate(provider, system, user, options = {}) {
    if (provider === "groq") {
      return openAICompatibleRequest({
        provider,
        apiKey: this.env.GROQ_API_KEY,
        baseUrl: this.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
        model: this.env.GROQ_MODEL || "openai/gpt-oss-120b",
        system,
        user,
        options,
      });
    }

    if (provider === "deepseek") {
      return openAICompatibleRequest({
        provider,
        apiKey: this.env.DEEPSEEK_API_KEY,
        baseUrl: this.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        model: options.model || this.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
        system,
        user,
        options: {
          ...options,
          thinking: "disabled",
          // A step-specific limit must win over the global ceiling. Sending
          // every small JSON/audit request with the global 14k allowance made
          // latency and timeout behaviour unnecessarily unpredictable.
          maxTokens: numberFrom(options.maxTokens, numberFrom(this.env.DEEPSEEK_MAX_TOKENS, 8192)),
        },
      });
    }

    if (provider === "gemini") {
      if (!this.env.GEMINI_API_KEY) throw new Error("gemini: chave não configurada");
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const client = new GoogleGenerativeAI(this.env.GEMINI_API_KEY);
      const models = [
        this.env.GEMINI_MODEL,
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
      ].filter(Boolean);
      const errors = [];
      for (const modelName of [...new Set(models)]) {
        try {
          const startedAt = Date.now();
          const model = client.getGenerativeModel({
            model: modelName,
            systemInstruction: system,
            generationConfig: {
              temperature: options.temperature ?? 0.2,
              maxOutputTokens: options.maxTokens || 8192,
              ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
            },
          });
          const result = await model.generateContent(user);
          const response = result.response;
          const metadata = response.usageMetadata || {};
          const finishReason = response.candidates?.[0]?.finishReason || "";
          if (finishReason === "MAX_TOKENS") {
            throw new Error("resposta truncada ao atingir o limite de saída");
          }
          return {
            provider,
            model: modelName,
            content: response.text(),
            usage: {
              inputTokens: metadata.promptTokenCount || 0,
              outputTokens: metadata.candidatesTokenCount || 0,
              totalTokens: metadata.totalTokenCount || 0,
            },
            durationMs: Date.now() - startedAt,
            finishReason,
          };
        } catch (error) {
          errors.push(`${modelName}: ${error.message}`);
        }
      }
      throw new Error(`Gemini indisponível: ${errors.join(" | ")}`);
    }

    throw new Error(`Provedor desconhecido: ${provider}`);
  }
}
