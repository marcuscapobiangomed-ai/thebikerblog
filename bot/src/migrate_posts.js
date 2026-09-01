#!/usr/bin/env node
/**
 * Migração dos posts antigos para o novo formato do Manual Editorial.
 * 
 * Uso: node src/migrate_posts.js [--dry-run] [--file=arquivo.md]
 * 
 * --dry-run: apenas mostra o que seria alterado, sem salvar
 * --file: processa apenas um arquivo específico
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const POSTS_DIR = path.resolve(__dirname, "../../_posts");

const TAG_MAP = {
  "bike de estrada": "ciclismo",
  "bikes de estrada": "ciclismo",
  "bike de estrada ": "ciclismo",
  "bicicletas": "ciclismo",
  "bicicleta": "ciclismo",
  "bikes": "ciclismo",
  "bicicleta de estrada": "ciclismo",
  "bicicletas de estrada": "ciclismo",
  "ciclismo de estrada": "ciclismo",
  "ciclistas amadores": "ciclismo",
  "iniciantes": "ciclismo",
  "boas-vindas": "ciclismo",
  "orçamento": "guias-de-compra",
  "review": "reviews",
  "treino": "treinamento",
  "comparação": "comparativos",
  "bike de estrada ": "ciclismo",
  "tamanhos de bicicleta": "ciclismo",
  "scott": "ciclismo",
  "cervélo": "ciclismo",
  "trek": "ciclismo",
  "cannondale": "ciclismo",
  "specialized": "ciclismo",
  "shimano": "componentes",
  "transmissões": "componentes",
  "componentes de bike": "componentes",
  "pedais clipless": "componentes",
  "capacetes": "componentes",
  "equipamentos": "componentes",
  "sensores de potência": "componentes",
  "aplicativos": "tecnologia",
  "rodas de carbono": "componentes",
  "manutenção": "manutencao",
  "bike de estrada ": "ciclismo",
  "importação": "ciclismo",
  "rotas": "ciclismo",
  "brasil": "ciclismo",
  "worldtour": "noticias",
  "lançamentos": "noticias",
  "tendências": "noticias",
  "bikes de estrada ": "ciclismo",
  "bicicletas de estrada ": "ciclismo",
  "bike de estrada e ": "ciclismo",
  "quadros": "componentes",
  "bicicleta ": "ciclismo",
  "bicicletas ": "ciclismo",
  "compara": "comparativos",
  "scott addict": "ciclismo",
  "preço": "guias-de-compra",
  "treinamento ": "treinamento",
  "comprar": "guias-de-compra",
  "custo": "guias-de-compra",
  "upgrade": "componentes",
};

const FORBIDDEN_PHRASES = [
  { from: /\brevolucion[aá]ri[oa]\b/gi, to: "diferenciado" },
  { from: /\bperfeit[oa]\b/gi, to: "bem avaliado" },
  { from: /\bimbat[ií]vel\b/gi, to: "competitivo" },
  { from: /\btecnologia de ponta\b/gi, to: "tecnologia atual" },
  { from: /\bqualidade incompar[aá]vel\b/gi, to: "qualidade reconhecida" },
  { from: /\bcompra obrigat[oó]ria\b/gi, to: "opção recomendada" },
  { from: /\bsem d[uú]vidas\b/gi, to: "provavelmente" },
  { from: /\bvale cada centavo\b/gi, to: "bom custo-benefício" },
  { from: /\ba melhor do mercado\b/gi, to: "uma das melhores do segmento" },
  { from: /\blend[aá]ria ic[oô]nic[ao]\b/gi, to: "bicicleta de destaque" },
  { from: /\b[íi]cone do ciclismo\b/gi, to: "referência no ciclismo" },
];

function inferContentType(title, body) {
  const t = title.toLowerCase();
  const b = body.toLowerCase();

  if (t.includes("comparativo") || t.includes(" vs ") || t.match(/\bvs\b/)) return "comparativo";
  if (t.includes("guia de compra") || t.includes("melhores") || t.includes("qual escolher") || t.includes("onde comprar")) return "guia-de-compra";
  if (t.includes("como escolher") || t.includes("guia completo") || t.includes("manutenção") || t.includes("como encontrar")) return "guia-tecnico";
  if (t.includes("lançamento") || t.includes("tendência") || t.includes("o que esperar") || t.includes("o que as equipes") || t.includes("inovações")) return "noticia";
  if (b.includes("ficha técnica") || t.includes("review") || t.includes("ficha técnica")) return "review";
  if (t.includes("custa") || t.includes("quanto")) return "guia-tecnico";
  return "review";
}

function inferBrand(title, body) {
  const brands = ["scott", "cervélo", "specialized", "trek", "cannondale", "shimano", "sram", "giant", "bianchi", "orbea", "cannondale", "look", "pinarello", "wilier", "colnago", "merida", "focus", "ridley", "cube", "rose"];
  
  // Primeiro tenta no título (mais confiável)
  const titleLower = title.toLowerCase();
  for (const b of brands) {
    if (titleLower.includes(b)) return b.charAt(0).toUpperCase() + b.slice(1);
  }
  
  // Se não achou no título, tenta no início do body (primeiros 500 chars)
  const bodyStart = body.toLowerCase().substring(0, 500);
  
  // Conta ocorrências para evitar falsos positivos (ex: marca mencionada como exemplo)
  const counts = {};
  for (const b of brands) {
    const re = new RegExp(`\\b${b}\\b`, "gi");
    const matches = bodyStart.match(re);
    if (matches) {
      counts[b] = matches.length;
    }
  }
  
  // Só considera se aparecer mais de uma vez (evita menção casual)
  const entries = Object.entries(counts).filter(([_, count]) => count > 1);
  if (entries.length > 0) {
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0].charAt(0).toUpperCase() + entries[0][0].slice(1);
  }
  
  return "";
}

function inferProductName(title) {
  // Tenta extrair "Marca Modelo Ano" do título (limita a 4 palavras para o modelo)
  const match = title.match(/(Scott|Cervélo|Specialized|Trek|Cannondale|Giant|Bianchi|Orbea|Shimano|SRAM)\s+(\w[\w-]{1,30}(?:\s+\w[\w-]{1,30}){0,3})\s+(\d{4})/i);
  if (match) {
    const model = match[2].trim();
    // Ignora se capturou palavras de ligação
    if (!/^(para|em|no|de|da|do|das|dos|com|sem|por|uma|um|a$)/i.test(model)) {
      return `${match[1]} ${model}`.trim();
    }
  }
  
  // Tenta pegar o modelo principal
  const simple = title.match(/(Addict|Foil|Tarmac|Roubaix|Madone|Émonda|Domane|Supersix|SystemSix|Synapse|Caledonia|105|Ultegra|Dura-Age|Rival|Force|Red|AXS)\s*/i);
  if (simple) return simple[0].trim();
  
  return "";
}

