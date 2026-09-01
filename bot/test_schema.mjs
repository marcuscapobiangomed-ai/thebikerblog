#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateArticle } from "./src/schemas/article.schema.js";
import { validateResearch } from "./src/schemas/research.schema.js";
import { generateMarkdown } from "./src/generator.js";
import { buildProductKnowledgeRecord } from "./src/knowledge/product-knowledge.js";
import { extractPortfolioBikeUrls, productFromJsonLd } from "../scripts/discover-thebiker-catalog.js";
import { assertResearchGrounding, researchGroundingErrors } from "./src/validation/research-grounding.js";
import { articleResearchGroundingErrors, sanitizeStructuredArticleClaims } from "./src/validation/article-research-grounding.js";
import { buildRepairPrompt } from "./src/editorial-prompt.js";
import { buildDeterministicGroundedArticle } from "./src/automation/deterministic-article.js";
import { assertEditorialPublicationGates } from "./src/validation/editorial-publication-gates.js";

const validArticle = {
  title: "Comparativo de bikes endurance e race em 2026",
  description:
    "Uma análise editorial de mais de cem caracteres sobre diferenças de geometria, peso, custo e perfil de uso entre bikes endurance e race.",
  direct_answer:
    "Bikes endurance priorizam estabilidade e tolerância em percursos longos; bikes race usam uma posição mais agressiva e respostas mais rápidas para ritmo competitivo.",
  faq: [
    {
      question: "Qual é a diferença principal entre uma bike endurance e uma race?",
      answer: "A diferença central está na posição, estabilidade e resposta da geometria, que devem ser avaliadas junto do terreno e do objetivo do ciclista.",
    },
  ],
  slug: "comparativo-bikes-endurance-race-2026",
  category: "comparativos",
  content_type: "comparativo",
  review_method: "desk-research",
  tested_by_thebikerblog: false,
  methodologyNotice:
    "Análise documental baseada em especificações oficiais e pesquisa de mercado. O produto não foi testado presencialmente pela equipe.",
  brand: "Scott",
  product_name: "Addict RC 20",
  model_year: 2026,
  market: "Brasil",
  weight: "8.8 kg",
  weight_source: "Fabricante",
  price_min: 21990,
  price_max: 24990,
  price_currency: "BRL",
  price_checked_at: "2026-07-22",
  affiliate_links: false,
  editorial_scope: "portfolio",
  promoted_brands: ["Scott"],
  context_only_brands: [],
  portfolio_evidence_url: "https://www.thebiker.com.br/bikes/estrada/",
  portfolio_verified_at: "2026-08-04",
  tags: ["ciclismo", "comparativo", "dados"],
  sources: [
    {
      name: "Scott Brasil",
      type: "manufacturer",
      url: "https://example.com",
      accessed_at: "2026-07-22",
    },
  ],
  sections: [
    { heading: "A geometria muda antes de a estrada inclinar", content: "Conteúdo de contexto." },
    { heading: "Quem ganha mais com cada configuração", content: "Conteúdo de decisão." },
  ],
  imagePlan: [
    {
      position: "hero",
      purpose: "Imagem de destaque para o comparativo editorial",
      assetType: "ai-editorial-concept",
      editorialUse: "draft-only",
      factualSubject: "conceptual",
      brief: "Composição editorial conceitual que represente a diferença entre geometrias sem marcas.",
      sourceRequired: false,
      avoid: ["logotipos", "produto específico"],
      aspectRatio: "16:9",
      altSuggestion: "Comparativo entre bikes endurance e race",
      allowedSource: "ai-generated",
      aiGeneratedAllowed: true,
    },
  ],
  claimsRequiringReview: [],
  frontmatter: {
    author: "Equipe TheBiker",
    image: "/assets/img/logo.svg",
    image_alt: "Logo TheBiker",
    image_caption: "Comparativo editorial",
    image_credit: "TheBiker",
    image_license: "Uso editorial da TheBiker",
  },
};

const validResearch = {
  topic: "Comparativo endurance vs race",
  contentType: "comparativo",
  reviewMethod: "desk-research",
  testedByTheBikerBlog: false,
  market: "Brasil",
  product: {
    brand: "Scott",
    name: "Addict RC 20",
    modelYear: 2026,
  },
  specifications: {
    weight: { value: "8.8 kg", status: "confirmed" },
  },
  prices: [
    {
      store: "Loja oficial",
      price: 21990,
      currency: "BRL",
      checkedAt: "2026-07-22",
      url: "https://example.com",
    },
  ],
  sources: [
    {
      id: "src-1",
      name: "Scott Brasil",
      type: "manufacturer",
      url: "https://example.com",
      accessedAt: "2026-07-22",
    },
  ],
  affiliateLinks: false,
};

