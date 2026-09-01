import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { loadQueue, selectReadyItem } from "./src/automation/queue.js";
import { CampaignSchema, publicationResearchIsFresh, selectProductionCandidate, selectPublicationCandidate, publicCampaignSummary } from "./src/automation/campaign.js";
import { GroundedResearcher } from "./src/automation/grounded-research.js";
import { cleanupFailedFinalization, finalizeCampaignItem, normalizeCategoryExamplePromotion } from "./src/campaign_finalize.js";
import { produceCampaignCover } from "./src/images/campaign-cover.js";
import { classifyOfficialImageQuality } from "./src/images/official-campaign-image.js";
import { selectKnowledgeEvidence } from "./src/campaign_producer.js";
import { CatchUpPolicy, publishScheduled, selectScheduledPublication } from "./src/publish_scheduled.js";
import { resolveLegacyTarget } from "./src/publish_post.js";
import { GitHubPublisher, LEGACY_GITHUB_PUBLISHER_FLAG } from "./src/publisher.js";
import { buildRepairPrompt } from "./src/editorial-prompt.js";
import { produceCampaignVisual } from "./src/campaign_finalize.js";
import { markdownPublicationErrors, neutralizeMarkdownPolicyPhrases } from "./src/validation/markdown-publication-gates.js";
import { orphanedCampaignDraftErrors, scheduledDraftErrors } from "./src/validation/validate-scheduled-publications.js";
import { assertScheduledReceipt, hashEditorialText } from "./src/validation/editorial-receipt.js";
import { assertArticleResearchGrounding, articleResearchGroundingErrors } from "./src/validation/article-research-grounding.js";
import { assertResearchEvidenceContract } from "./src/validation/research-grounding.js";
import { classifyEditorialFailure } from "./src/validation/editorial-failures.js";
import { researchForPublication } from "./src/validation/publication-research.js";
import { assertReceiptAuditPolicy, auditEditorialReceipts } from "../scripts/backfill-editorial-receipts.mjs";

const contaminatedEditorialMarkdown = `---
content_type: "review"
review_method: "desk-research"
tested_by_thebikerblog: false
direct_answer: "Use esta ficha como roteiro documental: confronte cada dado com a fonte oficial e registre lacunas antes de decidir."
tags: ["ciclismo"]
---
## Identidade e escopo da ficha

Este ficha editorial parte de um produto e o segundo modelo listado na pesquisa. Comece pela pagina oficial, confira titulo, preco e versao, e Abra o registro de identidade.
`;
const contaminatedErrors = markdownPublicationErrors(contaminatedEditorialMarkdown).join(" | ");
assert.match(contaminatedErrors, /placeholder ou erro gramatical/);
assert.match(contaminatedErrors, /português sem acentuação/);
assert.match(contaminatedErrors, /instrução interna exposta/);
assert.match(contaminatedErrors, /intertítulo de processo editorial/);
assert.match(contaminatedErrors, /resposta direta descreve o processo editorial/);
assert.match(markdownPublicationErrors(`---
content_type: "guia-tecnico"
review_method: "desk-research"
tested_by_thebikerblog: false
direct_answer: "A sequência organiza a manutenção preventiva com critérios técnicos claros para inspeção, limpeza e encaminhamento à oficina."
tags: ["manutencao"]
---
## Bastidores

Como este artigo foi produzido: conteúdo elaborado com auxílio de IA. O produto não foi testado presencialmente pela equipe.
`).join(" | "), /disclosure de bastidor editorial exposto/);
assert.deepEqual(markdownPublicationErrors(`---
content_type: "review"
review_method: "desk-research"
tested_by_thebikerblog: false
brand: "Scott"
product_name: "Addict RC Pro"
model_year: 2026
direct_answer: "A Scott Addict RC Pro reúne quadro HMX, transmissão Shimano Dura-Ace Di2 e rodas Syncros, conforme a ficha oficial consultada."
tags: ["ciclismo"]
sources:
  - name: "Scott"
    type: "manufacturer"
    url: "https://www.scott-sports.com/"
---
## Quadro HMX e montagem Dura-Ace Di2

A ficha oficial identifica o quadro Addict RC HMX Carbon e o grupo Shimano Dura-Ace Di2.
`), []);
assert.match(markdownPublicationErrors(`---
content_type: "review"
review_method: "desk-research"
tested_by_thebikerblog: false
direct_answer: "O modelo usa quadro HMX, transmissão eletrônica e rodas de carbono segundo a especificação técnica do fabricante."
tags: ["ciclismo"]
---
## Peso máximo do sistema

Há uma divergência entre as fontes: a loja apresenta um valor, mas o fabricante informa outro.
`).join(" | "), /conflito entre fontes exposto/);

const publicationResearch = researchForPublication({
  title: "Scott Addict RC Pro: preço e divergências entre fontes",
  notes: "Não deve chegar ao redator público.",
  sources: [
    { id: "manufacturer", type: "manufacturer" },
    { id: "store", type: "store" },
  ],
  confirmed_facts: [
    { fact: "weight.maxSystem: 120 kg", source_ids: ["manufacturer"] },
    { fact: "weight.maxSystem: 128 kg", source_ids: ["store"] },
    { fact: "commercial.price: R$ 94.990,00", source_ids: ["store"] },
    { fact: "sourceConflict.weight: 120 kg vs 128 kg", source_ids: ["manufacturer", "store"] },
  ],
  limitations: ["Divergência entre fontes registrada internamente.", "Preço deve ser reconfirmado."],
  grounding: {},
});
assert.deepEqual(publicationResearch.confirmed_facts.map((fact) => fact.fact), [
  "weight.maxSystem: 120 kg",
  "commercial.price: R$ 94.990,00",
]);
assert.deepEqual(publicationResearch.limitations, ["Preço deve ser reconfirmado."]);
assert.equal(publicationResearch.grounding.publicationPolicy, "manufacturer-precedence-v1");
assert.equal(publicationResearch.title, "Scott Addict RC Pro: preço");
assert.equal("notes" in publicationResearch, false);

