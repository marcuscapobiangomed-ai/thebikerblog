import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { produceCampaignVisual } from "../bot/src/campaign_finalize.js";
import { refreshReceiptAfterDeterministicTransform } from "../bot/src/validation/editorial-receipt.js";
import { assertVisualDecision, issueVisualDecision } from "../bot/src/validation/visual-decision.js";
import * as yaml from "js-yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function articleData(content) {
  const match = String(content).match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("Frontmatter ausente");
  return yaml.load(match[1]);
}

function setField(content, field, value) {
  const pattern = new RegExp(`^${field}:.*$`, "m");
  if (!pattern.test(content)) throw new Error(`Frontmatter obrigatório ausente: ${field}`);
  return content.replace(pattern, `${field}: ${value}`);
}

function setOptionalField(content, field, value) {
  const pattern = new RegExp(`^${field}:.*(?:\\r?\\n)?`, "m");
  if (value === null) return content.replace(pattern, "");
  if (pattern.test(content)) return content.replace(pattern, `${field}: ${value}\n`);
  return content.replace(/^---\s*\r?\n/, (opening) => `${opening}${field}: ${value}\n`);
}

async function postPathFor(item) {
  const declared = item.postPath ? path.join(root, item.postPath) : "";
  if (declared) {
    try { await fs.access(declared); return declared; } catch {}
  }
  const filename = `${item.publishDate}-${item.id}.md`;
  for (const candidate of [path.join(root, "_posts", filename), path.join(root, "_posts/drafts", filename)]) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  throw new Error(`Post não encontrado para ${item.id}`);
}

async function main() {
  const campaignPath = path.join(root, "bot/editorial-campaign.json");
  const campaign = JSON.parse(await fs.readFile(campaignPath, "utf8"));
  const requested = new Set(process.argv.slice(2));
  const selected = campaign.items.filter((item) =>
    ["published", "scheduled"].includes(item.status) &&
    (requested.size === 0 || requested.has(item.id)),
  );
  const failures = [];
  const catalog = JSON.parse(await fs.readFile(path.join(root, "content/product-discovery/thebiker-media-catalog.json"), "utf8"));
  for (const item of selected) {
    try {
      const approvedAt = new Date().toISOString().slice(0, 10);
      const image = await produceCampaignVisual({ root, item, approvedAt, force: true });
      const postPath = await postPathFor(item);
      let content = await fs.readFile(postPath, "utf8");
      content = setField(content, "image", `"${image.publicBase}/${image.manifest.files.hero.file}"`);
      content = setField(content, "image_mobile", `"${image.publicBase}/${image.manifest.files.mobile.file}"`);
      content = setField(content, "thumbnail", `"${image.publicBase}/${image.manifest.files.card.file}"`);
      content = setField(content, "image_asset_type", `"${image.manifest.assetType}"`);
      content = setField(content, "image_status", '"approved"');
      content = setField(content, "image_alt", `"${image.manifest.alt.replace(/"/g, '\\"')}"`);
      content = setField(content, "image_caption", `"${image.manifest.caption.replace(/"/g, '\\"')}"`);
      content = setField(content, "image_credit", `"${image.manifest.credit.replace(/"/g, '\\"')}"`);
      content = setField(content, "image_license", `"${image.manifest.source.license.replace(/"/g, '\\"')}"`);
      content = setOptionalField(
        content,
        "image_subject_id",
        image.manifest.factualSubject === "exact-product" ? `"${image.manifest.matchedProduct.id}"` : null,
      );
      await fs.writeFile(postPath, content);
      if (image.manifest.factualSubject === "exact-product") {
        await fs.rm(path.join(root, "assets/img/posts", item.id, "source.svg"), { force: true });
      }
      item.postPath = path.relative(root, postPath).replace(/\\/g, "/");
      item.imageManifestPath = `assets/img/posts/${item.id}/image-manifest.json`;
      item.imageStatus = "approved";
      item.imageAssetIds = image.manifest.assetId ? [image.manifest.assetId] : [];
      item.imageValidatedAt = new Date().toISOString();
      item.editorialReceipt = refreshReceiptAfterDeterministicTransform({ content, item }) || item.editorialReceipt;
      item.visualDecision = issueVisualDecision({ item, article: articleData(content), manifest: image.manifest, catalog, now: new Date() });
      assertVisualDecision({ receipt: item.visualDecision, item, article: articleData(content), manifest: image.manifest, catalog });
      console.log(`✅ ${item.id}: ${image.manifest.matchedProduct?.name || "capa conceitual própria"}`);
    } catch (error) {
      failures.push(`${item.id}: ${error.message}`);
      console.error(`❌ ${item.id}: ${error.message}`);
    }
  }
  await fs.writeFile(campaignPath, JSON.stringify(campaign, null, 2) + "\n");
  if (failures.length > 0) throw new Error(`Recalibração incompleta:\n${failures.join("\n")}`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