assert.doesNotThrow(() => validateArticle(validArticle));
const generatedMarkdown = generateMarkdown(validArticle);
assert.match(generatedMarkdown, /editorial_scope: "portfolio"/);
assert.match(generatedMarkdown, /published: false/);
assert.match(generatedMarkdown, /promoted_brands: \["Scott"\]/);
assert.match(generatedMarkdown, /portfolio_evidence_url: "https:\/\/www\.thebiker\.com\.br\/bikes\/estrada\/"/);
assert.match(generatedMarkdown, /direct_answer:/);
assert.match(generatedMarkdown, /faq:/);
assert.match(generatedMarkdown, /## Fontes/);
assert.doesNotMatch(generatedMarkdown, /Como este artigo foi produzido|Análise documental baseada em especificações/);

const v2Article = {
  ...validArticle,
  editorial_format: "full-article-v2",
  sources: [{ ...validArticle.sources[0], id: "src-1" }],
  sections: Array.from({ length: 5 }, (_, index) => ({
    heading: `Critério técnico ${index + 1}`,
    target_question: `Qual decisão o critério técnico ${index + 1} ajuda a tomar?`,
    content: `A seção ${index + 1} registra o fato com contexto suficiente para uma decisão editorial.`,
    claims: [{
      statement: `A especificação documental do critério ${index + 1} está registrada na fonte.`,
      source_ids: ["src-1"],
      evidence_quote: "Trecho literal da fonte oficial consultada.",
      confidence: "high",
    }],
    internal_links: index === 0 ? [{
      url: "/guias/exemplo/",
      anchor: "guia técnico relacionado",
      reason: "Aprofunda a decisão descrita nesta seção.",
    }] : [],
  })),
};
assert.doesNotThrow(() => validateArticle(v2Article));
assert.doesNotThrow(() => assertEditorialPublicationGates(v2Article, { AI_MIN_ARTICLE_WORDS: "1" }));
const v2Markdown = generateMarkdown(v2Article);
assert.match(v2Markdown, /id: "src-1"/);
assert.match(v2Markdown, /section-evidence/);
assert.match(v2Markdown, /guias\/exemplo/);
assert.throws(
  () => validateArticle({
    ...validArticle,
    sections: [
      { heading: "Introdução", content: "Abertura genérica." },
      { heading: "Conclusão", content: "Fechamento genérico." },
    ],
  }),
  /intertítulo específico e atraente/i,
);
assert.throws(
  () => validateArticle({
    ...validArticle,
    brand: "Marca Concorrente",
    promoted_brands: ["Marca Concorrente"],
  }),
  /promoção bloqueada para marca fora do portfólio/i,
);
assert.throws(
  () => validateArticle({
    ...validArticle,
    portfolio_evidence_url: "https://concorrente.example/produto",
  }),
  /site oficial da TheBiker/i,
);
assert.throws(
  () => validateArticle({
    ...validArticle,
    content_type: "review",
    brand: "",
    product_name: "",
    model_year: undefined,
  }),
  /Identidade exata do produto é obrigatória/i,
);
assert.doesNotThrow(() => validateResearch(validResearch));
const groundedEditorialResearch = {
  slug: "grounded-test",
  title: "Pesquisa técnica rastreável",
  content_type: "guia-tecnico",
  review_method: "desk-research",
  tested_by_thebikerblog: false,
  market: "Brasil",
  generated_at: "2026-08-13",
  status: "pesquisa_concluida",
  sources: [{ id: "src-1", name: "Fonte oficial", type: "official-website", url: "https://example.com/oficial", accessed: "2026-08-13" }],
  confirmed_facts: [{ fact: "Fato confirmado.", source_ids: ["src-1"] }],
  grounding: { sourceCount: 1, provider: "test-web-search" },
};
assert.doesNotThrow(() => assertResearchGrounding(groundedEditorialResearch, { requireFactReferences: true }));

const curatedMaintenanceResearch = {
  title: "Como limpar a transmissão depois de chuva e lama",
  market: "Brasil",
  confirmed_facts: [
    { fact: "drivetrainCleaning: use o limpador recomendado pelo fabricante e seque a corrente depois da limpeza." },
    { fact: "pressureWashing: jatos de alta pressão podem danificar componentes e vedações." },
    { fact: "brakeInspection: inspecione pastilhas, rotores, comando e vazamentos antes de voltar a pedalar." },
    { fact: "wetBraking: a distância de frenagem aumenta em piso molhado." },
    { fact: "escalation: procure uma oficina quando houver dano, vazamento ou funcionamento irregular." },
  ],
  sources: [
    { name: "SRAM Support", type: "official-website", url: "https://support.sram.com/hc/en-us/articles/", accessed_at: "2026-08-13" },
    { name: "Shimano Manuals", type: "official-website", url: "https://si.shimano.com/", accessed_at: "2026-08-13" },
  ],
  portfolio_evidence_url: "https://thebikershop.com.br/componentes/",
  portfolio_verified_at: "2026-08-13",
  grounding: { fallback: "curated-official-offline-cache-v1" },
};
assert.throws(() => buildDeterministicGroundedArticle({
  topic: curatedMaintenanceResearch.title,
  researchData: curatedMaintenanceResearch,
  contentType: "guia-tecnico",
  today: "2026-08-13",
}), /Fallback determinístico integral desativado/);
const genericCachedResearch = {
  ...curatedMaintenanceResearch,
  title: "Scott Spark RC Expert 2027: ficha tecnica",
  content_type: "review",
  confirmed_facts: [
    { fact: "frame.material: Spark RC HMF Carbon Gen5" },
    { fact: "suspension.frontTravel: 120 mm" },
    { fact: "suspension.rearTravel: 120 mm" },
    { fact: "drivetrain.speeds: 12 velocidades" },
    { fact: "drivetrain.shifting: wireless electronic" },
  ],
  sources: [{ name: "Scott Sports", type: "manufacturer", url: "https://www.scott-sports.com/global/en/product/scott-spark-rc-expert-bike", accessed_at: "2026-08-13" }],
};
assert.throws(
  () => buildDeterministicGroundedArticle({
    topic: genericCachedResearch.title,
    researchData: genericCachedResearch,
    contentType: "review",
    today: "2026-08-13",
  }),
  /Fallback determinístico integral desativado/,
);

assert.throws(() => assertResearchGrounding({
    ...groundedEditorialResearch,
    confirmed_facts: [{ fact: "Fato órfão.", source_ids: ["src-inexistente"] }],
  }, { requireFactReferences: true }), /fonte inexistente: src-inexistente/);
assert.deepEqual(researchGroundingErrors({
  ...groundedEditorialResearch,
  grounding: { ...groundedEditorialResearch.grounding, sourceCount: 2 },
}), ["grounding.sourceCount=2 diverge de sources.length=1"]);
assert.deepEqual(researchGroundingErrors({
  ...groundedEditorialResearch,
  confirmed_facts: [],
}, { requireFactReferences: true }), ["pesquisa sem fatos explicitamente fundamentados"]);
assert.deepEqual(articleResearchGroundingErrors({
  content: "A lei limita a assistência a 25 km/h e recomenda revisão a cada 1000 km.",
  research: {
    confirmed_facts: [{ fact: "A bateria foi testada a 25 km/h.", source_ids: ["src-shimano"] }],
    sources: [{ id: "src-shimano", url: "https://bike.shimano.com/steps" }],
  },
}), [
  "alegações numéricas ausentes dos fatos confirmados: 1000km",
  "alegações legais exigem fonte governamental oficial",
  "alegações legais numéricas sem suporte governamental: 25km/h, 1000km",
]);
assert.deepEqual(articleResearchGroundingErrors({
  content: "A legislação limita a assistência a 25 km/h e exige revisão em seis meses.",
  research: {
    confirmed_facts: [
      { fact: "O fabricante mede autonomia a 25 km/h.", source_ids: ["src-shimano"] },
      { fact: "O CONTRAN admite propulsão auxiliar até 32 km/h e 1000 W.", source_ids: ["src-contran"] },
    ],
    sources: [
      { id: "src-shimano", url: "https://bike.shimano.com/steps" },
      { id: "src-contran", url: "https://www.gov.br/transportes/resolucao-996.pdf" },
    ],
  },
}), [
  "alegações numéricas ausentes dos fatos confirmados: seismeses",
  "alegações legais numéricas sem suporte governamental: 25km/h, seismeses",
]);
assert.deepEqual(articleResearchGroundingErrors({
  content: "A Resolução CONTRAN limita a propulsão auxiliar a 32 km/h e 1000 W.",
  research: {
    confirmed_facts: [{ fact: "A propulsão auxiliar é limitada a 32 km/h e 1000 W.", source_ids: ["src-contran"] }],
    sources: [{ id: "src-contran", url: "https://www.gov.br/transportes/resolucao-996.pdf" }],
  },
}), []);
const groundedRepairPrompt = buildRepairPrompt({
  topic: "Bicicletas elétricas",
  rawText: '{"sections":[]}',
  validationError: "alegações numéricas ausentes: 90rpm",
  contentType: "guia-tecnico",
  template: { label: "Guia técnico" },
  today: "2026-08-13",
  researchData: {
    confirmed_facts: [{ fact: "A propulsão auxiliar é limitada a 32 km/h.", source_ids: ["src-gov"] }],
    sources: [{ id: "src-gov", url: "https://www.gov.br/transportes/resolucao.pdf" }],
  },
});
assert.match(groundedRepairPrompt, /32 km\/h/);
assert.match(groundedRepairPrompt, /remova a frase quando não houver fato confirmado equivalente/);
const sanitizedClaims = sanitizeStructuredArticleClaims({
  description: "Guia técnico de bicicletas elétricas.",
  direct_answer: "A revisão ocorre em seis meses. A assistência legal chega a 32 km/h.",
  methodologyNotice: "Análise documental.",
  faq: [],
  sections: [{ heading: "Manutenção", content: "Revise em seis meses. Confirme sempre o manual do fabricante." }],
}, {
  confirmed_facts: [{ fact: "O CONTRAN admite propulsão auxiliar até 32 km/h.", source_ids: ["src-gov"] }],
  sources: [{ id: "src-gov", url: "https://www.gov.br/transportes/resolucao.pdf" }],
});
assert.match(sanitizedClaims.direct_answer, /32 km\/h/);
assert.match(sanitizedClaims.sections[0].content, /Confirme sempre o manual do fabricante/);
const schemaSafeClaims = sanitizeStructuredArticleClaims({
  description: "Revisão em seis meses.", direct_answer: "Revisão em seis meses.", methodologyNotice: "Análise.",
  faq: [{ question: "Quando revisar?", answer: "Em seis meses." }],
  sections: [{ heading: "Manutenção", content: "Revise em seis meses." }],
}, { confirmed_facts: [], sources: [] });
assert.equal(schemaSafeClaims.description, "");
assert.equal(schemaSafeClaims.direct_answer, "");
assert.equal(schemaSafeClaims.faq.length, 0);
assert.equal(schemaSafeClaims.sections.length, 0);

const productKnowledgeResearch = {
  slug: "scott-addict-50-2026",
  status: "pesquisa_concluida",
  product_knowledge: {
    id: "scott-addict-50-2026-br",
    type: "bike",
    brand: "Scott",
    model: "Addict 50",
    modelYear: 2026,
    market: "BR",
    category: "road-endurance",
    sources: [{
      id: "official",
      name: "Scott",
      type: "manufacturer",
      url: "https://www.scott-sports.com/product",
      accessedAt: "2026-08-04",
    }],
    facts: {
      "weight.declared": {
        value: 9,
        unit: "kg",
        status: "approximate",
        sourceIds: ["official"],
        observedAt: "2026-08-04",
        market: "BR",
        qualifier: "Tamanho não informado",
      },
    },
    unresolvedFields: ["tamanho da pesagem"],
  },
};
const knowledgeRecord = buildProductKnowledgeRecord(productKnowledgeResearch, "2026-08-04");
assert.equal(knowledgeRecord.facts["weight.declared"].status, "approximate");
assert.equal(knowledgeRecord.history.length, 1);
assert.throws(() => buildProductKnowledgeRecord({
  ...productKnowledgeResearch,
  product_knowledge: {
    ...productKnowledgeResearch.product_knowledge,
    sources: [{ ...productKnowledgeResearch.product_knowledge.sources[0], id: "store", type: "store", url: "https://concorrente.example/produto" }],
    facts: { "weight.declared": { ...productKnowledgeResearch.product_knowledge.facts["weight.declared"], sourceIds: ["store"] } },
  },
}, "2026-08-04"), /Fonte não autorizada/);

const discoveredUrls = extractPortfolioBikeUrls(`
  <loc>https://thebikershop.com.br/produtos/bicicleta-scott-addict-50/</loc>
  <loc>https://thebikershop.com.br/produtos/bike-bag-scott-classic/</loc>
  <loc>https://concorrente.example/produtos/bicicleta-outra/</loc>
`);
assert.deepEqual(discoveredUrls, ["https://thebikershop.com.br/produtos/bicicleta-scott-addict-50/"]);
const discoveredProduct = productFromJsonLd(`
  <script type="application/ld+json">{"@type":"Product","name":"Bicicleta Scott Addict 50","brand":{"name":"Scott"},"offers":{"price":"28999","priceCurrency":"BRL","url":"https://thebikershop.com.br/produtos/bicicleta-scott-addict-50/"}}</script>
`, discoveredUrls[0]);
assert.equal(discoveredProduct.price, 28999);
assert.equal(discoveredProduct.brand, "Scott");

console.log("Schemas principais validados com sucesso.");