const minimalResearch = {
  confirmed_facts: [{ fact: "frame.material: Spark RC Carbon HMX" }, { fact: "suspension.frontTravel: 120 mm" }],
  sources: [],
};
assert.equal(publicationResearchIsFresh(
  { freshness: "revalidate-24h" },
  { grounding: { verifiedAt: "2026-08-20T10:00:00.000Z" } },
  new Date("2026-08-21T09:59:00.000Z"),
), true);
assert.equal(publicationResearchIsFresh(
  { freshness: "revalidate-24h" },
  { grounding: { verifiedAt: "2026-08-19T10:00:00.000Z" } },
  new Date("2026-08-21T10:00:00.000Z"),
), false);
assert.equal(publicationResearchIsFresh({ freshness: "evergreen" }, {}, new Date()), true);
const cacheResearcher = new GroundedResearcher({
  RESEARCH_PROVIDER: "groq",
  CAMPAIGN_CURATED_OFFLINE_FALLBACK: "true",
}, async () => { throw new Error("rede indisponÃ­vel"); });
const cachedCampaignResearch = await cacheResearcher.research({
  item: {
    id: "reserva-diagnostico-ruidos-bike",
    title: "DiagnÃ³stico de ruÃ­dos na bicicleta: mÃ©todo por carga, frequÃªncia e interface",
    summary: "Guia tÃ©cnico",
    category: "manutencao-ajustes",
  },
  internalEvidence: [],
  today: "2026-08-13",
});
assert.equal(cachedCampaignResearch.grounding.fallback, "campaign-research-offline-cache-v1");
assert.ok(cachedCampaignResearch.confirmed_facts.length >= 5);
assert.ok(cachedCampaignResearch.sources.every((source) => source.id && source.url));
assert.doesNotThrow(() => assertResearchEvidenceContract(cachedCampaignResearch));
assert.equal(classifyEditorialFailure("Fallback interno bloqueado (Groq 429; Gemini quota)", { stage: "research" }).code, "TRANSIENT_PROVIDER");
assert.equal(classifyEditorialFailure("Fallback interno bloqueado: nenhuma fonte oficial permitida", { stage: "research" }).code, "RESEARCH_INSUFFICIENT");
assert.deepEqual(articleResearchGroundingErrors({
  content: "---\nimage_alt: Pedivela 175mm\n---\nFonte: https://docs.sram.com/en-US/publications/6sfLCOGTn6FE98W8vXLqm0/UM%20-%20Chains",
  research: { confirmed_facts: [], sources: [] },
}), []);
// Inferências técnicas agora são permitidas quando derivadas de fatos verificados.
// Teste mantém válidas apenas as detecções de repetição e alegações numéricas não-confirmadas.
const repeatedTechnicalParagraph = "A Spark utiliza carbono HMX e suspensão com 120 mm. Esta frase longa descreve apenas os campos confirmados na ficha e permanece deliberadamente extensa para representar um parágrafo editorial completo sem acrescentar uma conclusão causal.";
assert.throws(() => assertArticleResearchGrounding({
  content: `${repeatedTechnicalParagraph}\n\n${repeatedTechnicalParagraph} Outro complemento foi anexado.`,
  research: minimalResearch,
}), /paragrafos repetidos ou expandidos por copia/);
const repeatedDisclaimer = "Sem confirmação explícita nas fontes aceitas, o artigo não atribui medida a esse aspecto e mantém a análise limitada aos dados rastreáveis.";
assert.throws(() => assertArticleResearchGrounding({
  content: [repeatedDisclaimer, repeatedDisclaimer, repeatedDisclaimer].join(" "),
  research: minimalResearch,
}), /sentencas repetidas como enchimento/);

const neutralCategoryExample = normalizeCategoryExamplePromotion(`---
brand: "Shimano"
promoted_brands: ["Shimano"]
editorial_scope: "portfolio"
---
Texto técnico que cita o fabricante como fonte.`, {
  heroImage: { mode: "real-context", relationship: "category-example", productId: "bicicleta-eletrica-oggi" },
});
assert.equal(matter(neutralCategoryExample).data.brand, "");
assert.deepEqual(matter(neutralCategoryExample).data.promoted_brands, []);
assert.match(neutralCategoryExample, /cita o fabricante como fonte/);
const exactPromotion = normalizeCategoryExamplePromotion(`---
brand: "Shimano"
promoted_brands: ["Shimano"]
editorial_scope: "portfolio"
---`, {
  heroImage: { mode: "exact-product", relationship: "exact-product", productId: "grupo-shimano" },
});
assert.equal(matter(exactPromotion).data.brand, "Shimano");

