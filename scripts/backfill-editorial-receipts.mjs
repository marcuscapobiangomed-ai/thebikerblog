import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema, publicCampaignSummary } from "../bot/src/automation/campaign.js";
import { assertScheduledReceipt, hashEditorialText, issueEditorialReceipt } from "../bot/src/validation/editorial-receipt.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const campaignPath = path.join(root, "bot/editorial-campaign.json");
const calendarPath = path.join(root, "_data/editorial-calendar.json");
const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, "utf8")));
let changed = 0;

for (const item of campaign.items.filter((candidate) => candidate.status === "scheduled")) {
  if (!item.postPath || !item.aiReview) throw new Error(`${item.id}: pauta scheduled sem postPath ou aiReview`);
  const content = await fs.readFile(path.resolve(root, item.postPath), "utf8");
  if (item.editorialReceipt) {
    try {
      assertScheduledReceipt(content, item);
      continue;
    } catch (error) {
      throw new Error(`${item.id}: recibo existente divergente; nova revisão obrigatória (${error.message})`);
    }
  }
  if (!write) throw new Error(`${item.id}: recibo editorial ausente; execute npm run receipts:backfill`);
  item.aiReview.contentHash ||= hashEditorialText(content);
  const researchContent = await fs.readFile(path.join(root, "content/research/campaign", `${item.id}.json`), "utf8").catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  item.editorialReceipt = issueEditorialReceipt({ content, researchContent, aiReview: item.aiReview, origin: "legacy-backfill" });
  changed += 1;
}

if (write && changed > 0) {
  await fs.writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
  await fs.writeFile(calendarPath, `${JSON.stringify(publicCampaignSummary(campaign), null, 2)}\n`);
}
console.log(`Recibos editoriais: ${campaign.items.filter((item) => item.status === "scheduled").length} verificados; ${changed} atualizados.`);
