import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema } from "./campaign.js";
import { validateImageManifestV2 } from "../validation/image-manifest-v2.js";
import { campaignCoverageSnapshot } from "./campaign-coverage.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export async function simulateCampaign({ now = new Date() } = {}) {
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(path.join(root, "bot/editorial-campaign.json"), "utf8")));
  const failures = [];
  const warnings = [];
  const hashes = new Map();
  const ready = campaign.items.filter((item) => ["scheduled", "published"].includes(item.status));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: campaign.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const futureScheduled = ready.filter((item) => item.status === "scheduled" && item.publishDate >= today);
  const overdueScheduled = ready.filter((item) => item.status === "scheduled" && item.publishDate < today);
  const coverage = campaignCoverageSnapshot(campaign, { now });

  if (coverage.consecutiveReadyDays === 0) {
    failures.push("nenhuma pauta futura publicavel");
  } else if (coverage.consecutiveReadyDays < campaign.minimumApprovedBuffer) {
    warnings.push(`cobertura consecutiva abaixo do alvo de ${campaign.minimumApprovedBuffer}; primeira lacuna ${coverage.firstGapDate || "fora da campanha"}`);
  }
  if (overdueScheduled.length > 0) failures.push(`pauta vencida ainda scheduled: ${overdueScheduled.map((item) => item.id).join(", ")}`);
  for (const item of ready) {
    if (!item.postPath || !(await exists(path.join(root, item.postPath)))) failures.push(`${item.id}: post ausente`);
    if (item.imageStatus !== "approved" || !item.imageManifestPath) failures.push(`${item.id}: imagem nao aprovada`);
    if (item.imageManifestPath) {
      const manifestPath = path.join(root, item.imageManifestPath);
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        validateImageManifestV2(manifest, path.dirname(manifestPath), { requirePublishable: true });
        if (manifest.sha256 && hashes.has(manifest.sha256)) failures.push(`${item.id}: imagem exata repetida com ${hashes.get(manifest.sha256)}`);
        if (manifest.sha256) hashes.set(manifest.sha256, item.id);
      } catch (error) { failures.push(`${item.id}: ${error.message}`); }
    }
  }

  const publishWorkflow = await fs.readFile(path.join(root, ".github/workflows/publish-daily.yml"), "utf8");
  for (const cron of ["55 14 * * *", "0 15 * * *", "10 15 * * *"]) {
    if (!publishWorkflow.includes(cron)) failures.push(`watchdog ausente: ${cron}`);
  }
  const productionWorkflow = await fs.readFile(path.join(root, ".github/workflows/cron-post.yml"), "utf8");
  if (!productionWorkflow.includes("5 9,13,17 * * *")) failures.push("cadencia de producao 3x/dia ausente");
  if (!productionWorkflow.includes("thebiker-editorial-write") || !publishWorkflow.includes("thebiker-editorial-write")) {
    failures.push("concorrencia editorial nao unificada");
  }

  const result = {
    campaignId: campaign.id,
    days: campaign.items.length,
    published: campaign.items.filter((item) => item.status === "published").length,
    scheduled: campaign.items.filter((item) => item.status === "scheduled").length,
    planned: campaign.items.filter((item) => item.status === "planned").length,
    consecutiveReadyDays: coverage.consecutiveReadyDays,
    firstGapDate: coverage.firstGapDate,
    verifiedOfficialImages: ready.length,
    warnings,
    failures,
  };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) throw new Error(`Simulacao operacional reprovada: ${failures.join("; ")}`);
  return result;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  simulateCampaign().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