assert.deepEqual(markdownPublicationErrors(`---
editorial_format: "full-article-v1"
tags: ["ciclismo", "cambio-eletronico"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Diagnóstico técnico baseado em fontes.`), []);
assert.deepEqual(markdownPublicationErrors(`---
editorial_format: "full-article-v1"
tags: ["câmbio eletrônico"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Durante o pedal, a tecnologia de ponta resolveu tudo.`), [
  "tags não canônicas: câmbio eletrônico",
  "linguagem publicitária proibida: tecnologia de ponta",
]);
const neutralizedDeskCopy = neutralizeMarkdownPolicyPhrases(
  "Durante o pedal percebemos uma tecnologia de ponta perfeita.",
  { deskResearch: true },
);
assert.equal(
  neutralizedDeskCopy,
  "Durante o pedal a documentação consultada indica uma tecnologia atual consistente.",
);
assert.doesNotMatch(neutralizedDeskCopy, /percebemos|tecnologia de ponta|perfeita/i);
assert.deepEqual(scheduledDraftErrors(`---
published: false
editorial_format: "full-article-v1"
tags: ["ciclismo", "guia-tecnico"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Diagnóstico técnico baseado em fontes.`), []);
assert.deepEqual(scheduledDraftErrors(`---
published: true
editorial_format: "full-article-v1"
tags: ["guia técnico"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Diagnóstico técnico baseado em fontes.`), [
  "rascunho scheduled precisa conter published: false",
  "tags não canônicas: guia técnico",
]);
assert.deepEqual(markdownPublicationErrors(`---
editorial_format: "evidence-brief-v1"
tags: ["scott"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Conteúdo de contingência.`), ["formato editorial não publicável: evidence-brief-v1"]);

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
assert.deepEqual(orphanedCampaignDraftErrors({
  campaign,
  drafts: [{ path: '_posts/drafts/orfao.md', slug: 'pauta-orfao' }, { path: '_posts/drafts/legado.md', slug: 'legado' }],
  researchSlugs: new Set(['pauta-orfao']),
}), ['pauta-orfao: rascunho de campanha órfão, sem referência no estado editorial']);
const conceptualComparison = structuredClone(campaign);
conceptualComparison.items[0] = {
  ...conceptualComparison.items[0],
  category: 'comparativo',
  status: 'validation',
  postPath: '_posts/drafts/fixture-comparativo.md',
  productIds: [],
  heroImage: { mode: 'conceptual' },
  aiReview: { ...conceptualComparison.items[0].aiReview, contentHash: `sha256:${'a'.repeat(64)}` },
};
assert.doesNotThrow(() => CampaignSchema.parse(conceptualComparison));
const reviewWithoutProduct = structuredClone(campaign);
reviewWithoutProduct.items[0] = { ...reviewWithoutProduct.items[0], category: 'review', status: 'validation', postPath: '_posts/drafts/fixture-review.md', productIds: [] };
assert.throws(() => CampaignSchema.parse(reviewWithoutProduct), /review validado exige ao menos um produto rastreável/);
const scheduledWithoutReceipt = structuredClone(campaign);
const scheduledFixture = scheduledWithoutReceipt.items[0];
Object.assign(scheduledFixture, {
  category: "engenharia",
  status: "scheduled",
  productIds: [],
  heroImage: { mode: "conceptual" },
  postPath: "_posts/drafts/fixture-recibo.md",
  imageManifestPath: "assets/img/posts/fixture-recibo/image-manifest.json",
  imageStatus: "approved",
  imageAssetIds: ["fixture-image"],
  aiReview: {
    score: 95,
    finalScore: 95,
    finalBlockers: 0,
    premiumEditUsed: false,
    providers: { fixture: "fixture" },
    generatedAt: "2026-08-20T12:00:00.000Z",
    contentHash: `sha256:${"a".repeat(64)}`,
  },
  visualDecision: {
    schemaVersion: 1,
    policyVersion: "thebiker-visual-autonomy-v1",
    inputHash: `sha256:${"b".repeat(64)}`,
    mode: "real-context",
    productId: null,
    score: 100,
    hardGates: { fixture: true },
    blockers: [],
    issuedAt: "2026-08-20T12:00:00.000Z",
  },
});
delete scheduledFixture.publishedAt;
delete scheduledFixture.editorialReceipt;
assert.throws(() => CampaignSchema.parse(scheduledWithoutReceipt), /scheduled exige recibo editorial/);
const blockedWithoutReason = structuredClone(campaign);
const candidateWithoutReason = blockedWithoutReason.items.find((item) => item.status !== "blocked");
assert.ok(candidateWithoutReason, "fixture precisa conter ao menos uma pauta não bloqueada");
candidateWithoutReason.status = "blocked";
delete candidateWithoutReason.blockReason;
delete candidateWithoutReason.failure;
assert.throws(() => CampaignSchema.parse(blockedWithoutReason), /blocked exige motivo ou falha tipada/);
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
}), /entre 850 e 1650 palavras úteis/);
await assert.rejects(() => produceCampaignVisual({
  root: path.join(root, "conceptual-visual"),
  item: {
    id: "bike-de-fabrica-vs-bike-de-competicao",
    title: "Bike de fábrica vs. bike de competição",
    category: "comparativo",
    productIds: [],
  },
  approvedAt: "2026-08-08",
}), /agendamento exige fotografia real/i);
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
catchUpCampaign.items[0].postPath = `_posts/drafts/${catchUpCampaign.items[0].publishDate}-catch-up.md`;
catchUpCampaign.items[1].status = 'published';
catchUpCampaign.items[1].publishedAt = '2026-08-05T15:00:00.000Z';
assert.deepEqual(selectScheduledPublication(catchUpCampaign, catchUpCampaign.items[1].publishDate, {
  catchUpPolicy: CatchUpPolicy.OLDEST_APPROVED,
}), {
  item: catchUpCampaign.items[0],
  catchUp: true,
  catchUpPolicy: CatchUpPolicy.OLDEST_APPROVED,
  overdueCount: 1,
  dueStatus: 'published',
});
const backlogWithToday = structuredClone(catchUpCampaign);
backlogWithToday.items[1].status = 'scheduled';
delete backlogWithToday.items[1].publishedAt;
assert.deepEqual(selectScheduledPublication(backlogWithToday, backlogWithToday.items[1].publishDate, {
  catchUpPolicy: CatchUpPolicy.OLDEST_APPROVED,
}), {
  item: backlogWithToday.items[0],
  catchUp: true,
  catchUpPolicy: CatchUpPolicy.OLDEST_APPROVED,
  overdueCount: 1,
  dueStatus: 'scheduled',
}, 'o atraso mais antigo deve ser publicado antes da pauta do dia');
const blockedTodayWithBacklog = structuredClone(backlogWithToday);
blockedTodayWithBacklog.items[1].status = 'blocked';
blockedTodayWithBacklog.items[1].blockReason = 'Falha induzida na pauta do dia';
assert.deepEqual(selectScheduledPublication(blockedTodayWithBacklog, blockedTodayWithBacklog.items[1].publishDate, {
  catchUpPolicy: CatchUpPolicy.OLDEST_APPROVED,
}), {
  item: blockedTodayWithBacklog.items[0],
  catchUp: true,
  catchUpPolicy: CatchUpPolicy.OLDEST_APPROVED,
  overdueCount: 1,
  dueStatus: 'blocked',
}, 'pauta bloqueada hoje não deve impedir overdue scheduled quando catch-up seguro está explícito');
assert.throws(
  () => selectScheduledPublication(blockedTodayWithBacklog, blockedTodayWithBacklog.items[1].publishDate),
  /pauta .* de hoje esta em blocked/,
  'sem política explícita, o publicador deve permanecer fail-closed',
);
assert.throws(
  () => selectScheduledPublication(backlogWithToday, backlogWithToday.items[1].publishDate, { catchUpPolicy: 'all' }),
  /Politica de catch-up invalida/,
);
assert.deepEqual(selectScheduledPublication(campaign, '2026-01-01'), {
  item: null,
  catchUp: false,
  cycleComplete: true,
}, 'data anterior à próxima janela deve ser no-op idempotente');
assert.equal(resolveLegacyTarget(backlogWithToday, backlogWithToday.items[0].id).id, backlogWithToday.items[0].id);
assert.equal(resolveLegacyTarget(backlogWithToday, backlogWithToday.items[0].postPath).id, backlogWithToday.items[0].id);
assert.throws(() => resolveLegacyTarget(backlogWithToday, "arquivo-fora-do-ledger.md"), /nao esta no ledger/);
const legacyPublisherEnv = { GITHUB_TOKEN: "test", GITHUB_USER: "test", GITHUB_REPO: "test" };
const disabledLegacyPublisher = new GitHubPublisher({ env: legacyPublisherEnv, warn: () => {} });
await assert.rejects(
  disabledLegacyPublisher.publishPost({ postContent: "---\n---", slug: "teste" }),
  new RegExp(LEGACY_GITHUB_PUBLISHER_FLAG),
);
const legacyWarnings = [];
const enabledLegacyPublisher = new GitHubPublisher({
  env: { ...legacyPublisherEnv, [LEGACY_GITHUB_PUBLISHER_FLAG]: "true" },
  warn: (message) => legacyWarnings.push(message),
});
enabledLegacyPublisher.findOpenPullRequest = async () => ({ html_url: "https://example.invalid/pr/1" });
assert.equal(
  await enabledLegacyPublisher.publishPost({ postContent: "---\n---", slug: "teste" }),
  "https://example.invalid/pr/1",
);
assert.equal(legacyWarnings.length, 1, "uso legado explícito deve deixar aviso auditável");
const groundedPayload = {
  candidates: [{ content: { parts: [{ text: JSON.stringify({ confirmed_facts: [{ fact: 'Carbono HMF', evidence_quote: 'Quadro construído integralmente em carbono HMF para competição', source_ids: ['src-scott'] }], limitations: [], sources: [{ id: 'src-scott', name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessed: '2026-08-04' }] }) }] }, groundingMetadata: { webSearchQueries: ['site:scott-sports.com teste'] } }]
};
const groqPayload = { choices: [{ message: { content: groundedPayload.candidates[0].content.parts[0].text } }] };
const verifiedSourceResponse = async (url) => ({
  ok: true,
  status: 200,
  url,
  headers: { get: (name) => name === 'content-type' ? 'text/html; charset=utf-8' : null },
  arrayBuffer: async () => new TextEncoder().encode('<html>Quadro construído integralmente em carbono HMF para competição. Regra oficial confirmada. Suspensão com 120 mm.</html>').buffer,
});
let groundedRequest;
const researcher = new GroundedResearcher({ GROQ_API_KEY: 'test' }, async (_url, init) => {
  groundedRequest = JSON.parse(init.body);
  return { ok: true, json: async () => groqPayload };
}, verifiedSourceResponse);
const grounded = await researcher.research({ item: { ...campaign.items[0], category: 'componentes', productIds: [], heroImage: { mode: 'conceptual' }, freshness: 'revalidate-24h' }, internalEvidence: [], today: '2026-08-04' });
assert.equal(grounded.status, 'pesquisa_concluida');
assert.equal(grounded.sources.length, 1);
assert.equal(grounded.portfolio_evidence_url, 'https://thebikershop.com.br/componentes/');
assert.equal(grounded.portfolio_verified_at, '2026-08-04');
assert.equal(groundedRequest.model, 'groq/compound-mini');
assert.deepEqual(groundedRequest.compound_custom.tools.enabled_tools, ['web_search', 'visit_website']);
const exhaustedProvidersResearcher = new GroundedResearcher({
  GROQ_API_KEY: 'test', AI_HTTP_RETRY_ATTEMPTS: '1', CAMPAIGN_CURATED_OFFLINE_FALLBACK: 'false',
}, async (_url, init) => init.headers.Authorization
  ? ({ ok: true, json: async () => groqPayload })
  : ({ ok: false, status: 429, text: async () => 'quota' }), (() => {
    let sourceCalls = 0;
    return async (url) => {
      sourceCalls += 1;
      if (sourceCalls === 1) return {
        ok: true, status: 200, url,
        headers: { get: (name) => name === 'content-type' ? 'text/html' : null },
        arrayBuffer: async () => new TextEncoder().encode('<html>Página sem o trecho alegado.</html>').buffer,
      };
      return verifiedSourceResponse(url);
    };
  })());
