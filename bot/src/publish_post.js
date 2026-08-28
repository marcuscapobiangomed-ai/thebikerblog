#!/usr/bin/env node
/**
 * Promove um post de draft para published.
 *
 * Uso: node src/publish_post.js <caminho-ou-slug>
 *
 * Exemplo:
 *   node src/publish_post.js _posts/2026-07-20-meu-post.md
 *   node src/publish_post.js meu-post
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import { validateImageManifestV2 } from "./validation/image-manifest-v2.js";
import { assertImageArticleConsistency } from "./validation/image-article-consistency.js";
import { linkTheBikerProducts, loadTheBikerLinkData } from "./editorial/product-linker.js";
import { assertAutomatedReviewer } from "./validation/editorial-receipt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const POSTS_DIR = path.resolve(__dirname, "../../_posts");
const ROOT_DIR = path.resolve(__dirname, "../..");

function main() {
  const target = process.argv[2];
  if (!target) {
    console.log("Uso: node src/publish_post.js <slug-ou-caminho>");
    process.exit(1);
  }

  let filePath;
  if (target.includes(".md") || target.includes("/")) {
    filePath = path.resolve(target);
  } else {
    // Procura por slug no nome do arquivo
    const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md") && f.includes(target));
    if (files.length === 0) {
      console.log(`❌ Nenhum post encontrado com slug "${target}"`);
      process.exit(1);
    }
    if (files.length > 1) {
      console.log(`❌ Múltiplos posts encontrados: ${files.join(", ")}`);
      process.exit(1);
    }
    filePath = path.join(POSTS_DIR, files[0]);
  }

  let content = fs.readFileSync(filePath, "utf8");
  const parsed = matter(content);

  if (parsed.data.ai_assisted === true) {
    if (parsed.data.editorial_status !== "approved") {
      console.error("❌ Publicação bloqueada: editorial_status precisa ser approved.");
      process.exit(1);
    }
    try {
      assertAutomatedReviewer(parsed.data);
    } catch (error) {
      console.error(`❌ Publicação bloqueada: ${error.message}`);
      process.exit(1);
    }
    if (parsed.data.image_manifest_version !== 2) {
      console.error("❌ Publicação bloqueada: image_manifest_version precisa ser 2.");
      process.exit(1);
    }

    const imagePath = String(parsed.data.image || "").replace(/^\//, "");
    const absoluteImage = path.resolve(ROOT_DIR, imagePath);
    if (!absoluteImage.startsWith(ROOT_DIR + path.sep)) {
      console.error("❌ Publicação bloqueada: caminho de imagem inválido.");
      process.exit(1);
    }
    const manifestPath = path.join(path.dirname(absoluteImage), "image-manifest.json");
    if (!fs.existsSync(manifestPath)) {
      console.error("❌ Publicação bloqueada: image-manifest.json ausente.");
      process.exit(1);
    }
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const validatedManifest = validateImageManifestV2(
        manifest,
        path.dirname(manifestPath),
        { requirePublishable: true },
      );
      const catalog = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "content/product-discovery/thebiker-media-catalog.json"), "utf8"));
      assertImageArticleConsistency({ article: parsed.data, manifest: validatedManifest, catalog });
    } catch (error) {
      console.error(`❌ Publicação bloqueada: ${error.message}`);
      process.exit(1);
    }
  }

  const linkResult = linkTheBikerProducts(content, loadTheBikerLinkData(ROOT_DIR));
  content = linkResult.content;
  content = content.replace(/^published:\s*false\s*$/m, "published: true");
  content = content.replace(/^editorial_status:\s*["']?approved["']?\s*$/m, 'editorial_status: "published"');

  // Troca status: draft por status: published
  if (content.includes("status: draft")) {
    content = content.replace("status: draft", "status: published");
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`✅ Post promovido para published: ${path.basename(filePath)} (${linkResult.links.length} links TheBiker)`);
  } else if (content.includes("status: published")) {
    console.log(`ℹ️  Post já está published: ${path.basename(filePath)}`);
  } else {
    // Adiciona status: published se não existir
    content = content.replace(/^layout: post/m, "status: published\nlayout: post");
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`✅ Status adicionado (published): ${path.basename(filePath)}`);
  }
}

main();
