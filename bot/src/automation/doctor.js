import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQueue } from "./queue.js";
import fs from "node:fs/promises";
import { CampaignSchema } from "./campaign.js";
import { campaignCoverageSnapshot } from "./campaign-coverage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const queuePath = path.resolve(root, process.env.AUTOMATION_QUEUE_PATH || "bot/automation-queue.json");

const errors = [];
const warnings = [];
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

let campaign;
try {
  campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(path.join(root, "bot/editorial-campaign.json"), "utf8")));
} catch (error) {
  errors.push(`campanha editorial inválida: ${error.message}`);
}

let queue;
try {
  queue = await loadQueue(queuePath, root);
} catch (error) {
  errors.push(error.message);
}

if (process.env.AUTOMATION_ENABLED === "true") {
  for (const name of ["GROQ_API_KEY", "DEEPSEEK_API_KEY"]) {
    if (!process.env[name]) errors.push(`${name} não configurado`);
  }
}

if (queue && queue.items.length === 0) warnings.push("fila editorial vazia");
if (campaign) {
  const coverage = campaignCoverageSnapshot(campaign);
  const overdue = campaign.items.filter((item) => item.publishDate < today && item.status === "scheduled");
  if (coverage.consecutiveReadyDays < campaign.minimumApprovedBuffer) {
    warnings.push(`cobertura consecutiva abaixo do mínimo: ${coverage.consecutiveReadyDays}/${campaign.minimumApprovedBuffer}; primeira lacuna ${coverage.firstGapDate || "fora da campanha"}`);
  }
  if (overdue.length > 0) warnings.push(`pautas agendadas vencidas: ${overdue.map((item) => item.id).join(", ")}`);
}

console.log(JSON.stringify({
  ok: errors.length === 0,
  today,
  queueItems: queue?.items.length || 0,
  campaignItems: campaign?.items.length || 0,
  errors,
  warnings,
}, null, 2));
if (errors.length) process.exitCode = 1;
