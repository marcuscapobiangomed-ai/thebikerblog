#!/usr/bin/env node
import assert from "node:assert/strict";
import { ThreeProviderPipeline, applyPortfolioEvidence, buildAuditContext } from "./src/ai/three-provider-pipeline.js";
import { AIProvider } from "./src/gemini.js";
import { assertEditorialPublicationGates } from "./src/validation/editorial-publication-gates.js";

const calls = [];
const clients = {
  isConfigured: () => true,
  async generate(provider, system, user) {
    calls.push({ provider, system, user });
    if (calls.length === 1) {
      return {
        provider,
        model: "test",
        content: JSON.stringify({ facts: [], gaps: [], conflicts: ["Não há conflitos factuais entre as fontes fornecidas."], forbiddenClaims: [], technicalAngles: [] }),
        usage: {},
        durationMs: 1,
      };
    }
    if (calls.length === 2) {
      return {
        provider,
        model: "test",
        content: JSON.stringify({ title: "Rascunho de teste" }),
        usage: {},
        durationMs: 1,
      };
    }
    if (calls.length === 3) {
      return {
        provider,
        model: "test",
        content: JSON.stringify({ score: 95, blockers: [], warnings: [] }),
        usage: {},
        durationMs: 1,
      };
    }
    throw new Error("Chamada premium inesperada");
  },
};

const runtime = {
  readCache: async () => null,
  writeCache: async () => {},
  record: async () => {},
  assertDeepSeekBudget: async () => {},
  addDeepSeekCost: async () => ({ cost: 0, budget: { spent: 0 } }),
};

const pipeline = new ThreeProviderPipeline({ clients, runtime, env: {} });
const portfolioArticle = applyPortfolioEvidence({ promoted_brands: [] }, {
  portfolio_evidence_url: 'https://thebikershop.com.br/componentes/',
  portfolio_verified_at: '2026-08-08',
});
assert.equal(portfolioArticle.portfolio_evidence_url, 'https://thebikershop.com.br/componentes/');
assert.equal(portfolioArticle.portfolio_verified_at, '2026-08-08');
assert.deepEqual(portfolioArticle.promoted_brands, ['TheBiker']);
const aliasedPortfolioArticle = applyPortfolioEvidence({
  brand: 'TheBiker Shop',
  promoted_brands: ['TheBiker Shop', 'Schwalbe'],
}, {
  portfolio_evidence_url: 'https://thebikershop.com.br/componentes/',
  portfolio_verified_at: '2026-08-13',
});
assert.equal(aliasedPortfolioArticle.brand, 'TheBiker');
assert.deepEqual(aliasedPortfolioArticle.promoted_brands, ['TheBiker', 'Schwalbe']);
const blockedExternalBrand = applyPortfolioEvidence({ promoted_brands: ['Marca Externa'] }, {
  portfolio_evidence_url: 'https://thebikershop.com.br/componentes/',
  portfolio_verified_at: '2026-08-13',
});
assert.deepEqual(blockedExternalBrand.promoted_brands, ['Marca Externa']);
const oversizedAuditContext = buildAuditContext({
  topic: "Tema com contexto extenso",
  researchData: {
    title: "Produto",
    sources: [{ id: "source-1", name: "Fonte", type: "official", url: "https://example.com", accessed: "2026-08-13" }],
    confirmed_facts: [{ fact: "campo: " + "fato ".repeat(500), source_ids: ["source-1"], evidence_quote: "trecho " + "evidencia ".repeat(500) }],
    limitations: ["limite ".repeat(500)],
  },
  factSheet: { facts: [{ statement: "fato ".repeat(500), source: "Fonte" }] },
  finalArticle: {
    title: "Artigo",
    sections: [{ heading: "Seção", content: "texto ".repeat(5000) }],
  },
});
const oversizedAuditJson = JSON.stringify(oversizedAuditContext);
assert.ok(oversizedAuditJson.length < 20000, `Contexto de auditoria excedeu o limite: ${oversizedAuditJson.length}`);
assert.match(oversizedAuditJson, /conteúdo truncado para auditoria/);
const result = await pipeline.run({
  topic: "Notícia técnica",
  researchData: { sources: [{ name: "Fonte", url: "https://example.com" }] },
  contentType: "noticia",
  template: { structure: ["Mudança técnica"] },
  systemPrompt: "Sistema",
  draftPrompt: "Rascunho",
  priority: "P2",
});