const exhaustedProvidersFallback = await exhaustedProvidersResearcher.research({
  item: campaign.items[0],
  internalEvidence: [{ id: 'spark', facts: { suspension: '120 mm' }, sources: [{ name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessedAt: '2026-08-04' }] }],
  today: '2026-08-04',
});
assert.equal(exhaustedProvidersFallback.grounding.fallback, 'internal-product-knowledge');
assert.equal(exhaustedProvidersFallback.grounding.evidenceContract, 'retrieved-excerpt-v1');
const fabricatedSourceResearcher = new GroundedResearcher(
  { GROQ_API_KEY: 'test', CAMPAIGN_CURATED_OFFLINE_FALLBACK: 'false' },
  async () => ({ ok: true, json: async () => groqPayload }),
  async (url) => ({
    ok: false,
    status: 404,
    url,
    headers: { get: () => null },
    arrayBuffer: async () => new ArrayBuffer(0),
  }),
);
await assert.rejects(
  fabricatedSourceResearcher.research({ item: campaign.items[0], internalEvidence: [], today: '2026-08-04' }),
  /Fallback interno bloqueado|sem fontes rastreáveis/,
);
const escapedRedirectResearcher = new GroundedResearcher(
  { GROQ_API_KEY: 'test' },
  async () => ({ ok: true, json: async () => groqPayload }),
  async () => ({
    ok: false,
    status: 302,
    headers: { get: (name) => name === 'location' ? 'https://example.com/fonte-injetada' : null },
  }),
);
await assert.rejects(
  escapedRedirectResearcher.research({ item: campaign.items[0], internalEvidence: [], today: '2026-08-04' }),
  /Fallback interno bloqueado|sem fontes rastreáveis/,
);
const unrelatedPageResearcher = new GroundedResearcher(
  { GROQ_API_KEY: 'test' },
  async () => ({ ok: true, json: async () => groqPayload }),
  async (url) => ({
    ok: true,
    status: 200,
    url,
    headers: { get: (name) => name === 'content-type' ? 'text/html' : null },
    arrayBuffer: async () => new TextEncoder().encode('<html>Página real, porém sem a evidência alegada.</html>').buffer,
  }),
);
await assert.rejects(
  unrelatedPageResearcher.research({ item: campaign.items[0], internalEvidence: [], today: '2026-08-04' }),
  /Fallback interno bloqueado|sem fontes rastreáveis/,
);
const orphanedSourcePayload = {
  choices: [{ message: { content: JSON.stringify({
    confirmed_facts: [{ fact: 'Carbono HMF', source_ids: ['fonte-ausente'] }],
    limitations: [],
    sources: [{ id: 'src-scott', name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessed: '2026-08-04' }],
  }) } }],
};
const orphanedSourceResearcher = new GroundedResearcher({ GROQ_API_KEY: 'test' }, async () => ({
  ok: true,
  json: async () => orphanedSourcePayload,
}), verifiedSourceResponse);
const orphanedSourceFallback = await orphanedSourceResearcher.research({
  item: campaign.items[0],
  internalEvidence: [{ id: 'spark', facts: { suspension: '120 mm' }, sources: [{ name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessedAt: '2026-08-04' }] }],
  today: '2026-08-05',
});
assert.equal(orphanedSourceFallback.grounding.fallback, 'internal-product-knowledge');
const fallbackResearcher = new GroundedResearcher({ GROQ_API_KEY: 'test', AI_HTTP_RETRY_ATTEMPTS: '1', CAMPAIGN_CURATED_OFFLINE_FALLBACK: 'false' }, async () => ({ ok: false, status: 429, text: async () => 'quota' }), verifiedSourceResponse);
const fallbackGrounded = await fallbackResearcher.research({
  item: campaign.items[0],
  internalEvidence: [{ id: 'spark', facts: { suspension: '120 mm' }, sources: [{ name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessedAt: '2026-08-04' }] }],
  today: '2026-08-05',
});
assert.equal(fallbackGrounded.grounding.fallback, 'internal-product-knowledge');
assert.equal(fallbackGrounded.grounding.evidenceContract, 'retrieved-excerpt-v1');
assert.match(fallbackGrounded.confirmed_facts[0].evidence_quote, /suspensao com 120 mm/i);
await assert.rejects(fallbackResearcher.research({
  item: {
    id: 'reserva-inspecao-pos-chuva',
    title: 'Inspeção da bicicleta após pedalar na chuva',
    summary: 'Procedimento técnico pós-pedal molhado.',
    category: 'manutencao-ajustes',
  },
  internalEvidence: [],
  today: '2026-08-05',
}), /sem fatos explicitamente fundamentados|sem fontes rastreáveis/);
const curatedOfflineResearcher = new GroundedResearcher({ GROQ_API_KEY: 'test', AI_HTTP_RETRY_ATTEMPTS: '1' }, async () => ({ ok: false, status: 429, text: async () => 'quota' }), async (url) => ({
  ok: true,
  status: 200,
  url,
  headers: { get: (name) => name === 'content-type' ? 'text/html' : null },
  arrayBuffer: async () => new TextEncoder().encode('<html>PÃ¡gina oficial indisponÃ­vel no runner.</html>').buffer,
}));
const curatedOffline = await curatedOfflineResearcher.research({
  item: {
    id: 'reserva-inspecao-pos-chuva',
    title: 'InspeÃ§Ã£o da bicicleta apÃ³s pedalar na chuva',
    summary: 'Procedimento tÃ©cnico pÃ³s-pedal molhado.',
    category: 'manutencao-ajustes',
  },
  internalEvidence: [],
  today: '2026-08-05',
});
assert.equal(curatedOffline.grounding.fallback, 'curated-official-offline-cache-v1');
assert.equal(curatedOffline.grounding.evidenceContract, 'curated-official-excerpt-v1');
assert.equal(curatedOffline.grounding.verificationMode, 'curated-offline-cache');
assert.ok(curatedOffline.confirmed_facts.length >= 3);
assertResearchEvidenceContract(curatedOffline);
let malformedJsonCalls = 0;
const malformedJsonResearcher = new GroundedResearcher({
  GROQ_API_KEY: 'test',
  AI_HTTP_RETRY_ATTEMPTS: '1',
  CAMPAIGN_CURATED_OFFLINE_FALLBACK: 'false',
}, async (_url, init) => {
  malformedJsonCalls += 1;
  return { ok: true, json: async () => ({ choices: [{ message: { content: '{"confirmed_facts":[' } }] }) };
}, verifiedSourceResponse);
await assert.rejects(
  malformedJsonResearcher.research({ item: campaign.items[0], internalEvidence: [], today: '2026-08-05' }),
  /nenhuma fonte oficial permitida/,
);
assert.equal(malformedJsonCalls, 1);
const contextLengthDetail = JSON.stringify({ error: { code: 'context_length_exceeded', message: 'Please reduce the length of the messages or completion.' } });
const contextLengthResearcher = new GroundedResearcher({ GROQ_API_KEY: 'test' }, async () => ({
  ok: false,
  status: 400,
  clone: () => ({ text: async () => contextLengthDetail }),
  text: async () => contextLengthDetail,
}), verifiedSourceResponse);
const contextLengthFallback = await contextLengthResearcher.research({
  item: campaign.items[0],
  internalEvidence: [{ id: 'spark', facts: { suspension: '120 mm' }, sources: [{ name: 'Scott', type: 'manufacturer', url: 'https://www.scott-sports.com/global/en/product/test', accessedAt: '2026-08-04' }] }],
  today: '2026-08-05',
});
assert.equal(contextLengthFallback.grounding.fallback, 'internal-product-knowledge');
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
}, verifiedSourceResponse);
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
}, verifiedSourceResponse);
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
await fs.mkdir(path.join(finalizeRoot, "content/research/campaign"), { recursive: true });
const testProduct = { id: "scott-spark-test", name: "Scott Spark Test", brand: "Scott", productUrl: "https://thebikershop.com.br/produtos/scott-spark-test/", images: ["https://thebikershop.com.br/test.webp"] };
await fs.writeFile(path.join(finalizeRoot, "content/product-discovery/thebiker-media-catalog.json"), JSON.stringify({ products: [testProduct] }));
const finalizeCampaign = structuredClone(campaign);
finalizeCampaign.items[0].status = "validation";
finalizeCampaign.items[0].productIds = [testProduct.id];
finalizeCampaign.items[0].heroImage = { mode: "real-context", productId: testProduct.id, relationship: "platform-example", rationale: "Produto real usado como plataforma visual do teste deterministico de finalizacao." };
finalizeCampaign.items[0].aiReview.finalScore = 95;
finalizeCampaign.items[0].aiReview.finalBlockers = 0;
delete finalizeCampaign.items[0].aiReview.deterministicFullArticleFallbackUsed;
delete finalizeCampaign.items[0].aiReview.deterministicFullArticleFallbackTrigger;
finalizeCampaign.items[0].postPath = `_posts/drafts/${finalizeCampaign.items[0].publishDate}-${finalizeCampaign.items[0].id}.md`;
await fs.writeFile(path.join(finalizeRoot, "bot/editorial-campaign.json"), JSON.stringify(finalizeCampaign));
await fs.writeFile(path.join(finalizeRoot, "content/research/campaign", `${finalizeCampaign.items[0].id}.json`), JSON.stringify({
  slug: finalizeCampaign.items[0].id,
  title: finalizeCampaign.items[0].title,
  content_type: "guia-tecnico",
  review_method: "desk-research",
  tested_by_thebikerblog: false,
  market: "Brasil",
  generated_at: "2026-08-05",
  status: "pesquisa_concluida",
  confirmed_facts: [{ fact: "Conteúdo técnico sustentado por fonte oficial.", evidence_quote: "Conteúdo técnico sustentado por fonte oficial", source_ids: ["src-scott"] }],
  limitations: [],
  sources: [{ id: "src-scott", name: "Scott", type: "manufacturer", url: "https://www.scott-sports.com/", accessed: "2026-08-05" }],
  grounding: { sourceCount: 1, claimContract: "explicit-units-v1", evidenceContract: "retrieved-excerpt-v1", verifiedAt: `${finalizeCampaign.items[0].publishDate}T08:00:00.000Z` },
}));
const sections = Array.from({ length: 5 }, (_, index) => `## Seção técnica ${index + 1}\n\nConteúdo técnico sustentado pelas fontes editoriais.`).join("\n\n");
await fs.writeFile(path.join(finalizeRoot, finalizeCampaign.items[0].postPath), `---\nlayout: post\npublished: false\ndate: 2026-08-04\nlast_modified_at: 2026-08-04\ndirect_answer: "Este guia apresenta um diagnóstico técnico verificável, baseado nas fontes declaradas, para orientar ajustes sem transformar hipótese em constatação."\nimage: "/assets/img/system/covers/guia-tecnico-v2/hero-1600.webp"\nimage_mobile: "/assets/img/system/covers/guia-tecnico-v2/hero-800.webp"\nthumbnail: "/assets/img/system/covers/guia-tecnico-v2/card-640.webp"\nimage_asset_type: "system-fallback"\nimage_status: "draft"\nimage_alt: "Capa"\nimage_caption: "Capa"\nimage_credit: "TheBiker"\nimage_license: "Interno"\nreviewed_by: ""\neditorial_status: "draft"\nstatus: "draft"\nsources:\n  - name: "Scott"\n    url: "https://www.scott-sports.com/"\n---\n\n${sections}\n`);
finalizeCampaign.items[0].aiReview.contentHash = hashEditorialText(await fs.readFile(path.join(finalizeRoot, finalizeCampaign.items[0].postPath), "utf8"));
await fs.writeFile(path.join(finalizeRoot, "bot/editorial-campaign.json"), JSON.stringify(finalizeCampaign));
const originalDraft = await fs.readFile(path.join(finalizeRoot, finalizeCampaign.items[0].postPath), "utf8");
await assert.rejects(finalizeCampaignItem({
  root: finalizeRoot,
  now: new Date("2026-08-05T09:00:00Z"),
  imageProducer: async ({ root: stagedRoot, item }) => {
    const stagedImage = path.join(stagedRoot, "assets/img/posts", item.id);
    await fs.mkdir(stagedImage, { recursive: true });
    await fs.writeFile(path.join(stagedImage, "partial.txt"), "não promover");
    throw new Error("falha visual induzida");
  },
}), /falha visual induzida/);
assert.equal(await fs.readFile(path.join(finalizeRoot, finalizeCampaign.items[0].postPath), "utf8"), originalDraft,
  "uma falha não pode alterar o rascunho original");
