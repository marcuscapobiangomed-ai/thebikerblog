import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadQueue, selectReadyItem } from "./src/automation/queue.js";
import { CampaignSchema, selectProductionCandidate, selectPublicationCandidate, publicCampaignSummary } from "./src/automation/campaign.js";
import { GroundedResearcher } from "./src/automation/grounded-research.js";
import { finalizeCampaignItem } from "./src/campaign_finalize.js";
import { produceCampaignCover } from "./src/images/campaign-cover.js";
import { classifyOfficialImageQuality } from "./src/images/official-campaign-image.js";
import { selectKnowledgeEvidence } from "./src/campaign_producer.js";
import { selectScheduledPublication } from "./src/publish_scheduled.js";
import { buildRepairPrompt } from "./src/editorial-prompt.js";
import { produceCampaignVisual } from "./src/campaign_finalize.js";
import { markdownPublicationErrors } from "./src/validation/markdown-publication-gates.js";
import { scheduledDraftErrors } from "./src/validation/validate-scheduled-publications.js";

assert.deepEqual(markdownPublicationErrors(`---
tags: ["ciclismo", "cambio-eletronico"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Diagnóstico técnico baseado em fontes.`), []);
assert.deepEqual(markdownPublicationErrors(`---
tags: ["câmbio eletrônico"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Durante o pedal, a tecnologia de ponta resolveu tudo.`), [
  "tags não canônicas: câmbio eletrônico",
  "linguagem publicitária proibida: tecnologia de ponta",
  "alegação de teste prático proibida: Durante o pedal",
]);
assert.deepEqual(scheduledDraftErrors(`---
published: false
tags: ["ciclismo", "guia-tecnico"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Diagnóstico técnico baseado em fontes.`), []);
assert.deepEqual(scheduledDraftErrors(`---
published: true
tags: ["guia técnico"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Diagnóstico técnico baseado em fontes.`), [
  "rascunho scheduled precisa conter published: false",
  "tags não canônicas: guia técnico",
]);

