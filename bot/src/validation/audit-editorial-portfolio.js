#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { canonicalPortfolioBrand, isPortfolioBrand } from "../portfolio-policy.js";
import { editorialWordRange } from "../editorial-length-policy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postsDir = path.resolve(__dirname, "../../../_posts");
const KNOWN_COMPETITORS = ["Caloi", "Cannondale", "Cervélo", "Sense", "Specialized", "Trek"];

function listMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdown(target);
    return entry.isFile() && entry.name.endsWith(".md") ? [target] : [];
  });
}

function words(text) {
  return (String(text).match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []).length;
}

function detectBrands(data, raw) {
  const declared = String(data.brand || "")
    .split(/\s*\/\s*|\s*,\s*|\s+vs\.?\s+/i)
    .map((brand) => brand.trim())
    .filter(Boolean);
  const detectedCompetitors = KNOWN_COMPETITORS.filter((brand) => new RegExp(`\\b${brand}\\b`, "iu").test(raw));
  return {
    declared: [...new Set(declared)],
    mentionedCompetitors: [...new Set(detectedCompetitors)],
  };
}

const rows = listMarkdown(postsDir).map((file) => {
  const raw = fs.readFileSync(file, "utf8");
  const parsed = matter(raw);
  const relative = path.relative(path.dirname(postsDir), file).replaceAll("\\", "/");
  const brands = detectBrands(parsed.data, raw);
  const blockedPrimaryBrands = brands.declared.filter((brand) => !isPortfolioBrand(brand));
  const portfolioBrands = brands.declared.map(canonicalPortfolioBrand).filter(Boolean);
  const headingCount = (parsed.content.match(/^##\s+/gm) || []).length;
  const sourceLinkCount = (parsed.content.match(/^[-*]\s+.*https?:\/\//gim) || []).length;
  const contentWords = words(parsed.content);
  const wordRange = editorialWordRange(String(parsed.data.content_type || ""));
  const beginnerSignals = (parsed.content.match(/\b(iniciante|primeira bike|começando|começar)\b/giu) || []).length;
  const isPublished = parsed.data.published !== false;
  const isInactiveDirectory = relative.includes("/archived/") || relative.includes("/drafts/");
  const declaresDraft = parsed.data.status === "draft" || parsed.data.editorial_status === "draft";
  const isRaceCoverage = ["previa-corrida", "resumo-corrida", "calendario-provas", "guia-prova"].includes(String(parsed.data.content_type || ""));
  const unsafeCompetitorMention = brands.mentionedCompetitors.length > 0 && !isRaceCoverage;
  let disposition = "aprovado";
  const commercialList = /\b(melhor|melhores|onde comprar|vale o investimento|qual escolher)\b/iu.test(String(parsed.data.title || ""));
  if (declaresDraft && isPublished) disposition = "despublicar-status-inconsistente";
  else if (isInactiveDirectory && isPublished) disposition = "despublicar-diretorio-inativo";
  else if (blockedPrimaryBrands.length > 0) disposition = isPublished ? "despublicar" : "despublicado";
  else if (unsafeCompetitorMention && isPublished) disposition = "despublicar-mencao-concorrente";
  else if (commercialList && brands.mentionedCompetitors.length > 0) disposition = "reescrever-promocao";
  else if (brands.mentionedCompetitors.length > 0) disposition = "auditar-mencao-contextual";
  else if (beginnerSignals > 2) disposition = "reduzir-foco-iniciante";
  else if (sourceLinkCount < 2) disposition = "adicionar-fontes";
  else if (contentWords < wordRange.min || headingCount < 5) disposition = "aprofundar";
  else if (contentWords > wordRange.max) disposition = "condensar";

  return {
    file: relative,
    title: String(parsed.data.title || "Sem título"),
    contentType: String(parsed.data.content_type || "não informado"),
    published: isPublished,
    isInactiveDirectory,
    declaresDraft,
    words: contentWords,
    h2: headingCount,
    sourceLinks: sourceLinkCount,
    portfolioBrands,
    blockedPrimaryBrands,
    mentionedCompetitors: brands.mentionedCompetitors,
    unsafeCompetitorMention,
    beginnerSignals,
    disposition,
  };
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log("# Auditoria editorial do acervo TheBiker\n");
  console.log(`Posts auditados: ${rows.length}`);
  console.log(`Publicados: ${rows.filter((row) => row.published).length}`);
  console.log(`Com concorrente como marca principal: ${rows.filter((row) => row.blockedPrimaryBrands.length > 0).length}`);
  console.log(`Com concorrente mencionado no texto: ${rows.filter((row) => row.mentionedCompetitors.length > 0).length}\n`);
  console.log("| Arquivo | Tipo | Palavras | H2 | Fontes | Marca principal bloqueada | Concorrentes mencionados | Decisão inicial |");
  console.log("|---|---|---:|---:|---:|---|---|---|");
  for (const row of rows) {
    console.log(`| ${row.file} | ${row.contentType} | ${row.words} | ${row.h2} | ${row.sourceLinks} | ${row.blockedPrimaryBrands.join(", ") || "—"} | ${row.mentionedCompetitors.join(", ") || "—"} | ${row.disposition} |`);
  }
}

if (rows.some((row) => row.published && (
  row.blockedPrimaryBrands.length > 0 || row.isInactiveDirectory || row.unsafeCompetitorMention || row.declaresDraft
))) {
  process.exitCode = 1;
}