await assert.rejects(fs.stat(path.join(finalizeRoot, "assets/img/posts", finalizeCampaign.items[0].id)), /ENOENT/);
const safelyBlocked = JSON.parse(await fs.readFile(path.join(finalizeRoot, "bot/editorial-campaign.json"), "utf8"));
assert.equal(safelyBlocked.items[0].status, "blocked");
assert.equal(safelyBlocked.items[0].postPath, finalizeCampaign.items[0].postPath);
assert.ok(safelyBlocked.items[0].aiReview, "o insumo revisado deve permanecer disponível para recuperação");
await fs.writeFile(path.join(finalizeRoot, "bot/editorial-campaign.json"), JSON.stringify(finalizeCampaign));
const finalized = await finalizeCampaignItem({
  root: finalizeRoot,
  now: new Date("2026-08-05T10:00:00Z"),
  imageProducer: async (options) => {
    const cover = await produceCampaignCover(options);
    cover.manifest = {
      ...cover.manifest,
      assetType: "official-product-photo",
      factualSubject: "exact-product",
      editorialUse: "publishable",
      aiGenerated: false,
      assetId: "thebiker-scott-spark-test-12345678",
      sha256: "a".repeat(64),
      matchedProduct: { id: testProduct.id, name: testProduct.name, sku: null, matchLevel: "exact-id" },
      depictedBrands: ["Scott"],
      depictedProducts: [testProduct.name],
      qualityTier: "standard",
      source: { ...cover.manifest.source, type: "thebiker", url: testProduct.productUrl, rightsPolicyId: "thebiker-official-editorial-v1", licenseEvidence: "catalogo oficial" },
      approval: { reviewedBy: "gate", approvedAt: "2026-08-05", method: "automated-editorial-gate", checks: ["sem-concorrente"] },
    };
    await fs.writeFile(path.join(cover.directory, "image-manifest.json"), JSON.stringify(cover.manifest));
    return cover;
  },
});
assert.equal(finalized.status, "scheduled");
const finalizedCampaign = JSON.parse(await fs.readFile(path.join(finalizeRoot, "bot/editorial-campaign.json"), "utf8"));
assert.equal(finalizedCampaign.items[0].status, "scheduled");
const finalizedContent = await fs.readFile(path.join(finalizeRoot, finalizedCampaign.items[0].postPath), "utf8");
assert.equal(assertScheduledReceipt(finalizedContent, finalizedCampaign.items[0]), finalizedCampaign.items[0].editorialReceipt.scheduledContentHash);
assert.throws(() => assertScheduledReceipt(`${finalizedContent}\nalterado`, finalizedCampaign.items[0]), /Hash do artefato agendado divergente/);
assert.ok(await fs.stat(path.join(finalizeRoot, finalizedCampaign.items[0].imageManifestPath)));
const publicationNow = new Date(`${finalizedCampaign.items[0].publishDate}T15:00:00.000Z`);
const publishedTarget = path.join(finalizeRoot, "_posts", `${finalizedCampaign.items[0].publishDate}-${finalizedCampaign.items[0].id}.md`);
await assert.rejects(publishScheduled({
  root: finalizeRoot,
  now: publicationNow,
  expectedItemId: "outro-candidato",
}), /alvo esperado outro-candidato/);
await assert.rejects(publishScheduled({
  root: finalizeRoot,
  now: publicationNow,
  beforePromote: ({ index }) => { if (index === 1) throw new Error("falha induzida na promoção da publicação"); },
}), /falha induzida/);
assert.equal(await fs.readFile(path.join(finalizeRoot, finalizedCampaign.items[0].postPath), "utf8"), finalizedContent,
  "rollback da publicação precisa preservar o rascunho agendado");
