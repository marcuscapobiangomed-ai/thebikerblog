import path from "node:path";
import { fileURLToPath } from "node:url";
import { recoverBlockedCampaignFiles } from "./automation/recover-blocked.js";
import { runCampaignProducer } from "./campaign_producer.js";
import { finalizeCampaignItem } from "./campaign_finalize.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configuredResearchAttempts = Number(process.env.CAMPAIGN_RESEARCH_MAX_ATTEMPTS);
const maximumResearchAttempts = Number.isInteger(configuredResearchAttempts) && configuredResearchAttempts > 0
  ? configuredResearchAttempts
  : undefined;

const recovered = await recoverBlockedCampaignFiles({ root, maximumResearchAttempts });
if (["idle", "blocked"].includes(recovered?.status)) {
  throw new Error(`Failover de finalização sem pauta recuperável: ${recovered?.status || "desconhecido"}`);
}

const produced = await runCampaignProducer({ root, env: process.env });
if (produced?.status !== "validation") {
  throw new Error(`Failover de finalização não produziu uma pauta para validação: ${produced?.status || "desconhecido"}`);
}

const finalized = await finalizeCampaignItem({ root });
if (finalized?.status !== "scheduled") {
  throw new Error(`Failover de finalização não agendou um artigo: ${finalized?.status || "desconhecido"}`);
}

console.log(JSON.stringify({ status: "scheduled", recovered, produced, finalized }, null, 2));