assert.deepEqual(calls.map((call) => call.provider), ["deepseek", "gemini", "deepseek"]);
assert.equal(result.metadata.premiumEditUsed, false);
assert.equal(result.metadata.remediationEditUsed, false);
assert.throws(
  () => assertEditorialPublicationGates({
    content_type: "noticia",
    sections: [{ heading: "Uma seção", content: "texto curto" }],
    sources: [{ name: "Fonte", url: "" }],
  }),
  /Gates editoriais não atendidos/,
);

let malformedCalls = 0;
const malformedClients = {
  isConfigured: () => true,
  async generate(provider) {
    malformedCalls += 1;
    return {
      provider,
      model: "test",
      content: malformedCalls === 1 ? '{"sections":[' : JSON.stringify({ sections: [] }),
      usage: {},
      durationMs: 1,
    };
  },
};
const malformedPipeline = new ThreeProviderPipeline({ clients: malformedClients, runtime, env: {} });
const recoveredJson = await malformedPipeline.callStep({
  step: "json-recovery",
  providers: ["deepseek", "deepseek", "gemini"],
  system: "Sistema",
  user: "JSON",
  options: { jsonMode: true },
  sourceHash: "test",
});
assert.equal(malformedCalls, 2);
assert.equal(recoveredJson.provider, "deepseek");
assert.deepEqual(JSON.parse(recoveredJson.content), { sections: [] });

const fallbackProviders = [];
const timeoutFallbackPipeline = new ThreeProviderPipeline({
  runtime,
  env: {},
  clients: {
    isConfigured: () => true,
    async generate(provider, _system, _user, options) {
      fallbackProviders.push({ provider, attempts: options.attempts, timeoutMs: options.timeoutMs });
      if (provider === "deepseek") throw new Error("The operation was aborted due to timeout");
      return { provider, model: "test", content: "{}", usage: {}, durationMs: 1 };
    },
  },
});
const fallbackRepair = await timeoutFallbackPipeline.callStep({
  step: "final-repair",
  providers: ["deepseek", "gemini", "groq"],
  system: "Sistema",
  user: "Repare",
  options: { jsonMode: true, attempts: 2, timeoutMs: 75000 },
  sourceHash: "fallback",
});
assert.equal(fallbackRepair.provider, "gemini");
assert.deepEqual(fallbackProviders, [
  { provider: "deepseek", attempts: 2, timeoutMs: 75000 },
  { provider: "gemini", attempts: 2, timeoutMs: 75000 },
]);

const previousPipelineMode = process.env.AI_PIPELINE_MODE;
process.env.AI_PIPELINE_MODE = "three-provider";
let repairRounds = 0;
let parseRounds = 0;
const retryingProvider = new AIProvider({
  pipeline: {
    runtime,
    clients: { isConfigured: () => true },
    run: async () => ({ content: "initial", metadata: { sourceHash: "repair-test", providers: {} } }),
    callStep: async ({ step }) => {
      repairRounds += 1;
      assert.equal(step, `final-repair-${repairRounds}`);
      return { content: `repair-${repairRounds}`, provider: "deepseek" };
    },
  },
});
retryingProvider._parseStructuredResponse = (content) => {
  parseRounds += 1;
  if (parseRounds < 3) throw new Error(`Gates editoriais não atendidos: extensão insuficiente na tentativa ${parseRounds}`);
  return { content, title: "Reparo validado" };
};
const retryResult = await retryingProvider.processCase("Pauta de reparo", { content_type: "guia-tecnico", editorialPriority: "P1" });
assert.equal(repairRounds, 2);
assert.equal(retryResult.pipelineMetadata.finalRepairRounds, 2);
assert.equal(retryResult.content, "repair-2");

