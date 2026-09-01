import { ProviderClients } from "./provider-clients.js";
import { AIRuntime, hashPayload } from "./runtime.js";
import { canonicalPortfolioBrand } from "../portfolio-policy.js";
import { editorialWordRange } from "../editorial-length-policy.js";

function extractJson(text) {
  let value = String(text || "").trim();
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) value = fenced[1].trim();
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(value.slice(start, end + 1));
    throw new Error("Resposta sem JSON válido");
  }
}

function truncateForAudit(value, maxLength) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, maxLength + 1);
  const boundary = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, boundary >= Math.floor(maxLength * 0.65) ? boundary : maxLength).trimEnd()} [conteúdo truncado para auditoria]`;
}

function compactSource(source, index) {
  return {
    id: String(source?.id || `source-${index + 1}`),
    name: truncateForAudit(source?.name || `Fonte ${index + 1}`, 180),
    type: truncateForAudit(source?.type || "", 80),
    url: truncateForAudit(source?.url || "", 500),
    accessed: String(source?.accessed || source?.accessed_at || ""),
  };
}

function compactResearchForAudit(researchData) {
  const facts = Array.isArray(researchData?.confirmed_facts) ? researchData.confirmed_facts : [];
  const sources = Array.isArray(researchData?.sources) ? researchData.sources : [];
  return {
    title: truncateForAudit(researchData?.title, 180),
    content_type: researchData?.content_type,
    review_method: researchData?.review_method,
    status: researchData?.status,
    market: researchData?.market,
    verifiedAt: researchData?.verifiedAt,
    grounding: {
      fallback: researchData?.grounding?.fallback,
      evidenceContract: researchData?.grounding?.evidenceContract,
      claimContract: researchData?.grounding?.claimContract,
      verifiedAt: researchData?.grounding?.verifiedAt,
      sourceCount: researchData?.grounding?.sourceCount,
    },
    sources: sources.slice(0, 12).map(compactSource),
    confirmed_facts: facts.slice(0, 24).map((fact, index) => ({
      fact: truncateForAudit(fact?.fact || fact?.statement, 360),
      source_ids: Array.isArray(fact?.source_ids) ? fact.source_ids.slice(0, 8) : [],
      evidence_quote: truncateForAudit(fact?.evidence_quote, 260),
      index: index + 1,
    })),
    limitations: (Array.isArray(researchData?.limitations) ? researchData.limitations : [])
      .slice(0, 12)
      .map((value) => truncateForAudit(value, 260)),
    portfolio_evidence_url: researchData?.portfolio_evidence_url,
    portfolio_verified_at: researchData?.portfolio_verified_at,
  };
}

function compactFactSheetForAudit(factSheet) {
  const compactList = (values, maxLength) => (Array.isArray(values) ? values : [])
    .slice(0, 24)
    .map((value) => typeof value === "object" ? {
      type: value.type,
      field: truncateForAudit(value.field, 120),
      issue: truncateForAudit(value.issue, maxLength),
      statement: truncateForAudit(value.statement, maxLength),
      detail: truncateForAudit(value.detail, maxLength),
      source: truncateForAudit(value.source, 160),
      confidence: truncateForAudit(value.confidence, 80),
      sources: Array.isArray(value.sources) ? value.sources.slice(0, 8).map((item) => truncateForAudit(item, 120)) : undefined,
      values: Array.isArray(value.values) ? value.values.slice(0, 8).map((item) => truncateForAudit(item, 160)) : undefined,
    } : truncateForAudit(value, maxLength));
  return {
    facts: compactList(factSheet?.facts, 320),
    gaps: compactList(factSheet?.gaps, 260),
    conflicts: compactList(factSheet?.conflicts, 320),
    forbiddenClaims: compactList(factSheet?.forbiddenClaims, 220),
    technicalAngles: compactList(factSheet?.technicalAngles, 220),
  };
}

function compactArticleForAudit(article) {
  const sections = Array.isArray(article?.sections) ? article.sections : [];
  const faq = Array.isArray(article?.faq) ? article.faq : [];
  return {
    editorial_format: article?.editorial_format,
    title: truncateForAudit(article?.title, 180),
    description: truncateForAudit(article?.description, 900),
    direct_answer: truncateForAudit(article?.direct_answer, 700),
    content_type: article?.content_type,
    audience_segment: article?.audience_segment,
    review_method: article?.review_method,
    tested_by_thebikerblog: article?.tested_by_thebikerblog,
    methodologyNotice: truncateForAudit(article?.methodologyNotice, 800),
    sections: sections.map((section, index) => ({
      index: index + 1,
      heading: truncateForAudit(section?.heading, 180),
      content: truncateForAudit(section?.content, 1400),
    })),
    faq: faq.slice(0, 5).map((item) => ({
      question: truncateForAudit(item?.question, 220),
      answer: truncateForAudit(item?.answer, 600),
    })),
    claimsRequiringReview: compactList(article?.claimsRequiringReview, 220),
    imagePlan: Array.isArray(article?.imagePlan) ? article.imagePlan.slice(0, 8).map((plan) => ({
      position: plan?.position,
      purpose: truncateForAudit(plan?.purpose, 260),
      assetType: plan?.assetType,
      editorialUse: plan?.editorialUse,
      factualSubject: plan?.factualSubject,
      brief: truncateForAudit(plan?.brief, 360),
      sourceRequired: plan?.sourceRequired,
      allowedSource: plan?.allowedSource,
      aiGeneratedAllowed: plan?.aiGeneratedAllowed,
    })) : [],
    sources: Array.isArray(article?.sources) ? article.sources.slice(0, 12).map(compactSource) : [],
    editorial_scope: article?.editorial_scope,
    promoted_brands: article?.promoted_brands,
    context_only_brands: article?.context_only_brands,
  };
}

function compactList(values, maxLength) {
  return (Array.isArray(values) ? values : []).slice(0, 24).map((value) => truncateForAudit(value, maxLength));
}

export function buildAuditContext({ topic, researchData, factSheet, finalArticle, previousBlockers } = {}) {
  return {
    topic: truncateForAudit(topic, 180),
    researchData: compactResearchForAudit(researchData),
    factSheet: compactFactSheetForAudit(factSheet),
    ...(previousBlockers ? { previousBlockers: compactList(previousBlockers, 320) } : {}),
    finalArticle: compactArticleForAudit(finalArticle),
  };
}

export function applyPortfolioEvidence(article, researchData) {
  if (!article || typeof article !== 'object') return article
  const evidenceUrl = String(researchData?.portfolio_evidence_url || '').trim()
  const verifiedAt = String(researchData?.portfolio_verified_at || '').trim()
  if (!/^https?:\/\/(?:www\.)?(?:thebiker\.com\.br|thebikershop\.com\.br)\//i.test(evidenceUrl)) return article
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) return article
  article.portfolio_evidence_url = evidenceUrl
  article.portfolio_verified_at = verifiedAt
  if (article.editorial_scope !== 'race-coverage') article.editorial_scope = 'portfolio'
  const promoted = Array.isArray(article.promoted_brands) ? article.promoted_brands : []
  article.promoted_brands = [...new Set(promoted.map((brand) => canonicalPortfolioBrand(brand) || brand).filter(Boolean))]
  if (article.promoted_brands.length === 0) article.promoted_brands = ['TheBiker']
  if (article.brand) article.brand = canonicalPortfolioBrand(article.brand) || article.brand
  return article
}

function applyPortfolioEvidenceToResult(result, researchData) {
  const article = applyPortfolioEvidence(extractJson(result.content), researchData)
  result.content = JSON.stringify(article)
  return article
}

function hasResearchEvidence(researchData) {
  if (!researchData || typeof researchData !== "object") return false;
  const sources = researchData.sources;
  if (Array.isArray(sources)) return sources.length > 0;
  if (sources && typeof sources === "object") {
    return Object.values(sources).some((items) => Array.isArray(items) && items.length > 0);
  }
  return false;
}

function isPremiumRequired(contentType, priority) {
  return priority === "P0" || ["review", "comparativo", "previa-corrida", "resumo-corrida"].includes(contentType);
}

function verifiedSourceConflicts(value) {
  return (Array.isArray(value) ? value : []).filter((conflict) => {
    if (typeof conflict === "string") {
      const text = conflict.trim();
      return text.length > 0 && !/^(?:n[aã]o (?:h[aá]|existem?)|nenhum(?:a|s)?|sem) conflito/i.test(text);
    }
    if (!conflict || typeof conflict !== "object") return false;
    const sources = Array.isArray(conflict.sources)
      ? conflict.sources
      : [conflict.sourceA, conflict.sourceB, conflict.source1, conflict.source2].filter(Boolean);
    const values = Array.isArray(conflict.values)
      ? conflict.values
      : [conflict.valueA, conflict.valueB, conflict.value1, conflict.value2].filter((item) => item !== undefined && item !== null);
    return new Set(sources.map((item) => JSON.stringify(item))).size >= 2 &&
      new Set(values.map((item) => JSON.stringify(item))).size >= 2;
  });
}

export class ThreeProviderPipeline {
  constructor({
    clients = new ProviderClients(),
    runtime = new AIRuntime(),
    env = process.env,
  } = {}) {
    this.clients = clients;
    this.runtime = runtime;
    this.env = env;
  }

  async callStep({ step, providers, system, user, options = {}, sourceHash }) {
    const errors = [];
    for (const provider of providers) {
      if (!this.clients.isConfigured(provider)) continue;
      const modelHint = provider === "deepseek"
        ? options.model || this.env.DEEPSEEK_MODEL || "deepseek-v4-pro"
        : this.env[`${provider.toUpperCase()}_MODEL`] || "default";
      const cacheKey = hashPayload({ step, provider, modelHint, system, user, options, sourceHash });
      const cached = await this.runtime.readCache(cacheKey);
      if (cached) {
        await this.runtime.record({ step, provider, model: cached.model, cacheHit: true, sourceHash });
        return { ...cached, cacheHit: true };
      }

      try {
        if (provider === "deepseek") await this.runtime.assertDeepSeekBudget();
        const result = await this.clients.generate(provider, system, user, options);
        let financial = {};
        if (provider === "deepseek") {
          const tracked = await this.runtime.addDeepSeekCost(result.usage, result.model);
          financial = { estimatedCostUsd: tracked.cost, budgetSpentUsd: tracked.budget.spent };
        }
        if (options.jsonMode) {
          try {
            extractJson(result.content);
          } catch (error) {
            const invalidJson = new Error(`${provider}: resposta JSON inválida (${error.message})`);
            invalidJson.code = "INVALID_PROVIDER_JSON";
            throw invalidJson;
          }
        }
        const stored = { ...result, ...financial };
        await this.runtime.writeCache(cacheKey, stored);
        await this.runtime.record({
          step,
          provider,
          model: result.model,
          durationMs: result.durationMs,
          usage: result.usage,
          finishReason: result.finishReason,
          sourceHash,
          cacheHit: false,
          ...financial,
        });
        return stored;
      } catch (error) {
        errors.push(`${provider}: ${error.message}`);
        await this.runtime.record({
          step,
          provider,
          sourceHash,
          failed: true,
          status: error.status || null,
          retryAfter: error.retryAfter || null,
          error: error.message.slice(0, 500),
        });
      }
    }
    throw new Error(`Etapa ${step} falhou. ${errors.join(" | ") || "Nenhum provedor configurado."}`);
  }

  async run({
    topic,
    researchData,
    contentType,
    template,
    systemPrompt,
    draftPrompt,
    priority = "P1",
  }) {
    if (!hasResearchEvidence(researchData)) {
      throw new Error("STATUS: PESQUISA INSUFICIENTE\nA geração exige ao menos uma fonte no pacote de pesquisa.");
    }

    const sourceHash = hashPayload(researchData);
    const factSheetResult = await this.callStep({
      step: "fact-sheet",
      providers: ["deepseek", "groq", "gemini"],
      sourceHash,
      options: {
        jsonMode: true,
        temperature: 0,
        maxTokens: 2500,
        model: this.env.DEEPSEEK_FLASH_MODEL || "deepseek-v4-flash",
      },
      system: [
        "Você extrai fatos para o blog oficial da TheBiker.",
        "Use exclusivamente o pacote recebido. Responda somente em JSON.",
        "Não complete lacunas. Separe fatos, lacunas, conflitos e alegações proibidas.",
        "Só registre conflito quando duas fontes afirmarem valores incompatíveis para o mesmo campo factual.",
        "Nome ou número de modelo não representa medida técnica: Addict 50, RC 20, Foil 30 e nomes equivalentes são designações comerciais.",
        "Ausência de dado, valor aproximado ou alegação sem validação independente são lacunas/limitações, não conflitos entre fontes.",
      ].join("\n"),
      user: JSON.stringify({
        topic,
        contentType,
        requiredCoverage: template.structure,
        researchData,
        output: {
          facts: [{ statement: "...", source: "...", confidence: "confirmed" }],
          gaps: ["..."],
          conflicts: ["..."],
          forbiddenClaims: ["..."],
          technicalAngles: ["..."],
        },
      }),
    });
    const factSheet = extractJson(factSheetResult.content);
    factSheet.conflicts = verifiedSourceConflicts(factSheet.conflicts);
    if (factSheet.conflicts.length > 0 && this.env.AI_ALLOW_SOURCE_CONFLICTS !== "true") {
      throw new Error(`STATUS: PESQUISA INSUFICIENTE\nConflitos nas fontes: ${factSheet.conflicts.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("; ")}`);
    }

    const enrichedDraftPrompt = [
      draftPrompt,
      "",
      "## FICHA FÁTICA VALIDADA",
      JSON.stringify(factSheet, null, 2),
      "",
      "Não acrescente fatos que não estejam na ficha de pesquisa ou nesta ficha fática.",
    ].join("\n");
    const draftResult = await this.callStep({
      step: "draft",
      providers: ["gemini", "deepseek", "groq"],
      sourceHash,
      system: systemPrompt,
      user: enrichedDraftPrompt,
      options: {
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 3800,
        model: this.env.DEEPSEEK_FLASH_MODEL || "deepseek-v4-flash",
      },
    });
    const draft = applyPortfolioEvidenceToResult(draftResult, researchData);

    const critiqueResult = await this.callStep({
      step: "critique",
      providers: ["deepseek", "groq", "gemini"],
      sourceHash,
      options: {
        jsonMode: true,
        temperature: 0,
        maxTokens: 3000,
        model: this.env.DEEPSEEK_FLASH_MODEL || "deepseek-v4-flash",
      },
      system: [
        "Você é o auditor adversarial do blog oficial da TheBiker.",
        "Não reescreva o artigo. Responda somente em JSON.",
        "A fonte primária vence qualquer opinião do texto.",
      ].join("\n"),
      user: JSON.stringify({
        topic,
        researchData,
        factSheet,
        draft,
        checks: [
          "alegações sem fonte",
          "números ou versões contraditórios",
          "promoção de concorrentes",
          "tom genérico ou iniciante",
          "intertítulos fracos",
          "repetição e enchimento",
          "decisões sem critério",
          "plano visual incompatível com produto real, corrida real ou política de imagens",
        ],
        output: {
          score: "calcule um inteiro de 0 a 100",
          blockers: [{ type: "...", detail: "...", section: "..." }],
          warnings: [{ type: "...", detail: "...", section: "..." }],
        },
      }),
    });
    const critique = extractJson(critiqueResult.content);
    const score = Number(critique.score || 0);
    const blockers = Array.isArray(critique.blockers) ? critique.blockers : [];
    const requiresPremium = isPremiumRequired(contentType, priority) ||
      score < Number(this.env.AI_DEEPSEEK_SCORE_THRESHOLD || 90) ||
      blockers.length > 0;

    let finalResult = draftResult;
    let finalAudit = critique;
    const premiumConfigured = this.clients.isConfigured("deepseek");
    if (requiresPremium && premiumConfigured) {
      const { min: minimumWords, max: maximumWords, target: generationTargetWords } = editorialWordRange(contentType, this.env);
      finalResult = await this.callStep({
        step: "premium-edit",
        providers: ["deepseek", "deepseek", "gemini"],
        sourceHash,
        system: systemPrompt,
        options: {
          jsonMode: true,
          temperature: 0.1,
          maxTokens: 8192,
          model: this.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
        },
        user: [
          "Edite o rascunho usando exclusivamente a pesquisa e a crítica fornecidas.",
          "Corrija todos os bloqueios. Preserve o schema completo e responda somente em JSON.",
          "Em especificações técnicas, use a fonte do fabricante; não exponha no artigo conflitos, inconsistências ou correções de outras fontes.",
          `Mire aproximadamente ${generationTargetWords} palavras úteis e nunca adicione repetição ou conteúdo genérico para atingir a extensão.`,
          `Mantenha o corpo entre ${minimumWords} e ${maximumWords} palavras úteis; nenhuma seção deve ultrapassar 250 palavras.`,
          "O JSON completo deve ter menos de 32000 caracteres para não ser truncado pelo provedor.",
          "Conte as palavras dos campos content antes de responder e amplie os eixos técnicos mais relevantes caso o total esteja abaixo da meta.",
          "Não crie fatos, fontes, testes ou disponibilidade.",
          "",
          "PESQUISA:",
          JSON.stringify(researchData, null, 2),
          "",
          "FICHA FÁTICA:",
          JSON.stringify(factSheet, null, 2),
          "",
          "RASCUNHO:",
          JSON.stringify(draft, null, 2),
          "",
          "CRÍTICA:",
          JSON.stringify(critique, null, 2),
        ].join("\n"),
      });
      applyPortfolioEvidenceToResult(finalResult, researchData);
      const finalAuditResult = await this.callStep({
        step: "final-audit",
        providers: ["deepseek", "groq"],
        sourceHash,
        options: {
          jsonMode: true,
          temperature: 0,
          maxTokens: Number(this.env.AI_FINAL_AUDIT_MAX_TOKENS || 1600),
          model: this.env.DEEPSEEK_FLASH_MODEL || "deepseek-v4-flash",
        },
        system: [
          "Você é o gate editorial final do blog oficial da TheBiker.",
          "Audite o texto já editado contra a pesquisa. Não reescreva. Responda somente em JSON.",
          "Nota abaixo de 90 ou qualquer bloqueador impede agendamento.",
        ].join("\n"),
        user: JSON.stringify({
          ...buildAuditContext({
            topic,
            researchData,
            factSheet,
            finalArticle: extractJson(finalResult.content),
          }),
          checks: [
            "alegações sem fonte",
            "promoção de concorrentes",
            "produto, versão ou medida incompatível",
            "teste prático não realizado",
            "texto genérico ou repetitivo",
            "conflito entre fontes exposto ao leitor em vez de resolvido pela precedência do fabricante",
            "plano visual incompatível",
          ],
          output: { score: "calcule um inteiro de 0 a 100", blockers: [{ type: "...", detail: "..." }], warnings: [] },
        }),
      });
      finalAudit = extractJson(finalAuditResult.content);
      finalResult.finalAuditProvider = finalAuditResult.provider;
    }

    const finalThreshold = Number(this.env.AI_FINAL_SCORE_THRESHOLD || 90);
    let finalScore = Number(finalAudit.score || 0);
    let finalBlockers = Array.isArray(finalAudit.blockers) ? finalAudit.blockers : [];
    let remediationEditUsed = false;
    if (premiumConfigured && (finalScore < finalThreshold || finalBlockers.length > 0)) {
      const { min: minimumWords, max: maximumWords, target: generationTargetWords } = editorialWordRange(contentType, this.env);
      const remediationResult = await this.callStep({
        step: "remediation-edit",
        providers: ["deepseek", "gemini"],
        sourceHash,
        system: systemPrompt,
        options: {
          jsonMode: true,
          temperature: 0,
          maxTokens: 8192,
          model: this.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
        },
        user: [
          "Faça uma correção final estritamente baseada nas evidências. Preserve o schema completo e responda somente em JSON.",
          "Remova integralmente cada alegação proibida e cada afirmação apontada pelos bloqueadores; não as reformule como fato, inferência ou recomendação.",
          "Em especificações técnicas, mantenha apenas o valor do fabricante e não exponha ao leitor conflitos, inconsistências ou correções de cadastro.",
          "Corrija também todos os avisos e deficiências implícitas na nota da auditoria final, priorizando precisão, utilidade técnica, clareza e decisões sustentadas.",
          "Substitua o espaço removido por explicação de método, critérios de decisão e limitações que não exijam novos fatos.",
          `Mantenha entre ${minimumWords} e ${maximumWords} palavras úteis, mirando ${generationTargetWords}, sem repetição, fatos novos ou conteúdo genérico.`,
          "Não crie especificações, compatibilidades, categorias de uso, testes, preço, estoque ou disponibilidade.",
          "",
          "ALEGAÇÕES PROIBIDAS DA FICHA:",
          JSON.stringify(factSheet.forbiddenClaims || [], null, 2),
          "",
          "BLOQUEADORES DO GATE FINAL:",
          JSON.stringify(finalBlockers, null, 2),
          "",
          "AUDITORIA FINAL COMPLETA:",
          JSON.stringify(finalAudit, null, 2),
          "",
          "PESQUISA:",
          JSON.stringify(researchData, null, 2),
          "",
          "ARTIGO A CORRIGIR:",
          JSON.stringify(extractJson(finalResult.content), null, 2),
        ].join("\n"),
      });
      applyPortfolioEvidenceToResult(remediationResult, researchData);
      const remediationAuditResult = await this.callStep({
        step: "remediation-audit",
        providers: ["deepseek", "groq"],
        sourceHash,
        options: {
          jsonMode: true,
          temperature: 0,
          maxTokens: Number(this.env.AI_FINAL_AUDIT_MAX_TOKENS || 1600),
          model: this.env.DEEPSEEK_FLASH_MODEL || "deepseek-v4-flash",
        },
        system: [
          "Você é o gate editorial final do blog oficial da TheBiker.",
          "Audite a versão corrigida contra a pesquisa e a lista de alegações proibidas. Não reescreva. Responda somente em JSON.",
          "Nota abaixo de 90 ou qualquer bloqueador impede agendamento.",
        ].join("\n"),
        user: JSON.stringify({
          ...buildAuditContext({
            topic,
            researchData,
            factSheet,
            previousBlockers: finalBlockers,
            finalArticle: extractJson(remediationResult.content),
          }),
          checks: [
            "reaparecimento de qualquer alegação proibida",
            "alegações sem fonte",
            "promoção de concorrentes",
            "produto, versão ou medida incompatível",
            "teste prático não realizado",
            "texto genérico ou repetitivo",
            "conflito entre fontes exposto ao leitor em vez de resolvido pela precedência do fabricante",
          ],
          output: { score: "calcule um inteiro de 0 a 100", blockers: [{ type: "...", detail: "..." }], warnings: [] },
        }),
      });
      finalResult = remediationResult;
      finalResult.finalAuditProvider = remediationAuditResult.provider;
      finalAudit = extractJson(remediationAuditResult.content);
      finalScore = Number(finalAudit.score || 0);
      finalBlockers = Array.isArray(finalAudit.blockers) ? finalAudit.blockers : [];
      remediationEditUsed = true;
    }
    if (finalScore < finalThreshold || finalBlockers.length > 0) {
      throw new Error(`STATUS: REVISÃO FINAL REPROVADA\nNota ${finalScore}; bloqueadores: ${finalBlockers.map((item) => item.detail || item.type).join("; ") || "nota abaixo do mínimo"}`);
    }

    return {
      content: finalResult.content,
      metadata: {
        sourceHash,
        priority,
        scoreBeforePremium: score,
        blockersBeforePremium: blockers.length,
        finalScore,
        finalBlockers: finalBlockers.length,
        premiumEditUsed: requiresPremium && premiumConfigured,
        remediationEditUsed,
        premiumEditPending: requiresPremium && !premiumConfigured,
        providers: {
          factSheet: factSheetResult.provider,
          draft: draftResult.provider,
          critique: critiqueResult.provider,
          final: finalResult.provider,
          finalAudit: finalResult.finalAuditProvider || critiqueResult.provider,
        },
      },
    };
  }
}
