import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { CampaignSchema, publicCampaignSummary } from "./automation/campaign.js";
import { produceOfficialCampaignImage } from "./images/official-campaign-image.js";
import { linkTheBikerProducts, loadTheBikerLinkData } from "./editorial/product-linker.js";
import { assertMarkdownPublicationGates } from "./validation/markdown-publication-gates.js";
import { assertImageArticleConsistency } from "./validation/image-article-consistency.js";
import { assertReviewedContentIntegrity, issueEditorialReceipt } from "./validation/editorial-receipt.js";
import { classifyEditorialFailure } from "./validation/editorial-failures.js";
import { assertVisualDecision, issueVisualDecision } from "./validation/visual-decision.js";
import { alignCampaignVisual } from "./images/align-campaign-visual.js";
import { releaseAssetUse } from "./images/asset-library.js";
import { createStagedWorkspace, discardStagedWorkspace, promoteStagedPaths } from "./automation/file-transaction.js";
import { assertResearchEvidenceContract, assertResearchGrounding } from "./validation/research-grounding.js";
import { assertArticleResearchGrounding } from "./validation/article-research-grounding.js";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function persist(root, campaign) {
  await fs.mkdir(path.join(root, "bot"), { recursive: true });
  await fs.mkdir(path.join(root, "_data"), { recursive: true });
  await fs.writeFile(path.join(root, "bot/editorial-campaign.json"), JSON.stringify(campaign, null, 2) + "\n");
  await fs.writeFile(path.join(root, "_data/editorial-calendar.json"), JSON.stringify(publicCampaignSummary(campaign), null, 2) + "\n");
}

function setField(content, field, value) {
  const line = `${field}: ${value}`;
  const pattern = new RegExp(`^${field}:.*$`, "m");
  if (!pattern.test(content)) throw new Error(`Frontmatter obrigatório ausente: ${field}`);
  return content.replace(pattern, line);
}

function setOptionalField(content, field, value) {
  const pattern = new RegExp(`^${field}:.*(?:\\r?\\n)?`, "m");
  if (value === null) return content.replace(pattern, "");
  if (pattern.test(content)) return content.replace(pattern, `${field}: ${value}\n`);
  return content.replace(/^---\s*\r?\n/, (opening) => `${opening}${field}: ${value}\n`);
}

export function normalizeCategoryExamplePromotion(content, item) {
  if (item?.heroImage?.relationship !== "category-example") return content;
  const parsed = matter(content);
  if (parsed.data.editorial_scope !== "portfolio") return content;
  let normalized = setField(content, "brand", '""');
  normalized = setField(normalized, "promoted_brands", "[]");
  return normalized;
}

export async function cleanupFailedFinalization(root, item) {
  const draftRoot = path.resolve(root, "_posts/drafts") + path.sep;
  const draftPath = item.postPath ? path.resolve(root, item.postPath) : null;
  if (draftPath?.startsWith(draftRoot)) await fs.rm(draftPath, { force: true });

  await fs.rm(path.join(root, "content/research/campaign", `${item.id}.json`), { force: true });
  await releaseAssetUse(root, { postId: item.id, position: "hero" });
  await fs.rm(path.join(root, "assets/img/posts", item.id), { recursive: true, force: true });

  delete item.postPath;
  delete item.aiReview;
  delete item.editorialReceipt;
  delete item.visualDecision;
  delete item.imageManifestPath;
  delete item.imageStatus;
  delete item.imageValidatedAt;
  item.imageAssetIds = [];
}

export async function produceCampaignVisual({ root, item, approvedAt, force = false }) {
  const visualPolicy = item.heroImage || { mode: "conceptual" };
  if (!["exact-product", "real-context"].includes(visualPolicy.mode)) {
    throw new Error(`Politica visual ${visualPolicy.mode}: agendamento exige fotografia real explicitamente vinculada`);
  }
  const productIds = visualPolicy.mode === "real-context"
    ? [...new Set([visualPolicy.productId, ...(item.productIds || [])])]
    : [visualPolicy.productId];
  const cover = await produceOfficialCampaignImage({
    root,
    item: { ...item, productIds },
    approvedAt,
    force,
  });
  // A category-example image may use another real product when the preferred
  // asset is already consumed. Keep the policy and audit trail aligned with
  // the product that actually passed the image gates.
  if (visualPolicy.mode === "real-context" && cover.manifest.matchedProduct?.id) {
    item.heroImage = { ...visualPolicy, productId: cover.manifest.matchedProduct.id };
  }
  return cover;
}

