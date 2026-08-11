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

export function markdownPublicationErrors(content) {
  const errors = [];
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
  return errors;
}

export function assertMarkdownPublicationGates(content) {
  const errors = markdownPublicationErrors(content);
  if (errors.length > 0) throw new Error(`Gate Markdown reprovado: ${errors.join("; ")}`);
  return { ok: true };
}
