import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { hammingDistance } from "../bot/src/images/dedupe.js";
import * as yaml from "js-yaml";
import { imageArticleConsistencyErrors } from "../bot/src/validation/image-article-consistency.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "_posts");
const ARCHIVED_DIR = path.join(POSTS_DIR, "archived");
const DRAFTS_DIR = path.join(POSTS_DIR, "drafts");

const errors = [];
const warnings = [];
const activeImages = [];
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "content/product-discovery/thebiker-media-catalog.json"), "utf8"));
const imageLibrary = JSON.parse(fs.readFileSync(path.join(ROOT, "content/image-library/index.json"), "utf8"));
const imageLibraryByAssetId = new Map((imageLibrary.assets || []).map((asset) => [asset.assetId, asset]));
const campaign = JSON.parse(fs.readFileSync(path.join(ROOT, "bot/editorial-campaign.json"), "utf8"));
const campaignById = new Map(campaign.items.map((item) => [item.id, item]));

function parseFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return null;
  return yaml.load(match[1]);
}

function getField(fm, field) {
  return fm?.[field] ?? null;
}

function walkPosts(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".md")).map(f => path.join(dir, f));
}

function resolvePath(imageField) {
  if (!imageField) return null;
  const p = path.join(ROOT, imageField.replace(/^\//, ""));
  return fs.existsSync(p) ? p : null;
}

function getFileSize(filePath) {
  try {
    return Math.round(fs.statSync(filePath).size / 1024);
  } catch {
    return null;
  }
}

function validatePost(postPath) {
  const rel = path.relative(ROOT, postPath);
  const fm = parseFrontmatter(postPath);
  if (!fm) return;

  const image = getField(fm, "image");
  const thumbnail = getField(fm, "thumbnail");
  const credit = getField(fm, "image_credit");
  const license = getField(fm, "image_license");
  const editorialStatus = String(getField(fm, "editorial_status") || "");
  const workflowStatus = String(getField(fm, "status") || "");
  const published = getField(fm, "published");
  const isArchived = postPath.startsWith(`${ARCHIVED_DIR}${path.sep}`);
  const isActive = !isArchived && (
    workflowStatus === "scheduled" || editorialStatus === "scheduled" || published === true ||
    (published !== false && (workflowStatus === "published" || editorialStatus === "published"))
  );

  if (!image) {
    if (isActive) errors.push(`${rel}: campo "image" obrigatório`);
    return;
  }

  if (image === "/assets/img/logo.svg") {
    if (isActive) errors.push(`${rel}: usando logo padrão — sem imagem real`);
    return;
  }

  const imgPath = resolvePath(image);
  if (!imgPath) {
    if (isActive) errors.push(`${rel}: imagem não encontrada: ${image}`);
    return;
  }

  // File exists
  const sizeKB = getFileSize(imgPath);

  const heroLimitKB = path.extname(imgPath).toLowerCase() === ".png" ? 1800 : 300;
  if (sizeKB !== null && sizeKB > heroLimitKB) {
    warnings.push(`${rel}: imagem muito grande (${sizeKB}KB > ${heroLimitKB}KB): ${image}`);
  }

  if (!credit) {
    if (isActive) errors.push(`${rel}: image_credit obrigatório`);
  }

  if (!license) {
    if (isActive) errors.push(`${rel}: image_license obrigatório`);
  }

  if (!thumbnail) {
    warnings.push(`${rel}: thumbnail não definido — será usada a imagem hero`);
  } else {
    const thumbPath = resolvePath(thumbnail);
    if (!thumbPath) {
      warnings.push(`${rel}: thumbnail não encontrado: ${thumbnail}`);
    } else {
      const thumbKB = getFileSize(thumbPath);
      if (thumbKB !== null && thumbKB > 80) {
        warnings.push(`${rel}: thumbnail muito grande (${thumbKB}KB > 80KB): ${thumbnail}`);
      }
    }
  }

  if (isActive) {
    const manifestPath = path.join(path.dirname(imgPath), "image-manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      errors.push(`${rel}: manifesto de imagem ausente ou inválido`);
      return;
    }
    if (manifest.schemaVersion !== 2 || manifest.status !== "approved" || manifest.editorialUse !== "publishable") {
      errors.push(`${rel}: imagem ativa exige manifesto v2 aprovado e publicável`);
    }
    if (!manifest.source || !["thebiker", "manufacturer", "own-production"].includes(manifest.source.type)) {
      errors.push(`${rel}: fonte visual ativa não autorizada (${manifest.source?.type || "indefinida"})`);
    }
    const postId = path.basename(postPath, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
    for (const error of imageArticleConsistencyErrors({
      article: fm,
      manifest,
      campaignItem: campaignById.get(postId) || null,
      catalog,
      archivedAsset: published === true ? imageLibraryByAssetId.get(manifest.assetId) || null : null,
    })) {
      errors.push(`${rel}: ${error}`);
    }
    const digest = crypto.createHash("sha256").update(fs.readFileSync(imgPath)).digest("hex");
    activeImages.push({ rel, digest, assetId: manifest.assetId, perceptualHash: manifest.perceptualHash });
  }
}

function main() {
  const allPosts = [
    ...walkPosts(POSTS_DIR),
    ...walkPosts(ARCHIVED_DIR),
    ...walkPosts(DRAFTS_DIR),
  ];

  for (const postPath of allPosts) {
    validatePost(postPath);
  }

  for (let left = 0; left < activeImages.length; left += 1) {
    for (let right = left + 1; right < activeImages.length; right += 1) {
      if (activeImages[left].digest === activeImages[right].digest) {
        errors.push(`${activeImages[left].rel} e ${activeImages[right].rel}: imagem ativa duplicada`);
      }
      if (activeImages[left].assetId && activeImages[left].assetId === activeImages[right].assetId) {
        errors.push(`${activeImages[left].rel} e ${activeImages[right].rel}: asset visual ativo reutilizado`);
      }
      if (hammingDistance(activeImages[left].perceptualHash, activeImages[right].perceptualHash) <= 3) {
        errors.push(`${activeImages[left].rel} e ${activeImages[right].rel}: composição visual ativa repetida`);
      }
    }
  }

  if (errors.length) {
    console.log(`\n❌ ERROS (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e}`);
  }

  if (warnings.length) {
    console.log(`\n⚠️  AVISOS (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }

  console.log(`\n📊 Total: ${allPosts.length} posts | ${errors.length} erros | ${warnings.length} avisos`);

  if (errors.length) process.exit(1);
}

main();