function inferModelYear(title) {
  const match = title.match(/\b(20\d{2})\b/);
  return match ? match[1] : "";
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return ["ciclismo"];
  
  const result = [];
  const seen = new Set();
  
  for (let tag of tags) {
    tag = tag.toLowerCase().trim().replace(/["']/g, "");
    if (!tag) continue;
    
    // Mapeia para tag padronizada
    const mapped = TAG_MAP[tag] || tag;
    
    // Remove tags muito genéricas ou que não estão na lista permitida
    const allowed = ["ciclismo", "reviews", "guias-de-compra", "comparativos", "componentes", "treinamento", "manutencao", "noticias", "tecnologia"];
    if (!allowed.includes(mapped) && !allowed.includes(tag)) {
      // Tenta inferir pela palavra-chave
      if (tag.includes("review") || tag.includes("análise")) { tag = "reviews"; }
      else if (tag.includes("compara") || tag.includes("vs")) { tag = "comparativos"; }
      else if (tag.includes("guia") || tag.includes("compr") || tag.includes("orçamento") || tag.includes("preço") || tag.includes("custo")) { tag = "guias-de-compra"; }
      else if (tag.includes("component") || tag.includes("roda") || tag.includes("pedal") || tag.includes("capacete") || tag.includes("sensor") || tag.includes("quadro") || tag.includes("transmissão") || tag.includes("shimano")) { tag = "componentes"; }
      else if (tag.includes("trein") || tag.includes("app")) { tag = "treinamento"; }
      else if (tag.includes("manuten")) { tag = "manutencao"; }
      else if (tag.includes("lançamento") || tag.includes("notícia") || tag.includes("tendência") || tag.includes("worldtour") || tag.includes("inovação")) { tag = "noticias"; }
      else if (tag.includes("tecnologia")) { tag = "tecnologia"; }
      else { tag = "ciclismo"; }
    }
    
    if (!seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  
  // Garante que "ciclismo" está presente
  if (!result.includes("ciclismo")) result.unshift("ciclismo");
  
  // Limita a 4 tags
  return result.slice(0, 4);
}

function escapeYaml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/"/g, '\\"');
}

function fixBodyContent(body, contentType) {
  let fixed = body;

  // Remove linhas de frontmatter extras no corpo
  fixed = fixed.replace(/^---\n[\s\S]*?\n---\n?/, "");

  // Corrige frases proibidas
  for (const { from, to } of FORBIDDEN_PHRASES) {
    fixed = fixed.replace(from, to);
  }

  return fixed;
}

function migratePost(filePath, dryRun) {
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, "utf-8");
  
  // Parse frontmatter existente
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) {
    console.log(`  ⏭️  ${fileName}: sem frontmatter, ignorando`);
    return null;
  }

  const existingFm = fmMatch[1];
  const body = content.slice(fmMatch[0].length);

  // Parse campos existentes
  const getField = (field) => {
    const re = new RegExp(`^${field}:\\s*(.*)`, "m");
    const m = existingFm.match(re);
    return m ? m[1].replace(/^["']|["']$/g, "").trim() : "";
  };

  const existingTitle = getField("title") || fileName.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "").replace(/-/g, " ");
  const existingDescription = getField("description");
  const existingDate = getField("date") || fileName.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || new Date().toISOString().split("T")[0];
  const existingTags = (() => {
    const raw = getField("tags");
    try {
      return JSON.parse(raw.replace(/'/g, '"'));
    } catch {
      return raw.split(",").map(t => t.trim()).filter(Boolean);
    }
  })();
  const existingAuthor = getField("author") || "Equipe The Biker Blog";
  const existingImage = getField("image") || "/assets/img/logo.svg";
  const existingImageAlt = getField("image_alt") || "";
  const existingWeight = getField("weight") || "Não informado";
  const existingPrice = getField("price") || "";

  // Inferir metadados
  const contentType = inferContentType(existingTitle, body);
  const brand = getField("brand") || inferBrand(existingTitle, body);
  const productName = getField("product_name") || inferProductName(existingTitle);
  const modelYear = getField("model_year") || inferModelYear(existingTitle);
  const reviewMethod = "desk-research";
  const testedByPd = false;
  const tags = normalizeTags(existingTags);

  // Extrair price_min/max do price antigo
  let priceMin = 0, priceMax = 0, priceCurrency = "BRL";
  if (existingPrice && existingPrice !== "Não informado") {
    const priceClean = existingPrice.replace(/["']/g, "");
    const priceNums = priceClean.match(/(\d[\d.]*)/g);
    if (priceNums) {
      const vals = priceNums.map(v => parseInt(v.replace(/\./g, "")));
      priceMin = vals[0] || 0;
      priceMax = vals.length > 1 ? vals[vals.length - 1] : vals[0];
    }
    if (priceClean.includes("R$")) priceCurrency = "BRL";
  }

  // Corrigir body
  let fixedBody = fixBodyContent(body, contentType);
  fixedBody = fixedBody.replace(/^>\s*\*\*(?:Como este artigo foi produzido|Como testamos):\*\*.*(?:\r?\n){1,2}/gimu, "");

  // Remover fonte duplicada se já existe
  fixedBody = fixedBody.replace(/\n---\n\n## Fontes e metodologia[\s\S]*?(\n##|$)/, "\n$1");

  // Construir novo frontmatter
  const newFrontmatter = `---
layout: post
published: false
title: "${escapeYaml(existingTitle)}"
description: "${escapeYaml(existingDescription || existingTitle)}"
date: ${existingDate}
last_modified_at: ${existingDate}
author: "${escapeYaml(existingAuthor)}"
reviewed_by: ""
content_type: "${contentType}"
review_method: "${reviewMethod}"
tested_by_thebikerblog: ${testedByPd}
ai_assisted: true
brand: "${escapeYaml(brand)}"
product_name: "${escapeYaml(productName)}"
model_year: ${modelYear}
market: "Brasil"
weight: "${escapeYaml(existingWeight)}"
weight_source: "Fabricante"
price_min: ${priceMin}
price_max: ${priceMax}
price_currency: "${priceCurrency}"
price_checked_at: "${existingDate}"
category: "${contentType === "review" ? "reviews" : contentType}"
tags: [${tags.join(", ")}]
image: "${escapeYaml(existingImage)}"
image_alt: "${escapeYaml(existingImageAlt || existingTitle)}"
image_caption: ""
image_credit: ""
image_license: "Uso editorial autorizado pelo fabricante"
sources:
  - name: "${brand || "Fabricante"}"
    type: "manufacturer"
    url: ""
    accessed_at: "${existingDate}"
  - name: "Pesquisa de mercado"
    type: "market-research"
    url: ""
    accessed_at: "${existingDate}"
affiliate_links: false
editorial_status: "draft"
---

`;

  const newContent = newFrontmatter + fixedBody.trim() + "\n";

  if (dryRun) {
    console.log(`\n📄 ${fileName}:`);
    console.log(`   Título: ${existingTitle}`);
    console.log(`   Tipo: ${contentType} | Brand: ${brand} | Produto: ${productName} | Ano: ${modelYear}`);
    console.log(`   Tags: ${tags.join(", ")}`);
    console.log(`   Preço: ${priceCurrency} ${priceMin} - ${priceMax}`);
    return null;
  }

  // Salvar
  fs.writeFileSync(filePath, newContent, "utf-8");
  return { fileName, contentType, brand, productName };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const singleFile = args.find(a => a.startsWith("--file="))?.split("=")[1];

  console.log("=".repeat(60));
  console.log(dryRun ? "🔍 MIGRAÇÃO — MODO DRY RUN (nada será salvo)" : "🔄 MIGRAÇÃO DE POSTS — Manual Editorial");
  console.log("=".repeat(60));

  if (!fs.existsSync(POSTS_DIR)) {
    console.log("❌ Diretório _posts não encontrado.");
    process.exit(1);
  }

  let files;
  if (singleFile) {
    const fp = path.resolve(singleFile);
    if (!fs.existsSync(fp)) { console.log(`❌ Arquivo não encontrado: ${fp}`); process.exit(1); }
    files = [fp];
  } else {
    files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith(".md")).sort().map(f => path.join(POSTS_DIR, f));
  }

  console.log(`📄 Posts a processar: ${files.length}\n`);

  let updated = 0;
  let errors = 0;

  for (const fp of files) {
    try {
      const result = migratePost(fp, dryRun);
      if (result) {
        console.log(`  ✅ ${result.fileName}`);
        updated++;
      }
    } catch (err) {
      console.log(`  ❌ ${path.basename(fp)}: ${err.message}`);
      errors++;
    }
  }

  console.log("\n" + "=".repeat(60));
  if (dryRun) {
    console.log(`📊 Modo DRY RUN — nenhum arquivo foi alterado.`);
    console.log(`   Remova --dry-run para aplicar as alterações.`);
  } else {
    console.log(`📊 Atualizados: ${updated} | Erros: ${errors}`);
  }
  console.log("=".repeat(60));
}

main();