await assert.rejects(fs.stat(publishedTarget), /ENOENT/);
assert.equal(JSON.parse(await fs.readFile(path.join(finalizeRoot, "bot/editorial-campaign.json"), "utf8")).items[0].status, "scheduled");
const published = await publishScheduled({ root: finalizeRoot, now: publicationNow });
assert.equal(published.status, "published");
assert.ok(await fs.stat(publishedTarget));
const publishedContent = await fs.readFile(publishedTarget, "utf8");
assert.match(publishedContent, new RegExp(`^last_modified_at: ${finalizedCampaign.items[0].publishDate}$`, "m"),
  "a promoção deve registrar a data real da publicação para permanecer válida no gate SEO");
assert.match(publishedContent, /^promoted_brands: \["Scott"\]$/m,
  "rascunho legado deve herdar uma marca válida do manifesto visual aprovado");
await assert.rejects(fs.stat(path.join(finalizeRoot, finalizedCampaign.items[0].postPath)), /ENOENT/);
assert.equal((await publishScheduled({ root: finalizeRoot, now: publicationNow })).status, "already-published",
  "repetir a mesma publicação deve ser idempotente");
const legacyReceiptCampaignPath = path.join(finalizeRoot, "bot/editorial-campaign.json");
const legacyReceiptCampaign = JSON.parse(await fs.readFile(legacyReceiptCampaignPath, "utf8"));
delete legacyReceiptCampaign.items[0].editorialReceipt;
await fs.writeFile(legacyReceiptCampaignPath, `${JSON.stringify(legacyReceiptCampaign, null, 2)}\n`);
const legacyReceiptAudit = await auditEditorialReceipts({
  root: finalizeRoot,
  itemIds: [legacyReceiptCampaign.items[0].id],
});
assert.deepEqual(legacyReceiptAudit.publishedMissing.map((entry) => entry.id), [legacyReceiptCampaign.items[0].id]);
assert.equal(legacyReceiptAudit.changed, 0, "auditoria não deve fabricar recibo histórico sem reconhecimento explícito");
assert.doesNotThrow(
  () => assertReceiptAuditPolicy(legacyReceiptAudit),
  "published sem baseline permanece uma migração explícita no check padrão",
);
assert.throws(
  () => assertReceiptAuditPolicy(legacyReceiptAudit, { strictPublished: true }),
  /published sem recibo auditável/,
);
const legacyReceiptBackfill = await auditEditorialReceipts({
  root: finalizeRoot,
  acknowledgePublishedBaseline: true,
  itemIds: [legacyReceiptCampaign.items[0].id],
});
assert.equal(legacyReceiptBackfill.changed, 1);
const backfilledCampaign = JSON.parse(await fs.readFile(legacyReceiptCampaignPath, "utf8"));
assert.equal(backfilledCampaign.items[0].editorialReceipt.origin, "legacy-backfill");
assert.equal(backfilledCampaign.items[0].editorialReceipt.publishedContentHash, hashEditorialText(publishedContent));
await fs.appendFile(publishedTarget, "\nmutação posterior ao recibo\n");
const divergentReceiptAudit = await auditEditorialReceipts({
  root: finalizeRoot,
  itemIds: [legacyReceiptCampaign.items[0].id],
});
assert.deepEqual(divergentReceiptAudit.publishedDivergent.map((entry) => entry.id), [legacyReceiptCampaign.items[0].id]);
assert.throws(
  () => assertReceiptAuditPolicy(divergentReceiptAudit),
  /published com recibo divergente/,
  "divergência publicada deve falhar inclusive no check padrão",
);

