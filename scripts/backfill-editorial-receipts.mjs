import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema, publicCampaignSummary } from "../bot/src/automation/campaign.js";
import {
  EDITORIAL_POLICY_VERSION,
  assertScheduledReceipt,
  hashEditorialText,
  issueEditorialReceipt,
} from "../bot/src/validation/editorial-receipt.js";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function researchContentFor(root, item) {
  return fs.readFile(path.join(root, "content/research/campaign", `${item.id}.json`), "utf8")
    .catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
}

function assertPublishedReceipt(content, item) {
  const receipt = item.editorialReceipt;
  if (!receipt?.publishedContentHash) throw new Error("recibo/hash de publicação ausente");
  if (receipt.policyVersion !== EDITORIAL_POLICY_VERSION) {
    throw new Error(`política editorial desatualizada: ${receipt.policyVersion}`);
  }
  const actual = hashEditorialText(content);
  if (actual !== receipt.publishedContentHash) {
    throw new Error(`hash publicado divergente: esperado ${receipt.publishedContentHash}, obtido ${actual}`);
  }
  if (receipt.finalScore !== item.aiReview?.finalScore || receipt.finalBlockers !== item.aiReview?.finalBlockers) {
    throw new Error("recibo publicado não corresponde à revisão final registrada");
  }
}

export async function auditEditorialReceipts({
  root = defaultRoot,
  writeScheduled = false,
  includePublished = true,
  acknowledgePublishedBaseline = false,
  itemIds = null,
} = {}) {
  const campaignPath = path.join(root, "bot/editorial-campaign.json");
  const calendarPath = path.join(root, "_data/editorial-calendar.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, "utf8")));
  let changed = 0;
  let scheduledVerified = 0;
  let publishedVerified = 0;
  const publishedMissing = [];
  const publishedDivergent = [];
  const scope = itemIds ? new Set(itemIds) : null;
  const inScope = (item) => !scope || scope.has(item.id);

  for (const item of campaign.items.filter((candidate) => candidate.status === "scheduled" && inScope(candidate))) {
    if (!item.postPath || !item.aiReview) throw new Error(`${item.id}: pauta scheduled sem postPath ou aiReview`);
    const content = await fs.readFile(path.resolve(root, item.postPath), "utf8");
    if (item.editorialReceipt) {
      try {
        assertScheduledReceipt(content, item);
        scheduledVerified += 1;
        continue;
      } catch (error) {
        throw new Error(`${item.id}: recibo existente divergente; nova revisão obrigatória (${error.message})`);
      }
    }
    if (!writeScheduled) throw new Error(`${item.id}: recibo editorial ausente; execute npm run receipts:backfill`);
    item.aiReview.contentHash ||= hashEditorialText(content);
    item.editorialReceipt = issueEditorialReceipt({
      content,
      researchContent: await researchContentFor(root, item),
      aiReview: item.aiReview,
      origin: "legacy-backfill",
    });
    changed += 1;
    scheduledVerified += 1;
  }

  if (includePublished) {
    for (const item of campaign.items.filter((candidate) => candidate.status === "published" && inScope(candidate))) {
      if (!item.postPath || !item.aiReview) {
        publishedMissing.push({ id: item.id, reason: "postPath ou aiReview ausente" });
        continue;
      }
      const content = await fs.readFile(path.resolve(root, item.postPath), "utf8");
      try {
        assertPublishedReceipt(content, item);
        publishedVerified += 1;
        continue;
      } catch (error) {
        if (item.editorialReceipt?.publishedContentHash) {
          publishedDivergent.push({ id: item.id, reason: error.message });
          continue;
        }
        if (!acknowledgePublishedBaseline) {
          publishedMissing.push({ id: item.id, reason: error.message });
          continue;
        }
      }

      // Este backfill atesta somente o estado atual do arquivo publicado. A
      // flag de reconhecimento é obrigatória para não fabricar prova histórica.
      const receipt = issueEditorialReceipt({
        content,
        researchContent: await researchContentFor(root, item),
        aiReview: item.aiReview,
        origin: "legacy-backfill",
      });
      receipt.publishedContentHash = hashEditorialText(content);
      item.editorialReceipt = receipt;
      changed += 1;
      publishedVerified += 1;
    }
  }

  if (changed > 0) {
    await fs.writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
    await fs.writeFile(calendarPath, `${JSON.stringify(publicCampaignSummary(campaign), null, 2)}\n`);
  }

  return { changed, scheduledVerified, publishedVerified, publishedMissing, publishedDivergent };
}

export function assertReceiptAuditPolicy(result, { strictPublished = false } = {}) {
  if (result.publishedDivergent.length > 0) {
    throw new Error(`${result.publishedDivergent.length} published com recibo divergente`);
  }
  if (strictPublished && result.publishedMissing.length > 0) {
    throw new Error(`${result.publishedMissing.length} published sem recibo auditável`);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write");
  const acknowledgePublishedBaseline = args.has("--acknowledge-published-baseline");
  const strictPublished = args.has("--strict-published");
  const includePublished = !args.has("--scheduled-only") || args.has("--include-published");
  if (acknowledgePublishedBaseline && !write) {
    throw new Error("--acknowledge-published-baseline exige --write");
  }
  const result = await auditEditorialReceipts({
    writeScheduled: write,
    includePublished,
    acknowledgePublishedBaseline,
  });
  console.log(
    `Recibos editoriais: ${result.scheduledVerified} scheduled verificados; `
    + `${result.publishedVerified} published verificados; ${result.changed} atualizados.`,
  );
  if (result.publishedMissing.length > 0) {
    console.log(`Published legados sem baseline: ${result.publishedMissing.map((entry) => entry.id).join(", ")}.`);
    console.log("Para registrar somente o baseline atual: --write --include-published --acknowledge-published-baseline");
  }
  if (result.publishedDivergent.length > 0) {
    console.log(`Published com recibo divergente: ${result.publishedDivergent.map((entry) => entry.id).join(", ")}.`);
    console.log("Recibos divergentes não são sobrescritos pelo backfill; exigem correção manual.");
  }
  assertReceiptAuditPolicy(result, { strictPublished });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
