#!/usr/bin/env node
import assert from "node:assert/strict";
import { ThreeProviderPipeline, applyPortfolioEvidence } from "./src/ai/three-provider-pipeline.js";
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
        content: JSON.stringify({ facts: [], gaps: [], conflicts: [], forbiddenClaims: [], technicalAngles: [] }),
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