const cleanupRoot = path.join(root, "cleanup-finalization");
const cleanupItem = {
  id: "candidate-with-failed-image",
  postPath: "_posts/drafts/2026-08-22-candidate-with-failed-image.md",
  aiReview: { finalScore: 95 },
  editorialReceipt: { schemaVersion: 1 },
  visualDecision: { schemaVersion: 1 },
  imageManifestPath: "assets/img/posts/candidate-with-failed-image/image-manifest.json",
  imageStatus: "candidate",
  imageValidatedAt: "2026-08-12T12:00:00.000Z",
  imageAssetIds: ["failed-asset"],
};
await fs.mkdir(path.join(cleanupRoot, "_posts/drafts"), { recursive: true });
await fs.mkdir(path.join(cleanupRoot, "content/research/campaign"), { recursive: true });
await fs.mkdir(path.join(cleanupRoot, "assets/img/posts", cleanupItem.id), { recursive: true });
await fs.mkdir(path.join(cleanupRoot, "content/image-library"), { recursive: true });
await fs.writeFile(path.join(cleanupRoot, cleanupItem.postPath), "rascunho");
await fs.writeFile(path.join(cleanupRoot, "content/research/campaign", `${cleanupItem.id}.json`), "{}");
await fs.writeFile(path.join(cleanupRoot, "assets/img/posts", cleanupItem.id, "image-manifest.json"), "{}");
await fs.writeFile(path.join(cleanupRoot, "content/image-library/index.json"), JSON.stringify({
  schemaVersion: 1,
  updatedAt: "2026-08-12T12:00:00.000Z",
  assets: [{ assetId: "failed-asset", uses: [{ postId: cleanupItem.id, position: "hero" }] }],
}));
await cleanupFailedFinalization(cleanupRoot, cleanupItem);
await assert.rejects(fs.stat(path.join(cleanupRoot, "_posts/drafts/2026-08-22-candidate-with-failed-image.md")), /ENOENT/);
await assert.rejects(fs.stat(path.join(cleanupRoot, "content/research/campaign", `${cleanupItem.id}.json`)), /ENOENT/);
await assert.rejects(fs.stat(path.join(cleanupRoot, "assets/img/posts", cleanupItem.id)), /ENOENT/);
assert.equal(cleanupItem.postPath, undefined);
assert.equal(cleanupItem.aiReview, undefined);
assert.deepEqual(cleanupItem.imageAssetIds, []);
const cleanedLibrary = JSON.parse(await fs.readFile(path.join(cleanupRoot, "content/image-library/index.json"), "utf8"));
assert.deepEqual(cleanedLibrary.assets, []);
await fs.rm(root, { recursive: true, force: true });
console.log("Automation queue tests passed.");
