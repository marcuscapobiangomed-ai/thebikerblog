#!/usr/bin/env node
/**
 * Script para testar a geração de posts sem o WhatsApp.
 * Uso: node src/manual.js "descrição do caso"
 */
import "dotenv/config";
import { AIProvider } from "./gemini.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncProductKnowledge } from "./knowledge/product-knowledge.js";
import { assertMarkdownPublicationGates } from "./validation/markdown-publication-gates.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function safeManualDraftPath(value, { root = repositoryRoot } = {}) {
  const requested = path.resolve(root, String(value || ""));
  const allowedRoots = [path.join(root, "_generated"), path.join(root, "_posts", "drafts")];
  if (!allowedRoots.some((allowed) => requested.startsWith(`${allowed}${path.sep}`))) {
    throw new Error("--output deve permanecer em _generated/ ou _posts/drafts/");
  }
  if (path.extname(requested).toLowerCase() !== ".md") throw new Error("--output precisa ser um arquivo .md");
  return requested;
}

const args = process.argv.slice(2);
const researchArg = args.find((arg) => arg.startsWith("--research="));
const outputArg = args.find((arg) => arg.startsWith("--output="));
const descricao = args.filter((arg) => !arg.startsWith("--research=") && !arg.startsWith("--output=")).join(" ");

if (!descricao) {
  console.log('Uso: node src/manual.js "tema do artigo" --research=caminho/para/ficha.json');
  process.exit(1);
}

if (!researchArg) {
  console.error("A geração exige --research=<arquivo.json>. Nenhuma API foi chamada.");
  process.exit(1);
}

const researchPath = researchArg.slice("--research=".length);
const researchData = JSON.parse(fs.readFileSync(researchPath, "utf8"));

console.log("🤖 Processando artigo com Groq, Gemini e DeepSeek...\n");
console.log(`📝 Descrição: "${descricao}"\n`);

const ai = new AIProvider();
const post = await ai.processCase(descricao, researchData);
const knowledge = await syncProductKnowledge(researchData);

console.log("📄 Artigo gerado:");
console.log("-".repeat(40));
console.log(`Título: ${post.title}`);
console.log(`Slug: ${post.slug}`);
console.log(`Pipeline: ${JSON.stringify(post.pipelineMetadata?.providers || {})}`);
console.log(`Base técnica: ${knowledge?.repositoryPath || "sem produto estruturado"}`);
console.log("-".repeat(40));
console.log("\nConteúdo:\n");
console.log(post.content);

if (outputArg) {
  assertMarkdownPublicationGates(post.content);
  if (!/^published:\s*false\s*$/mu.test(post.content)
      || !/^editorial_status:\s*["']?draft["']?\s*$/mu.test(post.content)) {
    throw new Error("Rascunho manual bloqueado: exige published: false e editorial_status: draft");
  }
  const outputPath = safeManualDraftPath(outputArg.slice("--output=".length));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, post.content, "utf8");
  console.log(`\nRascunho seguro salvo em: ${path.relative(repositoryRoot, outputPath)}`);
}

console.log("\n🔒 Rascunho local. Nenhum PR foi criado e nada foi publicado.");
