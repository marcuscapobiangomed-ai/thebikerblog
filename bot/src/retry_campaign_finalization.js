import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema } from "./automation/campaign.js";
import { campaignBufferSnapshot, replenishCampaignBuffer } from "./automation/replenish-buffer.js";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function retryCampaignFinalization({
  root = defaultRoot,
  env = process.env,
  now = new Date(),
  replenisher = replenishCampaignBuffer,
} = {}) {
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(path.join(root, "bot/editorial-campaign.json"), "utf8")));
  const blocked = campaign.items.find((item) =>
    item.status === "blocked" && /^Valida(?:ção|cao) final:/i.test(item.blockReason || ""),
  );
  if (!blocked) throw new Error("Failover de finalização sem pauta bloqueada recuperável");

  const before = campaignBufferSnapshot(campaign, { now, requiredDate: blocked.publishDate });
  const result = await replenisher({
    root,
    env,
    now,
    targetBuffer: before.consecutiveReadyDays + 1,
    requiredDate: blocked.publishDate,
    maxAttempts: positiveInteger(env.CAMPAIGN_FINALIZATION_MAX_ATTEMPTS, 3),
  });
  if (result.status !== "replenished" || !result.requiredReady) {
    throw new Error(`Failover de finalização não agendou um artigo para ${blocked.publishDate}`);
  }
  return { status: "scheduled", replacedItemId: blocked.id, publishDate: blocked.publishDate, result };
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  retryCampaignFinalization()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
