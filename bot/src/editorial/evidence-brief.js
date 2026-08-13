import { generateMarkdown } from "../generator.js";
import { canonicalPortfolioBrand, THEBIKER_PORTFOLIO } from "../portfolio-policy.js";
import { assertArticleResearchGrounding } from "../validation/article-research-grounding.js";
import { assertEditorialPublicationGates } from "../validation/editorial-publication-gates.js";

const FIELD_LABELS = {
  "identity.storeName": "Modelo",
  "identity.manufacturerModelCode": "Código do fabricante",
  "identity.color": "Cor declarada",
  "identity.sizes": "Tamanhos declarados",
  "frame.material": "Material do quadro",
  "suspension.frontTravel": "Curso dianteiro",
  "suspension.rearTravel": "Curso traseiro",
  "suspension.fork": "Garfo",
  "suspension.rearShock": "Amortecedor traseiro",
  "drivetrain.rearDerailleur": "Câmbio traseiro",
  "drivetrain.speeds": "Velocidades",
  "drivetrain.shifting": "Acionamento declarado",
  "drivetrain.crankset": "Pedivela",
  "drivetrain.cassette": "Cassete",
  "brakes.calipers": "Freios",
  "limits.maxSystemWeight": "Peso máximo do sistema",
};

function trimTitle(value, maximum = 120) {
  const title = String(value || "Boletim técnico TheBiker").trim();
  if (title.length <= maximum) return title;
  const shortened = title.slice(0, maximum + 1).replace(/\s+\S*$/, "").replace(/[,:;\s-]+$/, "");
  return shortened.length >= 10 ? shortened : title.slice(0, maximum);
}

function parseFact(entry) {
  const text = String(entry?.fact || "");
  const separator = text.indexOf(": ");
  if (separator < 1) return null;
  const field = text.slice(0, separator).trim();
  const value = text.slice(separator + 2).trim();
  if (!field || !value || field.endsWith("Url")) return null;
  return { field, value, sourceId: entry.source_ids?.[0] || "" };
}

function sourceSubject(source) {
  const url = String(source?.url || "");
  const name = String(source?.name || "Fonte oficial");
  const patterns = [
    [/spark-rc-world-cup/i, "Spark RC World Cup"],
    [/spark-rc-expert/i, "Spark RC Expert"],
    [/spark-rc-team/i, "Spark RC Team"],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(`${url} ${name}`)) return label;
  }
  return name.replace(/^TheBiker\s*[—-]\s*/iu, "");
}

function escapeCell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function rowsFor(facts, sources, prefixes) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  return facts
    .filter((fact) => prefixes.some((prefix) => fact.field.startsWith(prefix)))
    .map((fact) => ({
      label: FIELD_LABELS[fact.field] || fact.field,
      value: fact.value,
      subject: sourceSubject(sourceMap.get(fact.sourceId)),
    }));
}

function renderTable(rows, emptyText) {
  if (rows.length === 0) return emptyText;
  return [
    "| Documento | Campo | Valor registrado |",
    "|---|---|---|",
    ...rows.map((row) => `| ${escapeCell(row.subject)} | ${escapeCell(row.label)} | ${escapeCell(row.value)} |`),
  ].join("\n");
}

function findBrand(item, research) {
  const identityFacts = (research.confirmed_facts || [])
    .filter((entry) => String(entry.fact || "").startsWith("identity.storeName: "))
    .map((entry) => entry.fact);
  const sourceNames = (research.sources || []).map((source) => source.name);
  const candidates = [item?.title || "", identityFacts.join(" "), sourceNames.join(" ")];
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    const match = THEBIKER_PORTFOLIO.brands.find((brand) => normalized.includes(brand.toLowerCase()));
    if (match) return canonicalPortfolioBrand(match);
  }
  return "";
}

function categoryFor(contentType) {
  if (contentType === "review") return "reviews";
  if (contentType === "comparativo") return "comparativos";
  if (["noticia", "lancamento"].includes(contentType)) return "noticias";
  return "guia-tecnico";
}