const completeCandidate = JSON.stringify({
  title: "Estrutura original preservada",
  description: "Descrição editorial suficientemente completa para permanecer válida durante um reparo parcial devolvido pelo provedor de inteligência artificial.",
  direct_answer: "Resposta direta original suficientemente detalhada para o contrato editorial da publicação automatizada.",
  sections: [
    { heading: "Primeiro eixo técnico", content: "Conteúdo original um." },
    { heading: "Segundo eixo técnico", content: "Conteúdo original dois." },
  ],
  claimsRequiringReview: ["Alegação que o reparo resolveu"],
});
let partialRepairParses = 0;
const partialRepairProvider = new AIProvider({
  pipeline: {
    runtime,
    clients: { isConfigured: () => true },
    run: async () => ({ content: completeCandidate, metadata: { sourceHash: "partial-repair-test", providers: {} } }),
    callStep: async () => ({
      provider: "deepseek",
      content: JSON.stringify({ description: "", sections: [], claimsRequiringReview: [], direct_answer: "Resposta direta corrigida sem apagar os demais campos estruturais já válidos do candidato original." }),
    }),
  },
});
partialRepairProvider._parseStructuredResponse = (content) => {
  partialRepairParses += 1;
  if (partialRepairParses === 1) throw new Error("Campo reparável fora do contrato");
  const merged = JSON.parse(content);
  assert.equal(merged.description, JSON.parse(completeCandidate).description);
  assert.equal(merged.sections.length, 2);
  assert.deepEqual(merged.claimsRequiringReview, []);
  assert.match(merged.direct_answer, /corrigida/);
  return { content, title: merged.title };
};
const partialRepairResult = await partialRepairProvider.processCase("Pauta com reparo parcial", { content_type: "guia-tecnico", editorialPriority: "P1" });
assert.equal(partialRepairResult.pipelineMetadata.finalRepairRounds, 1);
assert.equal(partialRepairParses, 2);

const blankHeadingProvider = new AIProvider({ pipeline: { runtime, clients: { isConfigured: () => true } } });
const recoveredHeadings = blankHeadingProvider._sanitizeStructuredArticle({
  title: "Ciclocross com critérios oficiais",
  sections: Array.from({ length: 22 }, (_, index) => ({
    heading: "",
    content: `O critério técnico ${index + 1} relaciona regulamento, equipamento e decisão de uso sem extrapolar as fontes. Conteúdo complementar.`,
  })),
});
assert.equal(recoveredHeadings.sections.length, 22);
assert.ok(recoveredHeadings.sections.every((section) => section.heading.length > 0));
assert.match(recoveredHeadings.sections[0].heading, /critério técnico 1/i);

const additiveArticle = JSON.stringify({
  sections: Array.from({ length: 5 }, (_, index) => ({ heading: `Seção ${index}`, content: `Conteúdo original ${index}.` })),
});
let additiveParseRounds = 0;
const additiveProvider = new AIProvider({
  pipeline: {
    runtime,
    clients: { isConfigured: () => true },
    run: async () => ({ content: additiveArticle, metadata: { sourceHash: "additive-test", providers: {} } }),
    callStep: async ({ system, user }) => {
      assert.match(system, /complementos aditivos/);
      assert.match(user, /section_expansions/);
      return {
        provider: "deepseek",
        content: JSON.stringify({
          section_expansions: [
            { section_index: 0, additional_content: "Complemento factual zero." },
            { section_index: 2, additional_content: "Complemento factual dois." },
            { section_index: 4, additional_content: "Complemento factual quatro." },
          ],
        }),
      };
    },
  },
});
additiveProvider._parseStructuredResponse = (content) => {
  additiveParseRounds += 1;
  if (additiveParseRounds === 1) {
    throw new Error("Gates editoriais não atendidos: extensão insuficiente: 1532 palavras; mínimo 1600");
  }
  const expanded = JSON.parse(content);
  assert.match(expanded.sections[0].content, /Conteúdo original 0[\s\S]*Complemento factual zero/);
  assert.match(expanded.sections[2].content, /Conteúdo original 2[\s\S]*Complemento factual dois/);
  assert.match(expanded.sections[4].content, /Conteúdo original 4[\s\S]*Complemento factual quatro/);
  return { content, title: "Expansão validada" };
};
const additiveResult = await additiveProvider.processCase("Pauta para expansão", { content_type: "guia-tecnico", editorialPriority: "P1" });
assert.equal(additiveResult.pipelineMetadata.finalRepairRounds, 1);
assert.equal(additiveParseRounds, 2);

