/**
 * Converte um artigo JSON estruturado em Markdown Jekyll.
 * Ex.: node src/generator.js < input.json > output.md
 */
import { validateArticle } from "./schemas/article.schema.js";
import { getCoverPreset } from "./image-presets.js";

const escapeYaml = (s) => (s || "").replace(/"/g, '\\"');

function yamlValue(value) {
  if (value === null || value === undefined || value === "") return '""';
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return `"${escapeYaml(String(value))}"`;
}

function yamlList(items) {
  return `[${(items || []).map((item) => yamlValue(item)).join(", ")}]`;
}

function normalizeSources(sources = []) {
  return Array.isArray(sources) ? sources : [];
}

export function generateMarkdown(article) {
  const data = validateArticle(article);
  const today = new Date().toISOString().split("T")[0];
  const sources = normalizeSources(data.sources);
  const preset = getCoverPreset(data.content_type);
  const image = data.frontmatter?.image && data.frontmatter.image !== "/assets/img/logo.svg"
    ? data.frontmatter.image
    : preset.hero;
  const thumbnail = data.frontmatter?.thumbnail && data.frontmatter.thumbnail !== "/assets/img/logo.svg"
    ? data.frontmatter.thumbnail
    : preset.thumbnail;
  const isFallbackImage = image.startsWith("/assets/img/system/covers/");
  const imageAlt = data.frontmatter?.image_alt || data.description;
  const imageCaption = data.frontmatter?.image_caption || (isFallbackImage
    ? "Imagem conceitual temporária; será substituída por material editorial aprovado."
    : "");
  const imageCredit = isFallbackImage
    ? "TheBiker com geração assistida por IA"
    : (data.frontmatter?.image_credit || "TheBiker");
  const imageLicense = isFallbackImage
    ? "Uso editorial interno TheBiker"
    : (data.frontmatter?.image_license || "Uso editorial da TheBiker");
  const methodologyNotice = data.methodologyNotice || (data.review_method === "hands-on-test"
    ? "> **Como testamos:** o produto foi testado presencialmente pela equipe TheBiker."
    : "> **Como este artigo foi produzido:** análise documental baseada em especificações oficiais, catálogo TheBiker e comparação com alternativas vendidas pela loja. O produto não foi testado presencialmente pela equipe TheBiker. O conteúdo foi elaborado com auxílio de IA e revisado editorialmente.");

  const frontmatter = [
    "---",
    'layout: post',
    'published: false',
    `title: "${escapeYaml(data.title)}"`,
    `slug: "${escapeYaml(data.slug)}"`,
    `date: ${today}`,
    `last_modified_at: ${today}`,
    'author: "Equipe TheBiker"',
    'reviewed_by: ""',
    `content_type: "${escapeYaml(data.content_type)}"`,
    `editorial_format: "${escapeYaml(data.editorial_format)}"`,
    `audience_segment: "${escapeYaml(data.audience_segment)}"`,
    `audience_intent: "${escapeYaml(data.audience_intent)}"`,
    `experience_level_target: "${escapeYaml(data.experience_level_target)}"`,
    `review_method: "${escapeYaml(data.review_method)}"`,
    `tested_by_thebikerblog: ${data.tested_by_thebikerblog === true}`,
    `ai_assisted: true`,
    `brand: "${escapeYaml(data.brand || "")}"`,
    `product_name: "${escapeYaml(data.product_name || "")}"`,
    `model_year: ${data.model_year || ""}`,
    `market: "${escapeYaml(data.market || "Brasil")}"`,
    `weight: "${escapeYaml(data.weight || "Não informado")}"`,
    `weight_source: "${escapeYaml(data.weight_source || "Não informado")}"`,
    `price_min: ${data.price_min || 0}`,
    `price_max: ${data.price_max || 0}`,
    `price_currency: "${escapeYaml(data.price_currency || "BRL")}"`,
    `price_checked_at: "${escapeYaml(data.price_checked_at || today)}"`,
    `category: "${escapeYaml(data.category)}"`,
    `tags: ${yamlList(data.tags)}`,
    `description: "${escapeYaml(data.description)}"`,
    `direct_answer: "${escapeYaml(data.direct_answer)}"`,
    ...(data.faq.length > 0 ? [
      "faq:",
      ...data.faq.map((item) => [
        `  - question: "${escapeYaml(item.question)}"`,
        `    answer: "${escapeYaml(item.answer)}"`,
      ]).flat(),
    ] : []),
    `image: "${escapeYaml(image)}"`,
    `image_mobile: "${escapeYaml(isFallbackImage ? (preset.mobile || image) : image)}"`,
    `thumbnail: "${escapeYaml(thumbnail)}"`,
    'image_manifest_version: 2',
    `image_asset_type: "${isFallbackImage ? "system-fallback" : "unverified"}"`,
    `image_status: "${isFallbackImage ? "draft" : "pending-approval"}"`,
    `image_alt: "${escapeYaml(imageAlt)}"`,
    `image_caption: "${escapeYaml(imageCaption)}"`,
    `image_credit: "${escapeYaml(imageCredit)}"`,
    `image_license: "${escapeYaml(imageLicense)}"`,
    `affiliate_links: ${data.affiliate_links === true}`,
    `editorial_scope: "${escapeYaml(data.editorial_scope)}"`,
    `promoted_brands: ${yamlList(data.promoted_brands)}`,
    `context_only_brands: ${yamlList(data.context_only_brands)}`,
    `portfolio_evidence_url: "${escapeYaml(data.portfolio_evidence_url)}"`,
    `portfolio_verified_at: "${escapeYaml(data.portfolio_verified_at)}"`,
    `editorial_status: "draft"`,
    `status: "draft"`,
    "sources:",
    ...sources.map((source) => [
      `  - name: "${escapeYaml(source.name)}"`,
      `    type: "${escapeYaml(source.type)}"`,
      `    url: "${escapeYaml(source.url || "")}"`,
      `    accessed_at: "${escapeYaml(source.accessed_at)}"`,
    ]).flat(),
    "---",
    "",
  ].join("\n");

  let body = `${methodologyNotice}\n\n`;

  for (const section of data.sections) {
    body += `## ${section.heading}\n\n${section.content}\n\n`;
  }

  if (!body.match(/##\s*(Fontes|Fontes e metodologia|Referências|De onde vêm os dados)/i)) {
    body += "## De onde vêm os dados desta análise\n\n";
    for (const source of sources) {
      body += `- **${source.name}** (${source.type})${source.url ? ` — ${source.url}` : ""} — acessado em ${source.accessed_at}\n`;
    }
    body += "\n";
  }

  if (data.claimsRequiringReview.length > 0) {
    body += "<!-- Pontos que precisam de revisão humana:\n";
    for (const claim of data.claimsRequiringReview) {
      body += `  - ${claim}\n`;
    }
    body += "-->\n\n";
  }

  return frontmatter + body;
}

// CLI
if (process.argv[1] && process.argv[1].includes("generator.js")) {
  let input = "";
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    try {
      const article = JSON.parse(input);
      console.log(generateMarkdown(article));
    } catch (err) {
      console.error("Erro:", err.message);
      process.exit(1);
    }
  });
}