function tagsFor(brand, facts) {
  const tags = [];
  if (brand) tags.push(brand.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  if (facts.some((fact) => /carbon/i.test(fact.value))) tags.push("carbono");
  return [...new Set(tags)].slice(0, 6);
}

export function buildEvidenceBrief({ item, research, today = new Date().toISOString().slice(0, 10), env = process.env } = {}) {
  if (item?.race || research?.editorial_scope === "race-coverage") {
    throw new Error("Boletim factual automático não substitui cobertura de corrida");
  }
  const sources = Array.isArray(research?.sources) ? research.sources : [];
  const facts = (research?.confirmed_facts || []).map(parseFact).filter(Boolean);
  if (sources.length === 0 || facts.length < 5) {
    throw new Error("Boletim factual exige ao menos uma fonte e cinco fatos confirmados");
  }
  const brand = findBrand(item, research);
  if (!brand) throw new Error("Boletim factual sem marca promovida do portfólio TheBiker");

  const identityRows = rowsFor(facts, sources, ["identity.", "frame."]);
  const suspensionRows = rowsFor(facts, sources, ["suspension."]);
  const componentRows = rowsFor(facts, sources, ["drivetrain.", "brakes."]);
  const limitRows = rowsFor(facts, sources, ["limits.", "commercial."]);
  const modelNames = facts.filter((fact) => fact.field === "identity.storeName").map((fact) => fact.value);
  const modelYear = Number((`${item.title} ${modelNames.join(" ")}`.match(/\b20(?:2[0-9]|3[0-5])\b/) || [])[0]) || undefined;
  const contentType = research.content_type || item.contentType || "guia-tecnico";
  const title = trimTitle(item.title || research.title);
  const article = {
    editorial_format: "evidence-brief-v1",
    title,
    description: "Boletim factual com especificações localizadas nas fontes oficiais e comerciais recuperadas, sem teste prático, estimativas ou preenchimento de campos ausentes.",
    direct_answer: "Este boletim registra somente especificações ligadas a trechos das fontes recuperadas. Não houve teste prático, e qualquer campo ausente permanece sem afirmação editorial.",
    faq: [],
    slug: item.id || research.slug,
    category: categoryFor(contentType),
    content_type: contentType,
    audience_segment: "core_technical_cyclists",
    audience_intent: contentType === "comparativo" ? "compare_products" : "technical_learning",
    experience_level_target: "intermediate_advanced",
    review_method: "desk-research",
    tested_by_thebikerblog: false,
    methodologyNotice: "> **Escopo documental:** publicação de contingência formada somente por fatos associados a trechos recuperados. Não houve teste prático, estimativa de campos ausentes ou ampliação interpretativa.",
    brand,
    product_name: modelNames.join(" | ").slice(0, 240),
    ...(modelYear ? { model_year: modelYear } : {}),
    market: research.market || "Brasil",
    weight: "Não informado",
    weight_source: "Não informado",
    price_min: 0,
    price_max: 0,
    price_currency: "BRL",
    price_checked_at: today,
    affiliate_links: false,
    editorial_scope: "portfolio",
    promoted_brands: [brand],
    context_only_brands: [],
    portfolio_evidence_url: research.portfolio_evidence_url,
    portfolio_verified_at: research.portfolio_verified_at || today,
    tags: tagsFor(brand, facts),
    sections: [
      {
        heading: "O que foi registrado nesta pauta",
        content: `A pauta **${title}** adota o formato de boletim factual e se restringe ao conjunto documental disponível. Cada linha abaixo corresponde a um fato confirmado e conserva o documento de origem.`,
      },
      {
        heading: "Identificação e quadro nas fontes",
        content: renderTable(identityRows, "O conjunto confirmado não trouxe registros de identificação ou quadro para esta pauta."),
      },
      {
        heading: "Suspensão documentada",
        content: renderTable(suspensionRows, "Nenhum campo de suspensão integrou os fatos confirmados desta pauta."),
      },
      {
        heading: "Transmissão e freios documentados",
        content: renderTable(componentRows, "Transmissão e freios ficaram sem valores no conjunto documental recuperado."),
      },
      {
        heading: "Limites mantidos no boletim",
        content: `${renderTable(limitRows, "O conjunto confirmado não registrou outros limites ou campos comerciais.")}\n\nQualquer informação que não esteja nas tabelas permanece fora desta publicação. A ausência de um campo não foi convertida em estimativa.`,
      },
    ],
    imagePlan: [{
      position: "hero",
      purpose: "Identificar visualmente o produto documentado na pauta",
      assetType: "official-product-photo",
      editorialUse: "publishable",
      factualSubject: "exact-product",
      brief: "Usar fotografia oficial do produto correspondente à pauta documental",
      sourceRequired: true,
      avoid: ["imagem gerada por IA", "produto diferente"],
      aspectRatio: "16:9",
      altSuggestion: `Produto ${modelNames[0] || brand} documentado nas fontes`,
      allowedSource: "manufacturer-authorized",
      aiGeneratedAllowed: false,
    }],
    claimsRequiringReview: [],
    sources: sources.map((source) => ({
      name: source.name,
      type: source.type || "official",
      url: source.url,
      accessed_at: source.accessed_at || source.accessed || today,
    })),
  };

  const gateResult = assertEditorialPublicationGates(article, env);
  const content = generateMarkdown(article);
  assertArticleResearchGrounding({ content, research });
  return {
    title: article.title,
    content,
    pipelineMetadata: {
      scoreBeforePremium: 100,
      finalScore: 100,
      finalBlockers: 0,
      premiumEditUsed: false,
      evidenceBriefUsed: true,
      providers: { fallback: "deterministic-evidence-brief-v1" },
      evidenceBriefGate: gateResult,
    },
  };
}