const root = await fs.mkdtemp(path.join(os.tmpdir(), "thebiker-queue-"));
await fs.mkdir(path.join(root, "content/research"), { recursive: true });
await fs.writeFile(path.join(root, "content/research/a.json"), "{}");
const queuePath = path.join(root, "queue.json");
await fs.writeFile(queuePath, JSON.stringify({ version: 1, items: [
  { id: "later-topic", topic: "Uma pauta técnica futura válida", researchPath: "content/research/a.json", priority: "P0", notBefore: "2099-01-01T00:00:00.000Z" },
  { id: "ready-topic", topic: "Uma pauta técnica pronta e válida", researchPath: "content/research/a.json", priority: "P1" }
] }));
const queue = await loadQueue(queuePath, root);
assert.equal(selectReadyItem(queue, new Date("2026-08-04T12:00:00Z")).id, "ready-topic");
assert.equal(selectReadyItem({ items: [] }), null);
const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(new URL('./editorial-campaign.json', import.meta.url), 'utf8')));
assert.equal(campaign.items.length, 30);
const conceptualComparison = structuredClone(campaign);
conceptualComparison.items[0] = {
  ...conceptualComparison.items[0],
  category: 'comparativo',
  status: 'validation',
  productIds: [],
  heroImage: { mode: 'conceptual' },
};
assert.doesNotThrow(() => CampaignSchema.parse(conceptualComparison));
const reviewWithoutProduct = structuredClone(campaign);
reviewWithoutProduct.items[0] = { ...reviewWithoutProduct.items[0], category: 'review', status: 'validation', productIds: [] };
assert.throws(() => CampaignSchema.parse(reviewWithoutProduct), /review validado exige ao menos um produto rastreável/);
const inferred = selectKnowledgeEvidence([
  { id: 'addict-rc-20', model: 'Addict RC 20' },
  { id: 'addict-rc-pro', model: 'Addict RC Pro' },
  { id: 'spark-rc', model: 'Spark RC' },
], {
  title: 'Addict RC 20 ou RC Pro: diferenças de montagem',
  summary: 'Comparação técnica entre as duas bicicletas.',
  productIds: [],
});
assert.deepEqual(inferred.inferredProductIds, ['addict-rc-20', 'addict-rc-pro']);
const unrelated = selectKnowledgeEvidence([
  { id: 'spark-rc', model: 'Spark RC' },
], {
  title: 'Pressão de pneus por terreno',
  summary: 'Método de campo sem modelo específico.',
  productIds: [],
});
assert.deepEqual(unrelated.records, []);
assert.match(buildRepairPrompt({
  topic: 'Diagnóstico técnico',
  rawText: '{}',
  validationError: 'extensão insuficiente: 1462 palavras; mínimo 1600',
  contentType: 'guia-tecnico',
  template: { label: 'Guia técnico' },
  today: '2026-08-08',
}), /ao menos 1840 palavras reais/);
const conceptualVisualRoot = path.join(root, "conceptual-visual");
const conceptualVisual = await produceCampaignVisual({
  root: conceptualVisualRoot,
  item: {
    id: "bike-de-fabrica-vs-bike-de-competicao",
    title: "Bike de fábrica vs. bike de competição",
    category: "comparativo",
    productIds: [],
  },
  approvedAt: "2026-08-08",
});
assert.equal(conceptualVisual.manifest.assetType, "technical-diagram");
assert.equal(conceptualVisual.manifest.source.type, "own-production");
const campaignWithHistory = structuredClone(campaign);
for (const item of campaignWithHistory.items) item.status = 'blocked';
campaignWithHistory.items[3].status = 'planned';
assert.equal(selectProductionCandidate(campaignWithHistory).day, 4);
assert.equal(selectPublicationCandidate(campaignWithHistory, campaign.items[0].publishDate), null);
const scheduled = structuredClone(campaign);
scheduled.items[0].status = 'scheduled';
scheduled.items[0].postPath = `_posts/drafts/${scheduled.items[0].publishDate}-sag.md`;
assert.equal(selectPublicationCandidate(scheduled, scheduled.items[0].publishDate).day, 1);
assert.equal(publicCampaignSummary(scheduled).items[0].title, scheduled.items[0].title);
const imageConfig = {
  minimumPublishableLongEdge: 1600,
  minimumPublishableShortEdge: 800,
  minimumStandardLongEdge: 900,
  minimumStandardShortEdge: 600,
};
assert.deepEqual(classifyOfficialImageQuality({ width: 2000, height: 1200 }, imageConfig), {
  qualityTier: "high-definition",
  outputFormat: "png",
});
assert.deepEqual(classifyOfficialImageQuality({ width: 1024, height: 1024 }, imageConfig), {
  qualityTier: "standard",
  outputFormat: "webp",
});
assert.throws(
  () => classifyOfficialImageQuality({ width: 320, height: 200 }, imageConfig),
  /resolução insuficiente/,
);
const catchUpCampaign = structuredClone(campaign);
for (const item of catchUpCampaign.items) item.status = 'planned';
catchUpCampaign.items[0].status = 'scheduled';
catchUpCampaign.items[1].status = 'published';
catchUpCampaign.items[1].publishedAt = '2026-08-05T15:00:00.000Z';
assert.deepEqual(selectScheduledPublication(catchUpCampaign, catchUpCampaign.items[1].publishDate), {
  item: catchUpCampaign.items[0],
  catchUp: true,
});
const groundedPayload = {
  candidates: [{ content: { parts: [{ text: JSON.stringify({ confirmed_facts: { material: 'Carbono HMF' }, limitations: [], sources: [{ name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessed: '2026-08-04' }] }) }] }, groundingMetadata: { webSearchQueries: ['site:scott-sports.com teste'] } }]
};
const groqPayload = { choices: [{ message: { content: groundedPayload.candidates[0].content.parts[0].text } }] };
let groundedRequest;
const researcher = new GroundedResearcher({ GROQ_API_KEY: 'test' }, async (_url, init) => {
  groundedRequest = JSON.parse(init.body);
  return { ok: true, json: async () => groqPayload };
});
const grounded = await researcher.research({ item: { ...campaign.items[0], freshness: 'revalidate-24h' }, internalEvidence: [], today: '2026-08-04' });
assert.equal(grounded.status, 'pesquisa_concluida');
assert.equal(grounded.sources.length, 1);
assert.equal(grounded.portfolio_evidence_url, 'https://thebikershop.com.br/componentes/');
assert.equal(grounded.portfolio_verified_at, '2026-08-04');
assert.equal(groundedRequest.model, 'groq/compound-mini');
assert.deepEqual(groundedRequest.compound_custom.tools.enabled_tools, ['web_search', 'visit_website']);
const fallbackResearcher = new GroundedResearcher({ GROQ_API_KEY: 'test', AI_HTTP_RETRY_ATTEMPTS: '1' }, async () => ({ ok: false, status: 429, text: async () => 'quota' }));
const fallbackGrounded = await fallbackResearcher.research({
  item: campaign.items[0],
  internalEvidence: [{ id: 'spark', facts: { suspension: '120 mm' }, sources: [{ name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessedAt: '2026-08-04' }] }],
  today: '2026-08-05',
});
assert.equal(fallbackGrounded.grounding.fallback, 'internal-product-knowledge');
assert.equal(fallbackGrounded.sources.length, 1);
const curatedFallback = await fallbackResearcher.research({
  item: {
    id: 'reserva-inspecao-pos-chuva',
    title: 'Inspeção da bicicleta após pedalar na chuva',
    summary: 'Procedimento técnico pós-pedal molhado.',
    category: 'manutencao-ajustes',
  },
  internalEvidence: [],
  today: '2026-08-05',
});
assert.equal(curatedFallback.grounding.fallback, 'curated-official-knowledge');
assert.ok(curatedFallback.sources.length >= 2);
let resilientResearchCalls = 0;
const resilientResearcher = new GroundedResearcher({
  GROQ_API_KEY: 'test',
  GEMINI_API_KEY: 'test-gemini',
  AI_HTTP_RETRY_ATTEMPTS: '1',
}, async (_url, init) => {
  resilientResearchCalls += 1;
  if (init.headers.Authorization) return { ok: false, status: 429, text: async () => 'rate limited' };
  const request = JSON.parse(init.body);
  assert.deepEqual(request.tools, [{ google_search: {} }]);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{
        content: { parts: [{ text: groundedPayload.candidates[0].content.parts[0].text }] },
        groundingMetadata: { webSearchQueries: ['site:scott-sports.com pressão pneus'] },
      }],
    }),
  };
});
const resilientGrounded = await resilientResearcher.research({ item: campaign.items[0], internalEvidence: [], today: '2026-08-05' });
assert.equal(resilientResearchCalls, 2);
assert.equal(resilientGrounded.grounding.provider, 'gemini-google-search');
assert.deepEqual(resilientGrounded.grounding.queries, ['site:scott-sports.com pressão pneus']);
const contextLengthDetail = JSON.stringify({ error: { code: 'context_length_exceeded', message: 'Please reduce the length of the messages or completion.' } });
const contextLengthResearcher = new GroundedResearcher({ GROQ_API_KEY: 'test' }, async () => ({
  ok: false,
  status: 400,
  clone: () => ({ text: async () => contextLengthDetail }),
  text: async () => contextLengthDetail,
}));
const contextLengthFallback = await contextLengthResearcher.research({
  item: campaign.items[0],
  internalEvidence: [{ id: 'spark', facts: { suspension: '120 mm' }, sources: [{ name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessedAt: '2026-08-04' }] }],
  today: '2026-08-05',
});
assert.equal(contextLengthFallback.grounding.fallback, 'internal-product-knowledge');
assert.match(contextLengthFallback.limitations[0], /context_length_exceeded/);
let parseFailureAttempts = 0;
const parseFailureResearcher = new GroundedResearcher({
  GROQ_API_KEY: 'test',
  AI_HTTP_RETRY_ATTEMPTS: '2',
}, async () => {
  parseFailureAttempts += 1;
  if (parseFailureAttempts === 1) {
    const detail = JSON.stringify({ error: { code: 'output_parse_failed' } });
    return {
      ok: false,
      status: 400,
      clone: () => ({ text: async () => detail }),
      text: async () => detail,
    };
  }
  return { ok: true, status: 200, json: async () => groqPayload };
});
const recoveredAfterParseFailure = await parseFailureResearcher.research({
  item: campaign.items[0],
  internalEvidence: [],
  today: '2026-08-05',
});
assert.equal(parseFailureAttempts, 2);
assert.equal(recoveredAfterParseFailure.status, 'pesquisa_concluida');
let timeoutAttempts = 0;
const timeoutResearcher = new GroundedResearcher({
  GROQ_API_KEY: 'test',
  AI_HTTP_RETRY_ATTEMPTS: '2',
  AI_HTTP_TIMEOUT_MS: '1000',
}, async () => {
  timeoutAttempts += 1;
  const error = new Error('timeout');
  error.name = 'TimeoutError';
  throw error;
});
const timeoutFallback = await timeoutResearcher.research({
  item: campaign.items[0],
  internalEvidence: [{ id: 'spark', facts: { suspension: '120 mm' }, sources: [{ name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessedAt: '2026-08-04' }] }],
  today: '2026-08-05',
});
assert.equal(timeoutAttempts, 2);
assert.equal(timeoutFallback.grounding.fallback, 'internal-product-knowledge');

