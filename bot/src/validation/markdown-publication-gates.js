import { editorialTextQualityErrors } from "./editorial-text-quality.js";

const CANONICAL_TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MARKDOWN_POLICY_GUIDANCE = [
  "Não use linguagem publicitária absoluta ou superlativos vazios, incluindo: revolucionário, perfeito, imbatível, a melhor do mercado, tecnologia de ponta, qualidade incomparável, compra obrigatória, sem dúvidas e vale cada centavo.",
  "Em desk-research, não atribua teste prático à TheBiker e não use fórmulas como Testamos, Sentimos, Durante o pedal, Em nosso teste ou percebemos.",
  "Use somente tags canônicas em minúsculas, sem acentos e em kebab-case.",
];

const FORBIDDEN_MARKETING = [
  /\brevolucion[aá]ri[ao]\b/i,
  /\bperfeit[ao]\b/i,
  /\bimbat[ií]vel\b/i,
  /\ba melhor do mercado\b/i,
  /\btecnologia de ponta\b/i,
  /\bqualidade incompar[aá]vel\b/i,
  /\bcompra obrigat[oó]ria\b/i,
  /\bsem d[uú]vidas\b/i,
  /\bvale cada centavo\b/i,
];

const FORBIDDEN_DESK_TESTS = [
  /\bTestamos\b/,
  /\bSentimos\b/,
  /\bDurante o pedal\b/i,
  /\bNossa experi[êe]ncia com a bicicleta\b/i,
  /\bEm nosso teste\b/i,
  /\bpercebemos\b/i,
];

const NEUTRAL_MARKETING_REPLACEMENTS = [
  [/\brevolucion[aá]ri[ao]\b/gi, "tecnicamente relevante"],
  [/\bperfeit[ao]\b/gi, "consistente"],
  [/\bimbat[ií]vel\b/gi, "competitivo"],
  [/\ba melhor do mercado\b/gi, "uma opção relevante"],
  [/\btecnologia de ponta\b/gi, "tecnologia atual"],
  [/\bqualidade incompar[aá]vel\b/gi, "qualidade elevada"],
  [/\bcompra obrigat[oó]ria\b/gi, "opção a considerar"],
  [/\bsem d[uú]vidas\b/gi, "com base nas fontes consultadas"],
  [/\bvale cada centavo\b/gi, "exige avaliação de custo-benefício"],
];

const NEUTRAL_DESK_REPLACEMENTS = [
  [/\bDurante o pedal percebemos\b/gi, "As fontes consultadas indicam"],
  [/\bTestamos\b/g, "A análise documental considera"],
  [/\bSentimos\b/g, "As fontes consultadas descrevem"],
  [/\bDurante o pedal\b/gi, "Segundo as fontes consultadas"],
  [/\bNossa experi[êe]ncia com a bicicleta\b/gi, "A documentação técnica da bicicleta"],
  [/\bEm nosso teste\b/gi, "Na análise documental"],
  [/\bpercebemos\b/gi, "a documentação consultada indica"],
];

export function neutralizeMarkdownPolicyPhrases(value, { deskResearch = false } = {}) {
  let result = String(value || "");
  for (const [pattern, replacement] of NEUTRAL_MARKETING_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  if (deskResearch) {
    for (const [pattern, replacement] of NEUTRAL_DESK_REPLACEMENTS) {
      result = result.replace(pattern, replacement);
    }
  }
  return result;
}

function frontmatterValue(content, field) {
  return content.match(new RegExp(`^${field}:\\s*(.*)$`, "m"))?.[1]?.trim() || "";
}

function inlineTags(content) {
  const value = frontmatterValue(content, "tags");
  if (!value.startsWith("[") || !value.endsWith("]")) return [];
  return value.slice(1, -1).split(",")
    .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function frontmatterSourceTypes(content) {
  const frontmatter = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] || "";
  return [...frontmatter.matchAll(/^\s{2,}type:\s*["']?([^"'\r\n]+)["']?\s*$/gmu)]
    .map((match) => match[1].trim().toLowerCase());
}

export function markdownPublicationErrors(content) {
  const errors = [];
  const editorialFormat = frontmatterValue(content, "editorial_format").replace(/^['"]|['"]$/g, "");
  if (editorialFormat && editorialFormat !== "full-article-v1") {
    errors.push(`formato editorial não publicável: ${editorialFormat}`);
  }
  const tags = inlineTags(content);
  const invalidTags = tags.filter((tag) => !CANONICAL_TAG_PATTERN.test(tag));
  if (invalidTags.length > 0) errors.push(`tags não canônicas: ${invalidTags.join(", ")}`);

  const body = String(content).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const marketing = FORBIDDEN_MARKETING.find((pattern) => pattern.test(body));
  if (marketing) errors.push(`linguagem publicitária proibida: ${body.match(marketing)?.[0]}`);

  const reviewMethod = frontmatterValue(content, "review_method").replace(/^['"]|['"]$/g, "");
  const tested = frontmatterValue(content, "tested_by_thebikerblog").toLowerCase();
  if (reviewMethod === "desk-research" || tested === "false") {
    const deskTest = FORBIDDEN_DESK_TESTS.find((pattern) => pattern.test(body));
    if (deskTest) errors.push(`alegação de teste prático proibida: ${body.match(deskTest)?.[0]}`);
  }
  const contentType = frontmatterValue(content, "content_type").replace(/^['"]|['"]$/g, "");
  if (["review", "lancamento"].includes(contentType)) {
    for (const field of ["brand", "product_name", "model_year"]) {
      const value = frontmatterValue(content, field).replace(/^['"]|['"]$/g, "");
      if (!value || /^(?:n[aã]o informado|desconhecido|n\/a)$/iu.test(value)) {
        errors.push(`identidade do produto incompleta: ${field}`);
      }
    }
  }
  if (["review", "comparativo", "lancamento"].includes(contentType)
      && !frontmatterSourceTypes(content).includes("manufacturer")) {
    errors.push("conteúdo de produto sem fonte técnica do fabricante");
  }
  errors.push(...editorialTextQualityErrors({
    body,
    contentType,
    directAnswer: frontmatterValue(content, "direct_answer"),
    title: frontmatterValue(content, "title"),
    description: frontmatterValue(content, "description"),
    headings: [...body.matchAll(/^##\s+(.+)$/gmu)].map((match) => match[1]),
  }));
  return errors;
}

export function assertMarkdownPublicationGates(content) {
  const errors = markdownPublicationErrors(content);
  if (errors.length > 0) throw new Error(`Gate Markdown reprovado: ${errors.join("; ")}`);
  return { ok: true };
}
