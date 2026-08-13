const LEGAL_CLAIM = /\b(?:lei|legislacao|legal|contran|ctb|habilitacao|emplacamento|licenciamento|regulamentacao)\b/iu;
const LEGAL_CONTEXT = /\bno brasil\b[^.!?\n]*(?:limit|permit|proib|dispens|obrig|classific)/iu;
const NUMBER = "(?:\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)";
const UNIT = "(?:km\\/h|wh\\/km|km|wh|kw|w|nm|kg|rpm|mm|cm|mes(?:es)?|dia(?:s)?|ano(?:s)?|%)";
const NUMERIC_CLAIM = new RegExp(`\\b${NUMBER}\\s*${UNIT}\\b`, "giu");

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function signatures(value) {
  return [...new Set((normalize(value).match(NUMERIC_CLAIM) || []).map((claim) => claim
    .replace(/\s+/g, "")
    .replace(/^(\d+)[.,](\d{3})(?=[a-z%/])/, "$1$2")))];
}

function governmentSource(source) {
  try {
    const host = new URL(source?.url || "").hostname.toLowerCase().replace(/^www\./, "");
    return host === "gov.br" || host.endsWith(".gov.br");
  } catch {
    return false;
  }
}

export function articleResearchGroundingErrors({ content, research }) {
  const errors = [];
  const article = normalize(content);
  const facts = Array.isArray(research?.confirmed_facts) ? research.confirmed_facts : [];
  const factText = (fact) => typeof fact?.fact === "string" ? fact.fact : JSON.stringify(fact?.fact || fact);
  const factCorpus = facts.map(factText).join(" ");
  const supportedNumbers = new Set(signatures(factCorpus));
  const unsupportedNumbers = signatures(article).filter((claim) => !supportedNumbers.has(claim));
  if (unsupportedNumbers.length > 0) {
    errors.push(`alegações numéricas ausentes dos fatos confirmados: ${unsupportedNumbers.join(", ")}`);
  }

  const sources = Array.isArray(research?.sources) ? research.sources : [];
  const governmentSourceIds = new Set(sources.filter(governmentSource).map((source) => source.id));
  if (LEGAL_CLAIM.test(article) && governmentSourceIds.size === 0) {
    errors.push("alegações legais exigem fonte governamental oficial");
  }

  const governmentFactCorpus = facts
    .filter((fact) => (fact?.source_ids || []).some((id) => governmentSourceIds.has(id)))
    .map(factText)
    .join(" ");
  const governmentNumbers = new Set(signatures(governmentFactCorpus));
  const legalNumbers = [...new Set(article
    .split(/(?<=[.!?])\s+|\n+/u)
    .filter((sentence) => LEGAL_CLAIM.test(sentence) || LEGAL_CONTEXT.test(sentence))
    .flatMap(signatures))];
  const unsupportedLegalNumbers = legalNumbers.filter((claim) => !governmentNumbers.has(claim));
  if (unsupportedLegalNumbers.length > 0) {
    errors.push(`alegações legais numéricas sem suporte governamental: ${unsupportedLegalNumbers.join(", ")}`);
  }
  return errors;
}

export function assertArticleResearchGrounding(options) {
  const errors = articleResearchGroundingErrors(options);
  if (errors.length > 0) throw new Error(`Artigo bloqueado por integridade de claims: ${errors.join("; ")}`);
  return options.content;
}

function removeUnsupportedSentences(value, research) {
  const text = String(value || "");
  const parts = text.match(/[^.!?\n]+[.!?]?|\n+/gu) || [];
  const neutral = [
    "Esse ponto não é quantificado porque as fontes confirmadas não oferecem base suficiente; a decisão deve seguir a documentação específica e as regras aplicáveis.",
    "A evidência disponível não permite fixar esse valor com segurança; confirme a documentação correspondente antes de transformar o critério em decisão prática.",
    "Sem confirmação explícita nas fontes aceitas, o artigo não atribui medida a esse aspecto e mantém a análise limitada aos dados rastreáveis.",
  ];
  return parts
    .map((part, index) => /^\s*\n+\s*$/u.test(part) || articleResearchGroundingErrors({ content: part, research }).length === 0
      ? part
      : ` ${neutral[index % neutral.length]}`)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeStructuredArticleClaims(articleInput, research) {
  const article = structuredClone(articleInput);
  for (const field of ["description", "direct_answer", "methodologyNotice"]) {
    if (typeof article[field] === "string") article[field] = removeUnsupportedSentences(article[field], research);
  }
  if (Array.isArray(article.faq)) {
    article.faq = article.faq.map((item) => ({ ...item, answer: removeUnsupportedSentences(item.answer, research) }));
  }
  if (Array.isArray(article.sections)) {
    article.sections = article.sections.map((section) => ({ ...section, content: removeUnsupportedSentences(section.content, research) }));
  }
  if (String(article.description || "").length < 140) {
    article.description = "Análise documental dos critérios técnicos, limitações e decisões de uso, baseada apenas nas fontes confirmadas e nas evidências disponíveis.";
  }
  if (String(article.direct_answer || "").length < 80) {
    article.direct_answer = "A decisão técnica deve considerar o uso previsto, as limitações documentadas e as especificações efetivamente confirmadas nas fontes do artigo.";
  }
  if (Array.isArray(article.faq)) article.faq = article.faq.filter((item) => String(item.answer || "").trim().length > 0);
  if (Array.isArray(article.sections)) {
    article.sections = article.sections.map((section) => ({
      ...section,
      content: section.content || "Esta seção permanece limitada às evidências documentadas; confirme as especificações aplicáveis antes de decidir.",
    }));
  }
  return article;
}
