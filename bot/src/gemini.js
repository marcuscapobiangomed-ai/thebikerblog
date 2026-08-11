import { validateArticle } from "./schemas/article.schema.js";
import { generateMarkdown } from "./generator.js";
import {
  buildRepairPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  inferContentType,
} from "./editorial-prompt.js";
import { getTemplate } from "./templates.js";
import { ThreeProviderPipeline } from "./ai/three-provider-pipeline.js";
import { AIRuntime } from "./ai/runtime.js";
import { assertEditorialPublicationGates } from "./validation/editorial-publication-gates.js";
import { assertMarkdownPublicationGates } from "./validation/markdown-publication-gates.js";
import { buildImageProductionPlan } from "./image-manifest.js";

const CATEGORY_ALIASES = {
  review: "reviews",
  reviews: "reviews",
  comparativo: "comparativos",
  comparativos: "comparativos",
  "guia-de-compra": "guias-de-compra",
  "guias-de-compra": "guias-de-compra",
  "guia-tecnico": "guia-tecnico",
  guia_tecnico: "guia-tecnico",
  noticia: "noticias",
  noticias: "noticias",
  lancamento: "lancamentos",
  lancamentos: "lancamentos",
  corrida: "corridas",
  corridas: "corridas",
  campeonato: "campeonatos",
  campeonatos: "campeonatos",
  mercado: "mercado",
};

const CONTENT_TYPE_ALIASES = {
  review: "review",
  reviews: "review",
  "review-desk": "review",
  "review-hands-on": "review",
  comparativo: "comparativo",
  comparativos: "comparativo",
  "guia-de-compra": "guia-de-compra",
  "guias-de-compra": "guia-de-compra",
  "guia-tecnico": "guia-tecnico",
  guia_tecnico: "guia-tecnico",
  noticia: "noticia",
  noticias: "noticia",
  lancamento: "lancamento",
  lancamentos: "lancamento",
  "previa-corrida": "previa-corrida",
  "prévia-corrida": "previa-corrida",
  "resumo-corrida": "resumo-corrida",
};