const previousDeterministicFallback = process.env.AI_DETERMINISTIC_CURATED_FALLBACK;
process.env.AI_DETERMINISTIC_CURATED_FALLBACK = "true";
const deterministicFallbackProvider = new AIProvider({
  pipeline: {
    runtime,
    clients: { isConfigured: () => false },
    run: async () => ({ content: "{}", metadata: { sourceHash: "deterministic-fallback-test", providers: {} } }),
    callStep: async () => ({ provider: "deepseek", content: "{}" }),
  },
});
await assert.rejects(() => deterministicFallbackProvider.processCase(
  "Limpeza da transmissão depois de chuva e lama",
  {
    title: "Limpeza da transmissão depois de chuva e lama",
    content_type: "guia-tecnico",
    editorialPriority: "P1",
    portfolio_evidence_url: "https://thebikershop.com.br/componentes/",
    portfolio_verified_at: "2026-08-13",
    confirmed_facts: [
      { fact: "drivetrainCleaning: use o limpador recomendado pelo fabricante e seque a corrente depois da limpeza." },
      { fact: "pressureWashing: jatos de alta pressão podem danificar componentes e vedações." },
      { fact: "brakeInspection: inspecione pastilhas, rotores, comando e vazamentos antes de voltar a pedalar." },
      { fact: "wetBraking: a distância de frenagem aumenta em piso molhado." },
      { fact: "escalation: procure uma oficina quando houver dano, vazamento ou funcionamento irregular." },
    ],
    sources: [
      { name: "SRAM Support", type: "official-website", url: "https://www.sram.com/en/learn/axs-bike-care-and-maintenance", accessed: "2026-08-13" },
      { name: "Shimano Manuals", type: "official-website", url: "https://si.shimano.com/", accessed: "2026-08-13" },
    ],
    grounding: { fallback: "curated-official-offline-cache-v1" },
  },
), /Fallback determinístico integral desativado/);
const previousCacheFirst = process.env.AI_DETERMINISTIC_CACHE_FIRST;
process.env.AI_DETERMINISTIC_CACHE_FIRST = "true";
let cacheFirstPipelineCalled = false;
const cacheFirstProvider = new AIProvider({
  pipeline: {
    runtime,
    clients: { isConfigured: () => true },
    run: async () => { cacheFirstPipelineCalled = true; throw new Error("provider should not be called in cache-first mode"); },
  },
});
await assert.rejects(() => cacheFirstProvider.processCase("Limpeza da transmissão depois de chuva e lama", {
  title: "Limpeza da transmissão depois de chuva e lama",
  content_type: "guia-tecnico",
  editorialPriority: "P1",
  portfolio_evidence_url: "https://thebikershop.com.br/componentes/",
  portfolio_verified_at: "2026-08-13",
  confirmed_facts: [
    { fact: "drivetrainCleaning: limpe a transmissão com produto não ácido e seque a corrente." },
    { fact: "pressureWashing: evite jato de alta pressão em componentes e vedações." },
    { fact: "brakeInspection: confira pastilhas, rotores e vazamentos antes de pedalar." },
    { fact: "wetBraking: a distância de frenagem aumenta em piso molhado." },
    { fact: "escalation: procure uma oficina diante de dano ou funcionamento irregular." },
  ],
  sources: [
    { name: "SRAM Support", type: "official-website", url: "https://www.sram.com/en/learn/axs-bike-care-and-maintenance", accessed: "2026-08-13" },
  ],
  grounding: { fallback: "campaign-research-offline-cache-v1" },
}), /provider should not be called|Fallback determinístico integral desativado/);
assert.equal(cacheFirstPipelineCalled, true);
if (previousCacheFirst === undefined) delete process.env.AI_DETERMINISTIC_CACHE_FIRST;
else process.env.AI_DETERMINISTIC_CACHE_FIRST = previousCacheFirst;
const pipelineFailureProvider = new AIProvider({
  pipeline: {
    runtime,
    clients: { isConfigured: () => false },
    run: async () => { throw new Error("Nenhum provedor configurado"); },
  },
});
await assert.rejects(() => pipelineFailureProvider.processCase("Fallback sem provedor", {
  content_type: "guia-tecnico",
  portfolio_evidence_url: "https://thebikershop.com.br/componentes/",
  portfolio_verified_at: "2026-08-13",
  confirmed_facts: [
    { fact: "drivetrainCleaning: use o limpador recomendado pelo fabricante e seque a corrente depois da limpeza." },
    { fact: "pressureWashing: jatos de alta pressão podem danificar componentes e vedações." },
    { fact: "brakeInspection: inspecione pastilhas, rotores, comando e vazamentos antes de voltar a pedalar." },
    { fact: "wetBraking: a distância de frenagem aumenta em piso molhado." },
    { fact: "escalation: procure uma oficina quando houver dano, vazamento ou funcionamento irregular." },
  ],
  sources: [{ name: "Fonte oficial", type: "official-website", url: "https://www.sram.com/", accessed: "2026-08-13" }],
  grounding: { fallback: "curated-official-offline-cache-v1" },
}), /Fallback determinístico integral desativado/);
const internalFallbackProvider = new AIProvider({
  pipeline: {
    runtime,
    clients: { isConfigured: () => false },
    run: async () => { throw new Error("Etapa final-audit falhou. deepseek: 402 Insufficient Balance | groq: 413 tokens per minute"); },
  },
});
await assert.rejects(() => internalFallbackProvider.processCase("Ficha documental com cota indisponível", {
  status: "pesquisa_concluida",
  content_type: "guia-tecnico",
  confirmed_facts: [
    { fact: "frame.material: alumínio 6061", source_ids: ["internal-src-1"], evidence_quote: "material alumínio 6061 informado na ficha" },
    { fact: "suspension.fork: garfo documentado", source_ids: ["internal-src-1"], evidence_quote: "garfo documentado na página oficial" },
    { fact: "drivetrain.rearDerailleur: câmbio documentado", source_ids: ["internal-src-1"], evidence_quote: "câmbio documentado na página oficial" },
  ],
  sources: [{ id: "internal-src-1", name: "Catálogo interno verificado", type: "store", url: "https://thebikershop.com.br/produtos/ficha", accessed: "2026-08-13" }],
  grounding: {
    fallback: "internal-product-knowledge",
    evidenceContract: "retrieved-excerpt-v1",
    claimContract: "explicit-units-v1",
    verifiedAt: "2026-08-13T12:00:00.000Z",
  },
}), /fallback determinístico|Gates editoriais não atendidos/i);
if (previousDeterministicFallback === undefined) delete process.env.AI_DETERMINISTIC_CURATED_FALLBACK;
else process.env.AI_DETERMINISTIC_CURATED_FALLBACK = previousDeterministicFallback;
if (previousCacheFirst === undefined) delete process.env.AI_DETERMINISTIC_CACHE_FIRST;
else process.env.AI_DETERMINISTIC_CACHE_FIRST = previousCacheFirst;
if (previousPipelineMode === undefined) delete process.env.AI_PIPELINE_MODE;
else process.env.AI_PIPELINE_MODE = previousPipelineMode;

