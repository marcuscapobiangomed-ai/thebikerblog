import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema } from "../automation/campaign.js";
import { markdownPublicationErrors } from "./markdown-publication-gates.js";
import matter from "gray-matter";
import { validateImageManifestV2 } from "./image-manifest-v2.js";
import { imageArticleConsistencyErrors } from "./image-article-consistency.js";
import { assertScheduledReceipt } from "./editorial-receipt.js";
import { visualDecisionErrors } from "./visual-decision.js";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function scheduledDraftErrors(content) {
  const errors = [];
  if (!/^published:\s*false\s*$/m.test(content)) {
    errors.push("rascunho scheduled precisa conter published: false");
  }
  return [...errors, ...markdownPublicationErrors(content)];
}

export async function validateScheduledPublications({ root = defaultRoot } = {}) {
  const campaignPath = path.join(root, "bot/editorial-campaign.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, "utf8")));
  const draftsRoot = path.resolve(root, "_posts/drafts");
  const scheduled = campaign.items.filter((item) => item.status === "scheduled");
  const errors = [];
  const catalog = JSON.parse(await fs.readFile(path.join(root, "content/product-discovery/thebiker-media-catalog.json"), "utf8"));

  for (const item of scheduled) {
    if (!item.postPath) {
      errors.push(`${item.id}: item scheduled sem postPath`);
      continue;
    }

    const sourcePath = path.resolve(root, item.postPath);
    if (!isInside(draftsRoot, sourcePath)) {
      errors.push(`${item.id}: postPath precisa apontar para _posts/drafts`);
      continue;
    }

    let content;
    try {
      content = await fs.readFile(sourcePath, "utf8");
    } catch (error) {
      errors.push(`${item.id}: rascunho indisponível (${error.code || error.message})`);
      continue;
    }

    for (const error of scheduledDraftErrors(content)) {
      errors.push(`${item.id}: ${error}`);
    }
    try {
      assertScheduledReceipt(content, item);
    } catch (error) {
      errors.push(`${item.id}: ${error.message}`);
    }
    if (item.imageStatus !== "approved" || !item.imageManifestPath) {
      errors.push(`${item.id}: imagem sem aprovação ou manifesto`);
      continue;
    }
    const manifestPath = path.resolve(root, item.imageManifestPath);
    const imagesRoot = path.resolve(root, "assets/img/posts") + path.sep;
    if (!manifestPath.startsWith(imagesRoot)) {
      errors.push(`${item.id}: imageManifestPath inseguro`);
      continue;
    }
    try {
      const manifest = validateImageManifestV2(
        JSON.parse(await fs.readFile(manifestPath, "utf8")),
        path.dirname(manifestPath),
        { requirePublishable: true },
      );
      for (const error of imageArticleConsistencyErrors({ article: matter(content).data, manifest, campaignItem: item, catalog })) {
        errors.push(`${item.id}: ${error}`);
      }
      for (const error of visualDecisionErrors({ receipt: item.visualDecision, item, article: matter(content).data, manifest, catalog })) {
        errors.push(`${item.id}: ${error}`);
      }
    } catch (error) {
      errors.push(`${item.id}: manifesto de imagem inválido (${error.message})`);
    }
  }

  return { checked: scheduled.length, errors };
}

export async function assertScheduledPublicationsReady(options) {
  const result = await validateScheduledPublications(options);
  if (result.errors.length > 0) {
    throw new Error(`Buffer editorial reprovado:\n- ${result.errors.join("\n- ")}`);
  }
  return result;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  assertScheduledPublicationsReady()
    .then(({ checked }) => console.log(`Buffer editorial aprovado: ${checked} rascunho(s) scheduled validado(s).`))
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