function toText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function truncateAtWordBoundary(value, maxLength) {
  const text = toText(value).trim();
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, maxLength + 1);
  const boundary = shortened.lastIndexOf(" ");
  return shortened.slice(0, boundary >= 100 ? boundary : maxLength).trimEnd();
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim"].includes(normalized)) return true;
    if (["false", "0", "no", "não", "nao"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeList(values) {
  return Array.isArray(values) ? values.filter((item) => item !== undefined && item !== null) : [];
}

function resolveTemplateKey(contentType, researchData) {
  if (contentType !== "review") return contentType;
  const reviewMethod = researchData?.reviewMethod || researchData?.review_method;
  return reviewMethod === "hands-on-test" ? "review-hands-on" : "review-desk";
}

function buildSlugFallback(topic) {
  return toText(topic, "artigo")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "artigo";
}

export class AIProvider {
  constructor({ pipeline } = {}) {
    this.deepseekKey = process.env.DEEPSEEK_API_KEY;
    this.geminiKey = process.env.GEMINI_API_KEY;
    this.githubToken = process.env.GITHUB_TOKEN;
    this.pipeline = pipeline || new ThreeProviderPipeline();
    this.runtime = this.pipeline.runtime || new AIRuntime();
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    const providerErrors = [];

    if (this.deepseekKey) {
      try {
        return await this._tryDeepSeek(systemPrompt, userPrompt, options);
      } catch (err) {
        providerErrors.push(`DeepSeek: ${err.message}`);
        console.warn("⚠️ Falha ao usar DeepSeek, tentando fallback:", err.message);
      }
    }

    if (this.geminiKey) {
      try {
        return await this._tryGemini(systemPrompt, userPrompt, options);
      } catch (err) {
        providerErrors.push(`Gemini: ${err.message}`);
        console.warn("⚠️ Falha ao usar Gemini, tentando fallback:", err.message);
      }
    }

    if (this.githubToken) {
      try {
        return await this._tryGitHubModels(systemPrompt, userPrompt, options);
      } catch (err) {
        providerErrors.push(`GitHub Models: ${err.message}`);
      }
    }

    const details = providerErrors.length > 0 ? ` Detalhes: ${providerErrors.join(" | ")}` : "";
    throw new Error(
      `Nenhum provedor de IA respondeu. Configure DEEPSEEK_API_KEY, GEMINI_API_KEY ou GITHUB_TOKEN.${details}`,
    );
  }

  async _tryDeepSeek(system, user, options = {}) {
    const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const model = options.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
    const maxTokens = toNumber(process.env.DEEPSEEK_MAX_TOKENS || options.maxTokens, 8192);

    const payload = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: options.temperature ?? 0.2,
      max_tokens: maxTokens ?? 8192,
    };

    if (options.jsonMode) {
      payload.response_format = { type: "json_object" };
    }

    await this.runtime.assertDeepSeekBudget();
    const startedAt = Date.now();

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.deepseekKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API: ${res.status} - ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    if (!content) throw new Error("DeepSeek API: resposta vazia");
    const usage = {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
      promptCacheHitTokens: data.usage?.prompt_cache_hit_tokens || 0,
      promptCacheMissTokens: data.usage?.prompt_cache_miss_tokens || 0,
    };
    const tracked = await this.runtime.addDeepSeekCost(usage, data.model || model);
    await this.runtime.record({
      step: options.step || "direct-generate",
      provider: "deepseek",
      model: data.model || model,
      durationMs: Date.now() - startedAt,
      usage,
      estimatedCostUsd: tracked.cost,
      budgetSpentUsd: tracked.budget.spent,
      cacheHit: false,
    });
    return content;
  }

  async _tryGitHubModels(system, user, options = {}) {
    const payload = {
      model: process.env.GITHUB_MODELS_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens || 8192,
    };

    if (options.jsonMode) {
      payload.response_format = { type: "json_object" };
    }

    const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.githubToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitHub Models API: ${res.status} - ${err}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  async _tryGemini(system, user, options = {}) {
    if (!this.geminiKey) throw new Error("Sem Gemini API Key");
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(this.geminiKey);
    const models = [
      process.env.GEMINI_MODEL,
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
    ].filter(Boolean);

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: system,
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxTokens || 8192,
            ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        });
        const result = await model.generateContent(user);
        return result.response.text();
      } catch {
        continue;
      }
    }

    throw new Error("Gemini indisponível (cota esgotada)");
  }

  static systemPrompt() {
    return buildSystemPrompt();
  }

  _sanitizeHtml(text) {
    return String(text || "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
      .replace(/on\w+="[^"]*"/gi, "")
      .replace(/on\w+='[^']*'/gi, "")
      .replace(/javascript:/gi, "");
  }

  _extractJson(raw) {
    let cleaned = String(raw || "").trim();
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) cleaned = jsonMatch[1].trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const braceStart = cleaned.indexOf("{");
      const braceEnd = cleaned.lastIndexOf("}");
      if (braceStart >= 0 && braceEnd > braceStart) {
        return JSON.parse(cleaned.slice(braceStart, braceEnd + 1));
      }
      throw new Error("Não foi possível extrair JSON válido da resposta da IA");
    }
  }

  _normalizeCategory(value) {
    return CATEGORY_ALIASES[toText(value, "").trim().toLowerCase()] || "reviews";
  }

  _normalizeContentType(value) {
    return CONTENT_TYPE_ALIASES[toText(value, "").trim().toLowerCase()] || "review";
  }

  _sanitizeStructuredArticle(parsed) {
    const next = JSON.parse(JSON.stringify(parsed));

    next.title = this._sanitizeHtml(next.title);
    next.description = truncateAtWordBoundary(this._sanitizeHtml(next.description), 200);
    next.direct_answer = truncateAtWordBoundary(this._sanitizeHtml(next.direct_answer), 420);
    next.slug = this._sanitizeHtml(next.slug);
    next.category = this._normalizeCategory(next.category);
    next.content_type = this._normalizeContentType(next.content_type);
    next.audience_segment = this._sanitizeHtml(next.audience_segment || "core_technical_cyclists");
    next.audience_intent = this._sanitizeHtml(next.audience_intent || "technical_learning");
    next.experience_level_target = this._sanitizeHtml(next.experience_level_target || "intermediate_advanced");
    const requestedHandsOn =
      toText(next.review_method, "").trim() === "hands-on-test" ||
      toBoolean(next.tested_by_thebikerblog, false);
    next.review_method = requestedHandsOn ? "hands-on-test" : "desk-research";
    next.tested_by_thebikerblog = requestedHandsOn;
    next.methodologyNotice = this._sanitizeHtml(next.methodologyNotice || "");
    next.brand = this._sanitizeHtml(next.brand || "");
    next.product_name = this._sanitizeHtml(next.product_name || "");
    next.model_year = toNumber(next.model_year, undefined);
    next.market = this._sanitizeHtml(next.market || "Brasil");
    next.weight = this._sanitizeHtml(next.weight || "Não informado");
    next.weight_source = this._sanitizeHtml(next.weight_source || "Não informado");
    next.price_min = toNumber(next.price_min, 0) || 0;
    next.price_max = toNumber(next.price_max, 0) || 0;
    next.price_currency = this._sanitizeHtml(next.price_currency || "BRL");
    const priceCheckedAt = this._sanitizeHtml(next.price_checked_at || "").trim();
    if (priceCheckedAt) {
      next.price_checked_at = priceCheckedAt;
    } else {
      delete next.price_checked_at;
    }
    next.affiliate_links = toBoolean(next.affiliate_links, false);
    next.editorial_scope = toText(next.editorial_scope, "portfolio").trim();
    next.promoted_brands = normalizeList(next.promoted_brands)
      .map((brand) => this._sanitizeHtml(brand).trim())
      .filter(Boolean);
    next.context_only_brands = normalizeList(next.context_only_brands)
      .map((brand) => this._sanitizeHtml(brand).trim())
      .filter(Boolean);
    next.portfolio_evidence_url = this._sanitizeHtml(next.portfolio_evidence_url || "").trim();
    next.portfolio_verified_at = this._sanitizeHtml(next.portfolio_verified_at || "").trim();

    next.tags = normalizeList(next.tags)
      .map((tag) => this._sanitizeHtml(tag).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
      .filter(Boolean);
    if (!next.tags.includes("ciclismo")) next.tags.unshift("ciclismo");

    next.sources = normalizeList(next.sources).map((source) => ({
      name: this._sanitizeHtml(source.name || ""),
      type: this._sanitizeHtml(source.type || "manufacturer"),
      url: this._sanitizeHtml(source.url || ""),
      accessed_at: this._sanitizeHtml(source.accessed_at || ""),
    }));

    next.faq = normalizeList(next.faq).slice(0, 5).map((item) => ({
      question: truncateAtWordBoundary(this._sanitizeHtml(item.question || ""), 180),
      answer: truncateAtWordBoundary(this._sanitizeHtml(item.answer || ""), 600),
    }));

    next.sections = normalizeList(next.sections).map((section) => ({
      heading: this._sanitizeHtml(section.heading || ""),
      content: this._sanitizeHtml(section.content || ""),
    }));

    next.imagePlan = normalizeList(next.imagePlan).map((item) => ({
      position: this._sanitizeHtml(item.position || "hero"),
      purpose: this._sanitizeHtml(item.purpose || ""),
      assetType: this._sanitizeHtml(item.assetType || "system-fallback"),
      editorialUse: this._sanitizeHtml(item.editorialUse || "draft-only"),
      factualSubject: this._sanitizeHtml(item.factualSubject || "not-applicable"),
      brief: this._sanitizeHtml(item.brief || item.purpose || ""),
      sourceRequired: toBoolean(item.sourceRequired, true),
      avoid: normalizeList(item.avoid).map((value) => this._sanitizeHtml(value)),
      aspectRatio: this._sanitizeHtml(item.aspectRatio || "16:9"),
      altSuggestion: this._sanitizeHtml(item.altSuggestion || ""),
      allowedSource: this._sanitizeHtml(item.allowedSource || "manufacturer-authorized"),
      aiGeneratedAllowed: toBoolean(item.aiGeneratedAllowed, false),
    }));

    next.claimsRequiringReview = normalizeList(next.claimsRequiringReview).map((item) => this._sanitizeHtml(item));

    next.frontmatter = next.frontmatter || {};
    next.frontmatter.author = this._sanitizeHtml(next.frontmatter.author || "Equipe TheBiker");
    next.frontmatter.image = this._sanitizeHtml(next.frontmatter.image || "/assets/img/logo.svg");
    next.frontmatter.thumbnail = this._sanitizeHtml(next.frontmatter.thumbnail || "");
    next.frontmatter.image_alt = this._sanitizeHtml(next.frontmatter.image_alt || next.description || "");
    next.frontmatter.image_caption = this._sanitizeHtml(next.frontmatter.image_caption || "");
    next.frontmatter.image_credit = this._sanitizeHtml(next.frontmatter.image_credit || "TheBiker");
    next.frontmatter.image_license = this._sanitizeHtml(next.frontmatter.image_license || "Uso editorial da TheBiker");

    return next;
  }

  _parseStructuredResponse(text, originalTopic) {
    const raw = this._extractJson(text);

    if (raw?.status === "PESQUISA INSUFICIENTE") {
      const msg = [
        "STATUS: PESQUISA INSUFICIENTE",
        "",
        "INFORMAÇÕES FALTANTES:",
        ...normalizeList(raw.missing_info).map((item) => `- ${item}`),
        "",
        "AFIRMAÇÕES QUE NÃO PODEM SER FEITAS:",
        ...normalizeList(raw.unsupported_claims).map((item) => `- ${item}`),
      ].join("\n");
      throw new Error(msg);
    }

    if (raw?.status === "PORTFÓLIO NÃO CONFIRMADO") {
      const msg = [
        "STATUS: PORTFÓLIO NÃO CONFIRMADO",
        "",
        ...normalizeList(raw.missing_info).map((item) => `- ${item}`),
      ].join("\n");
      throw new Error(msg);
    }

    const sanitized = this._sanitizeStructuredArticle(raw);
    const article = validateArticle(sanitized);
    const editorialGate = assertEditorialPublicationGates(article);
    const markdown = generateMarkdown(article);
    assertMarkdownPublicationGates(markdown);

    return {
      title: article.title,
      slug: article.slug || buildSlugFallback(originalTopic),
      content: markdown,
      metaDesc: article.description,
      content_type: article.content_type,
      review_method: article.review_method,
      tested_by_thebikerblog: article.tested_by_thebikerblog === true,
      imagePlan: article.imagePlan,
      imageProductionPlan: buildImageProductionPlan(article),
      sources: article.sources || [],
      brand: article.brand,
      product_name: article.product_name,
      model_year: article.model_year,
      weight: article.weight,
      price_min: article.price_min,
      price_max: article.price_max,
      claims: article.claimsRequiringReview || [],
      methodologyNotice: article.methodologyNotice || "",
      rawJson: JSON.stringify({ ...article, generated_at: new Date().toISOString() }),
      editorialGate,
    };
  }

  async processCase(descricaoCurta, researchData = null) {
    const contentType = researchData?.content_type || inferContentType(descricaoCurta);
    const template = getTemplate(resolveTemplateKey(contentType, researchData));
    const today = new Date().toISOString().split("T")[0];
    const userPrompt = buildUserPrompt({
      topic: descricaoCurta,
      researchData,
      contentType,
      template,
      today,
    });

    let rawText;
    let pipelineMetadata = null;
    if (process.env.AI_PIPELINE_MODE === "legacy") {
      rawText = await this.generate(AIProvider.systemPrompt(), userPrompt, {
        jsonMode: true,
        maxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 8192),
      });
    } else {
      const pipelineResult = await this.pipeline.run({
        topic: descricaoCurta,
        researchData,
        contentType,
        template,
        systemPrompt: AIProvider.systemPrompt(),
        draftPrompt: userPrompt,
        priority: researchData?.editorialPriority || researchData?.editorial_priority || "P1",
      });
      rawText = pipelineResult.content;
      pipelineMetadata = pipelineResult.metadata;
    }

    try {
      return {
        ...this._parseStructuredResponse(rawText, descricaoCurta),
        pipelineMetadata,
      };
    } catch (err) {
      if (String(err.message || "").includes("STATUS: PESQUISA INSUFICIENTE")) {
        throw err;
      }

      if (process.env.AI_PIPELINE_MODE !== "legacy") {
        if (!this.pipeline.clients.isConfigured("deepseek")) {
          throw new Error(`Rascunho bloqueado após o pipeline: ${err.message}`);
        }

        const repairPrompt = buildRepairPrompt({
          topic: descricaoCurta,
          rawText,
          validationError: err.message,
          contentType,
          template,
          today,
        });
        const repaired = await this.pipeline.callStep({
          step: "final-repair",
          providers: ["deepseek", "gemini", "groq"],
          sourceHash: pipelineMetadata?.sourceHash,
          system: [
            AIProvider.systemPrompt(),
            "Repare somente os gates informados. Preserve todos os fatos, fontes, limitações e campos do JSON.",
            "Responda com JSON completo de no máximo 32000 caracteres; compacte repetições e limite cada seção a 250 palavras.",
            "Não introduza novas especificações, sensações de teste, marcas ou disponibilidade.",
          ].join("\n"),
          user: repairPrompt,
          options: {
            jsonMode: true,
            temperature: 0.1,
            maxTokens: 8192,
            model: process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
            attempts: Number(process.env.AI_FINAL_REPAIR_ATTEMPTS || 2),
            timeoutMs: Number(process.env.AI_FINAL_REPAIR_TIMEOUT_MS || 75000),
          },
        });
        return {
          ...this._parseStructuredResponse(repaired.content, descricaoCurta),
          pipelineMetadata: {
            ...pipelineMetadata,
            finalRepairUsed: true,
            providers: { ...pipelineMetadata?.providers, finalRepair: repaired.provider },
          },
        };
      }

      const repairPrompt = buildRepairPrompt({
        topic: descricaoCurta,
        rawText,
        validationError: err.message,
        contentType,
        template,
        today,
      });

      const repairedText = await this.generate(AIProvider.systemPrompt(), repairPrompt, {
        jsonMode: true,
        temperature: 0,
        maxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 8192),
      });

      return this._parseStructuredResponse(repairedText, descricaoCurta);
    }
  }
}