const finalizeRoot = path.join(root, "finalize");
await fs.mkdir(path.join(finalizeRoot, "bot"), { recursive: true });
await fs.mkdir(path.join(finalizeRoot, "_data"), { recursive: true });
await fs.mkdir(path.join(finalizeRoot, "_posts/drafts"), { recursive: true });
await fs.mkdir(path.join(finalizeRoot, "content/product-discovery"), { recursive: true });
await fs.writeFile(path.join(finalizeRoot, "content/product-discovery/thebiker-media-catalog.json"), JSON.stringify({ products: [] }));
const finalizeCampaign = structuredClone(campaign);
finalizeCampaign.items[0].status = "validation";
finalizeCampaign.items[0].heroImage = { mode: "conceptual" };
finalizeCampaign.items[0].aiReview.finalScore = 95;
finalizeCampaign.items[0].aiReview.finalBlockers = 0;
finalizeCampaign.items[0].postPath = `_posts/drafts/${finalizeCampaign.items[0].publishDate}-${finalizeCampaign.items[0].id}.md`;
await fs.writeFile(path.join(finalizeRoot, "bot/editorial-campaign.json"), JSON.stringify(finalizeCampaign));
const sections = Array.from({ length: 5 }, (_, index) => `## Seção técnica ${index + 1}\n\nConteúdo técnico sustentado pelas fontes editoriais.`).join("\n\n");
await fs.writeFile(path.join(finalizeRoot, finalizeCampaign.items[0].postPath), `---\nlayout: post\npublished: false\ndate: 2026-08-04\nlast_modified_at: 2026-08-04\ndirect_answer: "Este guia apresenta um diagnóstico técnico verificável, baseado nas fontes declaradas, para orientar ajustes sem transformar hipótese em constatação."\nimage: "/assets/img/system/covers/guia-tecnico-v2/hero-1600.webp"\nimage_mobile: "/assets/img/system/covers/guia-tecnico-v2/hero-800.webp"\nthumbnail: "/assets/img/system/covers/guia-tecnico-v2/card-640.webp"\nimage_asset_type: "system-fallback"\nimage_status: "draft"\nimage_alt: "Capa"\nimage_caption: "Capa"\nimage_credit: "TheBiker"\nimage_license: "Interno"\nreviewed_by: ""\neditorial_status: "draft"\nstatus: "draft"\nsources:\n  - name: "Scott"\n    url: "https://www.scott-sports.com/"\n---\n\n${sections}\n`);
const finalized = await finalizeCampaignItem({
  root: finalizeRoot,
  now: new Date("2026-08-05T10:00:00Z"),
  imageProducer: produceCampaignCover,
});
assert.equal(finalized.status, "scheduled");
const finalizedCampaign = JSON.parse(await fs.readFile(path.join(finalizeRoot, "bot/editorial-campaign.json"), "utf8"));
assert.equal(finalizedCampaign.items[0].status, "scheduled");
assert.ok(await fs.stat(path.join(finalizeRoot, finalizedCampaign.items[0].imageManifestPath)));
await fs.rm(root, { recursive: true, force: true });
console.log("Automation queue tests passed.");
