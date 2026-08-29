#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateArticle } from "./src/schemas/article.schema.js";
import { validateResearch } from "./src/schemas/research.schema.js";
import { generateMarkdown } from "./src/generator.js";
import { buildProductKnowledgeRecord } from "./src/knowledge/product-knowledge.js";
import { extractPortfolioBikeUrls, productFromJsonLd } from "../scripts/discover-thebiker-catalog.js";

const validArticle = {
  title: "Comparativo de bikes endurance e race em 2026",
  description:
    "Uma análise editorial detalhada sobre diferenças de geometria, peso, custo e perfil de uso entre bikes endurance e race para diferentes ciclistas.",
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
assert.throws(() => validateArticle({ ...validArticle, title: "T".repeat(71) }), /70 caracteres/);
assert.throws(() => validateArticle({ ...validArticle, description: "Descrição curta." }), /140 caracteres/);
assert.throws(() => validateArticle({ ...validArticle, description: "A".repeat(150) }), /pontuacao final/);
assert.throws(() => validateArticle({ ...validArticle, direct_answer: validArticle.description }), /funcoes diferentes/);
const generatedMarkdown = generateMarkdown(validArticle);
assert.match(generatedMarkdown, /editorial_scope: "portfolio"/);
assert.match(generatedMarkdown, /published: false/);
assert.match(generatedMarkdown, /promoted_brands: \["Scott"\]/);
assert.match(generatedMarkdown, /portfolio_evidence_url: "https:\/\/www\.thebiker\.com\.br\/bikes\/estrada\/"/);
assert.match(generatedMarkdown, /direct_answer:/);
assert.match(generatedMarkdown, /faq:/);
assert.match(generatedMarkdown, /## De onde vêm os dados desta análise/);
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
assert.doesNotThrow(() => validateResearch(validResearch));

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
