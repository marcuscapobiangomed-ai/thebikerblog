import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema } from "../automation/campaign.js";
import { markdownPublicationErrors } from "./markdown-publication-gates.js";

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