async function finalizeInWorkspace({ root, now, imageProducer }) {
  const campaignPath = path.join(root, "bot/editorial-campaign.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, "utf8")));
  const item = campaign.items.find((candidate) => candidate.status === "validation") || null;
  if (!item) return { status: "idle", message: "Nenhuma pauta aguardando validação final" };
  if (!item.postPath) throw new Error(`Pauta ${item.id} sem postPath`);
  const approvedAt = now.toISOString().slice(0, 10);
  try {
    const absolutePost = path.resolve(root, item.postPath);
    const draftRoot = path.resolve(root, "_posts/drafts") + path.sep;
    if (!absolutePost.startsWith(draftRoot)) throw new Error(`postPath inseguro: ${item.postPath}`);
    let content = await fs.readFile(absolutePost, "utf8");
    const researchPath = path.join(root, "content/research/campaign", `${item.id}.json`);
    const research = JSON.parse(await fs.readFile(researchPath, "utf8"));
    assertResearchGrounding(research, { requireFactReferences: true });
    assertResearchEvidenceContract(research);
    assertArticleResearchGrounding({ content, research });
    assertReviewedContentIntegrity(content, item.aiReview);
    const parsed = matter(content);
    if (parsed.data.published !== false) throw new Error("Rascunho precisa permanecer com published: false");
    if (!Array.isArray(parsed.data.sources) || parsed.data.sources.length === 0) throw new Error("Post sem fontes editoriais");
    const directAnswer = String(parsed.data.direct_answer || "").trim();
    if (directAnswer.length < 80 || directAnswer.length > 420) throw new Error("Post sem resposta direta válida entre 80 e 420 caracteres");
    if (parsed.data.faq !== undefined && (!Array.isArray(parsed.data.faq) || parsed.data.faq.length > 5)) {
      throw new Error("FAQ precisa ser uma lista de até cinco perguntas visíveis");
    }
    if ((parsed.content.match(/^##\s+/gm) || []).length < 5) throw new Error("Post com menos de cinco seções");
    if (item.aiReview?.finalScore !== null && item.aiReview?.finalScore !== undefined && item.aiReview.finalScore < 90) {
      throw new Error(`Nota editorial final insuficiente: ${item.aiReview.finalScore}`);
    }
    if ((item.aiReview?.finalBlockers || 0) > 0) throw new Error("Auditoria editorial final ainda possui bloqueadores");
    assertMarkdownPublicationGates(content);
    content = normalizeCategoryExamplePromotion(content, item);
    const normalizedArticle = matter(content).data;
    const [catalog, library] = await Promise.all([
      fs.readFile(path.join(root, "content/product-discovery/thebiker-media-catalog.json"), "utf8").then(JSON.parse),
      fs.readFile(path.join(root, "content/image-library/index.json"), "utf8").then(JSON.parse)
        .catch((error) => error?.code === "ENOENT" ? { assets: [] } : Promise.reject(error)),
    ]);
    const visualAlignment = alignCampaignVisual({ item, article: normalizedArticle, catalog, library });
    const cover = await imageProducer({ root, item, approvedAt });
    content = setField(content, "date", item.publishDate);
    content = setField(content, "last_modified_at", approvedAt);
    content = setField(content, "image", `"${cover.publicBase}/${cover.manifest.files.hero.file}"`);
    content = setField(content, "image_mobile", `"${cover.publicBase}/${cover.manifest.files.mobile.file}"`);
    content = setField(content, "thumbnail", `"${cover.publicBase}/${cover.manifest.files.card.file}"`);
    content = setField(content, "image_asset_type", `"${cover.manifest.assetType}"`);
    content = setField(content, "image_status", '"approved"');
    content = setField(content, "image_alt", `"${cover.manifest.alt.replace(/"/g, '\\"')}"`);
    content = setField(content, "image_caption", `"${cover.manifest.caption}"`);
    content = setField(content, "image_credit", `"${cover.manifest.credit.replace(/"/g, '\\"')}"`);
    content = setField(content, "image_license", `"${cover.manifest.source.license.replace(/"/g, '\\"')}"`);
    content = setOptionalField(
      content,
      "image_subject_id",
      cover.manifest.factualSubject === "exact-product" ? `"${cover.manifest.matchedProduct.id}"` : null,
    );
    content = setField(content, "reviewed_by", '"TheBiker AI Editorial Gate"');
    content = setField(content, "editorial_status", '"reviewed"');
    content = setField(content, "status", '"scheduled"');
    const article = matter(content).data;
    assertImageArticleConsistency({ article, manifest: cover.manifest, campaignItem: item, catalog });
    item.visualDecision = issueVisualDecision({ item, article, manifest: cover.manifest, catalog, now });
    assertVisualDecision({ receipt: item.visualDecision, item, article, manifest: cover.manifest, catalog });
    let linkData;
    try {
      linkData = loadTheBikerLinkData(root);
    } catch (error) {
      if (root === defaultRoot || error?.code !== "ENOENT") throw error;
      linkData = loadTheBikerLinkData(defaultRoot);
    }
    const linkResult = linkTheBikerProducts(content, linkData);
    content = linkResult.content;
    if (/\/assets\/img\/system\/covers\//.test(content.split("---", 3)[1] || "")) throw new Error("Fallback de imagem ainda presente no frontmatter");
    assertMarkdownPublicationGates(content);
    const receiptResearchPath = path.join(root, "content/research/campaign", `${item.id}.json`);
    const researchContent = await fs.readFile(receiptResearchPath, "utf8").catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
    item.editorialReceipt = issueEditorialReceipt({ content, researchContent, aiReview: item.aiReview, now, origin: "pipeline" });
    await fs.writeFile(absolutePost, content);
    item.imageManifestPath = `assets/img/posts/${item.id}/image-manifest.json`;
    item.imageStatus = "approved";
    item.imageAssetIds = cover.manifest.assetId ? [cover.manifest.assetId] : [];
    item.imageValidatedAt = now.toISOString();
    item.status = "scheduled";
    delete item.blockReason;
    delete item.failure;
    await persist(root, campaign);
    return {
      status: "scheduled",
      itemId: item.id,
      publishDate: item.publishDate,
      imageManifestPath: item.imageManifestPath,
      theBikerLinks: linkResult.links.length,
      visualAlignment,
    };
  } catch (error) {
    item.status = "blocked";
    item.failure = classifyEditorialFailure(error, { stage: "finalization", now });
    item.blockReason = `Validação final: [${item.failure.code}] ${item.failure.message}`;
    await cleanupFailedFinalization(root, item);
    await persist(root, campaign);
    throw error;
  }
}

async function recordSafeFailure(root, itemId, error, now) {
  const campaignPath = path.join(root, "bot/editorial-campaign.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, "utf8")));
  const item = campaign.items.find((candidate) => candidate.id === itemId);
  if (!item) throw error;
  item.status = "blocked";
  item.failure = classifyEditorialFailure(error, { stage: "finalization", now });
  item.blockReason = `Validação final: [${item.failure.code}] ${item.failure.message}`;
  delete item.editorialReceipt;
  delete item.visualDecision;
  delete item.imageManifestPath;
  delete item.imageStatus;
  delete item.imageValidatedAt;
  item.imageAssetIds = [];
  await persist(root, campaign);
}

export async function finalizeCampaignItem({
  root = defaultRoot,
  now = new Date(),
  imageProducer = produceCampaignVisual,
  beforePromote,
} = {}) {
  const campaignPath = path.join(root, "bot/editorial-campaign.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, "utf8")));
  const item = campaign.items.find((candidate) => candidate.status === "validation") || null;
  if (!item) return { status: "idle", message: "Nenhuma pauta aguardando validação final" };
  if (!item.postPath) throw new Error(`Pauta ${item.id} sem postPath`);

  const researchPath = `content/research/campaign/${item.id}.json`;
  const imageDirectory = `assets/img/posts/${item.id}`;
  const inputs = [
    "bot/editorial-campaign.json",
    "_data/editorial-calendar.json",
    item.postPath,
    researchPath,
    imageDirectory,
    "content/image-library/index.json",
    "content/product-discovery/thebiker-media-catalog.json",
    "bot/config/official-image-sources.json",
    "content/image-rights/thebiker-official-editorial-v1.json",
    "content/image-rights/official-brand-editorial-v1.json",
  ];
  const transaction = await createStagedWorkspace(root, inputs, {
    transactionId: `finalize-${item.id}-${process.pid}-${Date.now()}`,
  });
  try {
    const result = await finalizeInWorkspace({ root: transaction.workspaceRoot, now, imageProducer });
    const outputs = [item.postPath, imageDirectory, "bot/editorial-campaign.json", "_data/editorial-calendar.json"];
    const stagedLibrary = path.join(transaction.workspaceRoot, "content/image-library/index.json");
    if (await fs.stat(stagedLibrary).then(() => true).catch((error) => error?.code === "ENOENT" ? false : Promise.reject(error))) {
      outputs.splice(2, 0, "content/image-library/index.json");
    }
    await promoteStagedPaths(transaction, outputs, { beforePromote });
    return { ...result, transactionId: transaction.id };
  } catch (error) {
    await recordSafeFailure(root, item.id, error, now);
    throw error;
  } finally {
    await discardStagedWorkspace(transaction);
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  finalizeCampaignItem().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