let remediationCalls = 0;
let remediationPrompt = "";
const remediationClients = {
  isConfigured: () => true,
  async generate(provider, _system, user) {
    remediationCalls += 1;
    if (remediationCalls === 6) remediationPrompt = user;
    const responses = [
      { facts: [], gaps: [], conflicts: [{ field: "compatibilidade", issue: "fonte ausente" }], forbiddenClaims: ["compatibilidade não confirmada"], technicalAngles: [] },
      { title: "Rascunho", sections: [] },
      { score: 80, blockers: [{ type: "unsupported", detail: "fato não confirmado" }], warnings: [] },
      { title: "Edição premium", sections: [] },
      { score: 85, blockers: [{ type: "forbidden", detail: "compatibilidade não confirmada" }], warnings: [] },
      { title: "Versão corrigida", sections: [] },
      { score: 96, blockers: [], warnings: [] },
    ];
    return { provider, model: "test", content: JSON.stringify(responses[remediationCalls - 1]), usage: {}, durationMs: 1 };
  },
};
const remediationPipeline = new ThreeProviderPipeline({ clients: remediationClients, runtime, env: {} });
const remediated = await remediationPipeline.run({
  topic: "Tema técnico",
  researchData: { sources: [{ name: "Fonte", url: "https://example.com" }] },
  contentType: "noticia",
  template: { structure: ["Método"] },
  systemPrompt: "Sistema",
  draftPrompt: "Rascunho",
  priority: "P2",
});
assert.equal(remediationCalls, 7);
assert.equal(remediated.metadata.premiumEditUsed, true);
assert.equal(remediated.metadata.remediationEditUsed, true);
assert.equal(remediated.metadata.finalScore, 96);
assert.match(remediated.content, /Versão corrigida/);
assert.match(remediationPrompt, /AUDITORIA FINAL COMPLETA/);
assert.match(remediationPrompt, /"score": 85/);

console.log("Pipeline de três provedores validado com sucesso.");
