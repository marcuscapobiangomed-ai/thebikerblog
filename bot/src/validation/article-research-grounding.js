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
