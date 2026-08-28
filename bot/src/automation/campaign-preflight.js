import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema } from "./campaign.js";
import { validateResearch } from "../schemas/research.schema.js";
import { assertResearchEvidenceContract, assertResearchGrounding } from "../validation/research-grounding.js";
import { alignCampaignVisual } from "../images/align-campaign-visual.js";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function localDate(now, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function daysBetween(from, to) {
  const left = new Date(`${from}T12:00:00-03:00`);
  const right = new Date(`${to}T12:00:00-03:00`);
  return Math.round((right - left) / 86_400_000);
}

async function readJson(filePath, fallback = undefined) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function researchReadiness(research) {
  try {
    const parsed = validateResearch(research);
    assertResearchGrounding(parsed, { requireFactReferences: true });
    assertResearchEvidenceContract(parsed);
    return { ready: true, reason: null };
  } catch (error) {
    return { ready: false, reason: String(error?.message || error).replace(/\s+/g, " ").slice(0, 280) };
  }
}

function visualReadiness(item, catalog, library) {
  const candidate = structuredClone(item);
  try {
    const alignment = alignCampaignVisual({
      item: candidate,
      article: { title: item.title, description: item.summary, promoted_brands: [] },
      catalog,
      library,
    });
    const productId = candidate.heroImage?.productId || null;
    const product = productId ? (catalog.products || []).find((entry) => entry.id === productId) : null;
    const hasImage = Boolean(product && ((product.officialImages || []).length > 0 || (product.images || []).length > 0));
    if (!hasImage) return { ready: false, productId, reason: "produto visual sem imagem oficial catalogada" };
    return { ready: true, productId, mode: candidate.heroImage?.mode, changed: alignment.changed, reason: null };
  } catch (error) {
    return { ready: false, productId: null, reason: String(error?.message || error).replace(/\s+/g, " ").slice(0, 280) };
  }
}

export async function auditCampaignReadiness({
  root = defaultRoot,
  now = new Date(),
  leadDays = 7,
} = {}) {
  const campaign = CampaignSchema.parse(await readJson(path.join(root, "bot/editorial-campaign.json")));
  const catalog = await readJson(path.join(root, "content/product-discovery/thebiker-media-catalog.json"), { products: [] });
  const library = await readJson(path.join(root, "content/image-library/index.json"), { assets: [] });
  const today = localDate(now, campaign.timezone);
  const findings = [];

  for (const item of campaign.items.filter((entry) => entry.publishDate >= today && ["planned", "blocked", "researching", "research-ready", "drafting", "validation"].includes(entry.status))) {
    const daysUntil = daysBetween(today, item.publishDate);
    const researchPath = path.join(root, "content/research/campaign", `${item.id}.json`);
    const cachedResearch = await readJson(researchPath, null);
    const research = cachedResearch ? researchReadiness(cachedResearch) : { ready: false, reason: "cache de pesquisa ausente" };
    const visual = visualReadiness(item, catalog, library);
    const urgent = daysUntil <= leadDays;

    if (item.status === "blocked") {
      findings.push({ severity: "error", itemId: item.id, publishDate: item.publishDate, daysUntil, code: "BLOCKED_CAMPAIGN", detail: item.blockReason || item.failure?.message || "pauta bloqueada" });
      continue;
    }
    if (!research.ready) findings.push({ severity: urgent ? "error" : "warning", itemId: item.id, publishDate: item.publishDate, daysUntil, code: "RESEARCH_NOT_READY", detail: research.reason });
    if (!visual.ready) findings.push({ severity: urgent ? "error" : "warning", itemId: item.id, publishDate: item.publishDate, daysUntil, code: "VISUAL_NOT_READY", detail: visual.reason });
  }

  return {
    status: findings.some((finding) => finding.severity === "error") ? "blocked" : "ready",
    today,
    leadDays,
    futureItems: campaign.items.filter((item) => item.publishDate >= today).length,
    findings,
  };
}

function cliOption(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const leadDays = Number(cliOption("lead-days") || 7);
  auditCampaignReadiness({ leadDays: Number.isInteger(leadDays) && leadDays >= 0 ? leadDays : 7 })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status === "blocked") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
