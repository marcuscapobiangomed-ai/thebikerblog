const LEGAL_CLAIM = /\b(?:lei|legislacao|legal|contran|ctb|habilitacao|emplacamento|licenciamento|regulamentacao)\b/iu;
const LEGAL_CONTEXT = /\bno brasil\b[^.!?\n]*(?:limit|permit|proib|dispens|obrig|classific)/iu;
const NUMBER = "(?:\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)";
const UNIT = "(?:km\\/h|wh\\/km|km|wh|kw|w|nm|kg|rpm|mm|cm|mes(?:es)?|dia(?:s)?|ano(?:s)?|%)";
const NUMERIC_CLAIM = new RegExp(`\\b${NUMBER}\\s*${UNIT}\\b`, "giu");
const TECHNICAL_INFERENCE = /\b(?:rigidez(?:\s+torsional)?|mais\s+leve|reduz(?:ir|indo|em|\s+o|\s+a)|aumenta|melhora|evita|garante|ideal|adequad[ao]s?|vantagem|eficiencia|transferencia\s+de\s+potencia|manutencao|confiabilidade|precisao|modulacao|progressiv[ao]|resposta\s+mais\s+suave|sob\s+carga|estabilidade|agilidade|inspira\s+confianca|tolerancia\s+a\s+impactos|nivel\s+profissional|topo\s+da\s+hierarquia|escolha\s+(?:ideal|versatil|logica)|deve\s+optar|mais\s+adequad[ao]|influencia|contribui|significa|sensibilidade|fluidez|simplifica|permite|prioriza|suporta.+seguranca|disponibilidade|tendencia|evolucao|comportamento\s+dinamico|fator\s+critico|maior\s+resistencia|refinamento\s+mecanico|distribuicao\s+de\s+peso|gestao\s+de\s+energia|intervalos\s+de\s+manutencao)\b/iu;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function signatures(value) {
  const prose = String(value || "")
    // Frontmatter contains dates, product IDs and image captions. Those are
    // artifact metadata and must not be treated as claims in the article.
    .replace(/^---[\s\S]*?---/u, " ")
    // URLs are metadata, not article claims. Percent-encoded path segments
    // such as `UM%20-%20Chains` must not become the false claim "um%".
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/%[0-9a-f]{2}/giu, " ");
  return [...new Set((normalize(prose).match(NUMERIC_CLAIM) || []).map((claim) => claim
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

function proseSentences(value) {
  return normalize(String(value || "")
    .replace(/^---[\s\S]*?---/u, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\[[^\]]+\]\([^\)]+\)/gu, " "))
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.replace(/^#+\s*/u, "").trim())
    .filter(Boolean);
}

function repeatedParagraphs(value) {
  const paragraphs = String(value || "")
    .replace(/^---[\s\S]*?---/u, "")
    .replace(/<[^>]+>/gu, " ")
    .split(/\n\s*\n/u)
    .map(normalize)
    .filter((paragraph) => paragraph.length >= 160 && !/^de onde vem os dados/u.test(paragraph));
  const repeated = [];
  for (let left = 0; left < paragraphs.length; left += 1) {
    for (let right = left + 1; right < paragraphs.length; right += 1) {
      const shorter = paragraphs[left].length <= paragraphs[right].length ? paragraphs[left] : paragraphs[right];
      const longer = paragraphs[left].length > paragraphs[right].length ? paragraphs[left] : paragraphs[right];
      if (shorter === longer || longer.includes(shorter)) repeated.push(shorter.slice(0, 90));
    }
  }
  return [...new Set(repeated)];
}

function repeatedSentences(value) {
  const counts = new Map();
  for (const sentence of proseSentences(value)) {
    if (sentence.length < 80 || /^thebiker |^scott pagina/u.test(sentence)) continue;
    counts.set(sentence, (counts.get(sentence) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count >= 3).map(([sentence]) => sentence.slice(0, 100));
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

  const unsupportedInferences = proseSentences(content).filter((sentence) => TECHNICAL_INFERENCE.test(sentence));
  if (unsupportedInferences.length > 0) {
    errors.push(`inferencias tecnicas ausentes dos fatos confirmados: ${unsupportedInferences.slice(0, 3).join(" | ")}`);
  }

  const duplicates = repeatedParagraphs(content);
  if (duplicates.length > 0) errors.push(`paragrafos repetidos ou expandidos por copia: ${duplicates.slice(0, 2).join(" | ")}`);
  const sentenceDuplicates = repeatedSentences(content);
  if (sentenceDuplicates.length > 0) errors.push(`sentencas repetidas como enchimento: ${sentenceDuplicates.slice(0, 2).join(" | ")}`);

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
