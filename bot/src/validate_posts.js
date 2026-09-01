#!/usr/bin/env node
/**
 * Valida todos os posts em _posts/ conforme o checklist do Manual Editorial (seção 15).
 *
 * Uso: node src/validate_posts.js [caminho/para/arquivo.md]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TEMPLATES } from "./templates.js";
import { isPortfolioBrand, THEBIKER_PORTFOLIO } from "./portfolio-policy.js";
import { seoMetadataIssues } from "./seo-metadata.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const POSTS_DIR = path.resolve(__dirname, "../../_posts");

const CANONICAL_TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PORTFOLIO_POLICY_EFFECTIVE_AT = THEBIKER_PORTFOLIO.policy_effective_at;

const REQUIRED_FM = [
  "layout", "title", "date", "tags", "description",
  "content_type", "review_method", "tested_by_thebikerblog", "ai_assisted",
  "editorial_status",
];

const FORBIDDEN_PATTERNS = [
  { pattern: /\brevolucion[aá]ri[ao]\b/i, reason: "linguagem publicitária proibida" },
  { pattern: /\bperfeit[ao]\b/, reason: "linguagem publicitária proibida" },
  { pattern: /\bimbat[ií]vel\b/, reason: "linguagem publicitária proibida" },
  { pattern: /\ba melhor do mercado\b/i, reason: "linguagem publicitária proibida" },
  { pattern: /\btecnologia de ponta\b/i, reason: "linguagem publicitária proibida" },
  { pattern: /\bqualidade incompar[aá]vel\b/i, reason: "linguagem publicitária proibida" },
  { pattern: /\bcompra obrigat[oó]ria\b/i, reason: "linguagem publicitária proibida" },
  { pattern: /\bsem d[uú]vidas\b/i, reason: "linguagem publicitária proibida" },
  { pattern: /\bvale cada centavo\b/i, reason: "linguagem publicitária proibida" },
  { pattern: /\b[íi]cone do ciclismo\b/i, reason: "linguagem publicitária proibida" },
  { pattern: /\blend[aá]ria ic[oô]nic[ao]\b/i, reason: "linguagem publicitária proibida" },
];

const FORBIDDEN_DESK_PHRASES = [
  { pattern: /\bTestamos\b/, reason: "frase de teste real proibida em análise documental" },
  { pattern: /\bSentimos\b/, reason: "frase de teste real proibida em análise documental" },
  { pattern: /\bDurante o pedal\b/i, reason: "frase de teste real proibida em análise documental" },
  { pattern: /\bNossa experi[êe]ncia com a bicicleta\b/i, reason: "frase de teste real proibida em análise documental" },
  { pattern: /\bEm nosso teste\b/i, reason: "frase de teste real proibida em análise documental" },
  { pattern: /\bpercebemos\b/i, reason: "frase de teste real proibida em análise documental" },
];

let totalErrors = 0;
let totalWarnings = 0;

function logError(file, msg) {
  console.log(`  ❌ ${file}: ${msg}`);
  totalErrors++;
}

function logWarning(file, msg) {
  console.log(`  ⚠️  ${file}: ${msg}`);
  totalWarnings++;
}

function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  const fmText = fmMatch[1];
  const fm = {};
  for (const line of fmText.split("\n")) {
    const kvMatch = line.match(/^\s*([a-z_]+)\s*:\s*(.*)/);
    if (kvMatch) {
      fm[kvMatch[1]] = kvMatch[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return fm;
}

function parseInlineList(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("[") || !text.endsWith("]")) return [];
  return text
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function validateFrontmatter(content, fileName) {
  const fm = parseFrontmatter(content);
  if (!fm) {
    logError(fileName, "Sem frontmatter");
    return null;
  }

  const errors = [];

  for (const field of REQUIRED_FM) {
    if (!fm[field] || fm[field] === "") {
      errors.push(`Campo obrigatório '${field}' ausente`);
    }
  }

  const requiresPublicationMetadata = fm.published === "true" || fm.status === "published" || fm.editorial_status === "published";
  if (requiresPublicationMetadata) {
    for (const issue of seoMetadataIssues({ title: fm.title, description: fm.description, directAnswer: fm.direct_answer })) {
      errors.push(`SEO metadata: ${issue}`);
    }
  }

  // Valida editorial_status
  if (fm.editorial_status && !["draft", "reviewed", "published"].includes(fm.editorial_status)) {
    errors.push(`editorial_status inválido: "${fm.editorial_status}" (use: draft, reviewed, published)`);
  }

  // Valida content_type
  if (fm.content_type && !["review", "comparativo", "guia-de-compra", "guia-tecnico", "guia-turistico", "noticia", "lancamento", "previa-corrida", "resumo-corrida", "calendario-provas", "guia-prova"].includes(fm.content_type)) {
    logWarning(fileName, `content_type não padronizado: "${fm.content_type}"`);
  }

  // Valida review_method
  if (fm.review_method && !["desk-research", "hands-on-test"].includes(fm.review_method)) {
    logWarning(fileName, `review_method inválido: "${fm.review_method}"`);
  }

  const fileDate = fileName.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
  if (fileDate >= PORTFOLIO_POLICY_EFFECTIVE_AT) {
    const promotedBrands = parseInlineList(fm.promoted_brands);
    const blockedBrands = promotedBrands.filter((brand) => !isPortfolioBrand(brand));

    if (!fm.editorial_scope || !["portfolio", "race-coverage"].includes(fm.editorial_scope)) {
      errors.push("Campo 'editorial_scope' ausente ou inválido");
    }
    if (promotedBrands.length === 0) {
      errors.push("Campo 'promoted_brands' precisa conter ao menos uma marca do portfólio TheBiker");
    }
    if (blockedBrands.length > 0) {
      errors.push(`Promoção de marca fora do portfólio TheBiker: ${blockedBrands.join(", ")}`);
    }
    if (!/^https?:\/\/(www\.)?(thebiker\.com\.br|thebikershop\.com\.br)\//i.test(fm.portfolio_evidence_url || "")) {
      errors.push("Campo 'portfolio_evidence_url' precisa apontar para o site oficial da TheBiker");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fm.portfolio_verified_at || "").replace(/["']/g, ""))) {
      errors.push("Campo 'portfolio_verified_at' precisa usar YYYY-MM-DD");
    }
    if (fm.editorial_scope !== "race-coverage" && parseInlineList(fm.context_only_brands).length > 0) {
      errors.push("Marcas concorrentes contextuais só são permitidas em cobertura de corridas");
    }
  }

  // Verifica se tested_by_thebikerblog é booleano
  if (fm.tested_by_thebikerblog && !["true", "false"].includes(fm.tested_by_thebikerblog.toLowerCase())) {
    logWarning(fileName, `tested_by_thebikerblog deve ser true ou false, encontrado: "${fm.tested_by_thebikerblog}"`);
  }

  // Verifica preços
  if (fm.price_min && isNaN(parseFloat(fm.price_min))) {
    logWarning(fileName, `price_min não é numérico: "${fm.price_min}"`);
  }
  if (fm.price_max && isNaN(parseFloat(fm.price_max))) {
    logWarning(fileName, `price_max não é numérico: "${fm.price_max}"`);
  }

  // Extrai tags
  const tagsMatch = content.match(/^tags:\s*\[(.+?)\]/m);
  if (tagsMatch) {
    const tags = tagsMatch[1].split(",").map((t) => t.trim().toLowerCase().replace(/["']/g, ""));
    const invalidTags = tags.filter((t) => t !== "" && !CANONICAL_TAG_PATTERN.test(t));
    if (invalidTags.length > 0) {
      logWarning(fileName, `Tags não padronizadas: ${invalidTags.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    logError(fileName, errors.join("; "));
    return null;
  }

  return fm;
}

function checkSuspiciousContent(content, fileName, fm) {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

  // Verifica padrões proibidos
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    const match = body.match(pattern);
    if (match) {
      const context = body.substring(Math.max(0, match.index - 30), match.index + 60).replace(/\n/g, " ");
      logWarning(fileName, `${reason}: "${match[0]}" — contexto: "${context.trim()}"`);
    }
  }

  // Se for desk-research, verifica frases proibidas de teste real
  if (fm?.review_method === "desk-research" || fm?.tested_by_thebikerblog === "false") {
    for (const { pattern, reason } of FORBIDDEN_DESK_PHRASES) {
      const match = body.match(pattern);
      if (match) {
        const context = body.substring(Math.max(0, match.index - 30), match.index + 60).replace(/\n/g, " ");
        logError(fileName, `${reason}: "${match[0]}" — contexto: "${context.trim()}"`);
      }
    }
  }
}

function checkImages(content, fileName) {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const imgRefs = [...body.matchAll(/!\[.*?\]\((.*?)\)/g)];

  for (const ref of imgRefs) {
    const url = ref[1];

    if (url.startsWith("http") && !url.includes("placehold")) {
      logWarning(fileName, `Imagem externa sem hotlink confirmado: ${url.substring(0, 80)}`);
    }

    if (url.startsWith("/assets")) {
      const fullPath = path.resolve(POSTS_DIR, "..", url.substring(1));
      if (!fs.existsSync(fullPath)) {
        logWarning(fileName, `Imagem local não encontrada: ${url}`);
      }
    }
  }

  // Verifica se tem alt text
  const imgWithoutAlt = body.match(/!\[(.*?)\]\(.*?\)/g);
  if (imgWithoutAlt) {
    for (const ref of imgWithoutAlt) {
      const altMatch = ref.match(/!\[(.*?)\]/);
      if (altMatch && (!altMatch[1] || altMatch[1].trim() === "")) {
        logWarning(fileName, "Imagem com texto alternativo vazio (decorativa deve usar alt vazio intencionalmente)");
      }
    }
  }
}

function checkPriceConsistency(content, fileName, fm) {
  if (!fm) return;
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const priceMin = parseFloat(fm.price_min || "0") || 0;
  const priceMax = parseFloat(fm.price_max || "0") || 0;
  const hasPriceData = priceMin > 0 || priceMax > 0;

  if (priceMin > 0) {
    const priceStr = String(fm.price_min);
    const inBody = body.includes(priceStr) || body.includes(parseFloat(priceStr).toLocaleString("pt-BR"));
    if (!inBody) {
      logWarning(fileName, `Preço mínimo (${fm.price_min}) no frontmatter mas não mencionado no corpo`);
    }
  }

  if (hasPriceData && fm.price_checked_at) {
    const dateStr = fm.price_checked_at.replace(/["']/g, "");
    const [year, month, day] = dateStr.split("-");
    const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const monthName = monthNames[Number(month) - 1];
    const normalizedBody = body.toLowerCase();
    const dateMentioned = body.includes(dateStr)
      || body.includes(`${day}/${month}/${year}`)
      || normalizedBody.includes(`${monthName} de ${year}`)
      || normalizedBody.includes(`${monthName}/${year}`);
    if (!dateMentioned) {
      logWarning(fileName, `Data de consulta de preço (${dateStr}) não mencionada no corpo`);
    }
  }
}

function checkDateConsistency(fileName, content) {
  const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (!dateMatch) {
    logWarning(fileName, "Nome do arquivo não segue padrão YYYY-MM-DD-title.md");
    return;
  }

  const fileDate = dateMatch[1];
  const fm = parseFrontmatter(content);

  if (fm?.date) {
    const fmDate = fm.date.replace(/["']/g, "").split(" ")[0]; // remove timestamp
    if (fmDate && fmDate !== fileDate) {
      logWarning(fileName, `Data no frontmatter (${fmDate}) difere da data no nome do arquivo (${fileDate})`);
    }
  }
}

function checkSources(content, fileName, fm) {
  if (!fm) return;
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const hasStructuredSources = content.match(/^sources:/m);

  // Fontes estruturadas são renderizadas de forma visível pelo layout de post.
  if (!body.match(/##\s*Fontes/i) && !body.match(/##\s*Refer[eê]ncias/i) && !hasStructuredSources) {
    logWarning(fileName, "Seção de fontes ou referências não encontrada no corpo do artigo");
  }

  // Verifica se há fontes no frontmatter
  if (!hasStructuredSources) {
    logWarning(fileName, "Campo 'sources' ausente no frontmatter");
  }
}

function checkAlternatives(content, fileName, fm) {
  if (!fm) return;
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");

  // Comparativos precisam comparar explicitamente. Reviews de portfólio usam
  // critérios de decisão e não são obrigados a promover produtos concorrentes.
  if (fm.content_type === "comparativo") {
    const altSection = body.match(/##\s*.*(Alternativas|Concorrentes|Comparativ|Comparaç|Qual escolher|Qual vence|\bvs\b|Modelos \d{4})/i);
    if (!altSection) {
      logWarning(fileName, "Comparativo sem seção explícita de comparação");
    }
  }
}

function checkForWhom(content, fileName, fm) {
  if (!fm) return;
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");

  if (fm.content_type === "review" || fm.content_type === "guia-de-compra") {
    if (!body.match(/##\s*Para quem/i)) {
      logWarning(fileName, "Seção 'Para quem é indicado' não encontrada");
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const singleFile = args[0];

  console.log("=".repeat(60));
  console.log("🔍 Validação de Posts — The Biker Blog (Manual Editorial Seção 15)");
  console.log("=".repeat(60));

  let files;

  if (singleFile) {
    const targetPath = path.resolve(singleFile);
    if (!fs.existsSync(targetPath)) {
      console.log(`❌ Arquivo não encontrado: ${targetPath}`);
      process.exit(1);
    }
    files = [path.basename(targetPath)];
    console.log(`📄 Validando: ${path.basename(targetPath)}\n`);
  } else {
    if (!fs.existsSync(POSTS_DIR)) {
      console.log("❌ Diretório _posts não encontrado.");
      process.exit(1);
    }
    files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md")).sort();
    console.log(`📁 Diretório: ${POSTS_DIR}`);
    console.log(`📄 Total de posts: ${files.length}\n`);
  }

  let validCount = 0;

  for (const file of files) {
    const fullPath = singleFile ? path.resolve(singleFile) : path.join(POSTS_DIR, file);
    const content = fs.readFileSync(fullPath, "utf-8");
    const fm = validateFrontmatter(content, file);

    if (fm) {
      validCount++;
    }

    checkSuspiciousContent(content, file, fm);
    checkImages(content, file);
    checkPriceConsistency(content, file, fm);
    checkDateConsistency(file, content);
    checkSources(content, file, fm);
    checkAlternatives(content, file, fm);
    checkForWhom(content, file, fm);

    if (!singleFile && fm) {
      // Linha de progresso compacta
      process.stdout.write(".");
    }
  }

  if (!singleFile) console.log("");

  console.log("\n" + "=".repeat(60));
  console.log(`📊 Resumo:`);
  console.log(`   ✅ Frontmatter válido: ${validCount}/${files.length}`);
  console.log(`   ❌ Erros: ${totalErrors}`);
  console.log(`   ⚠️  Avisos: ${totalWarnings}`);

  if (totalErrors > 0) {
    console.log(`\n🚨 ${totalErrors} erro(s) encontrado(s) — corrija antes de publicar novos posts.`);
  }
  if (totalWarnings > 0) {
    console.log(`\n💡 ${totalWarnings} aviso(s) — revise os itens acima.`);
  }

  console.log("=".repeat(60));

  if (totalErrors > 0) {
    process.exitCode = 1;
  }
}

main();
