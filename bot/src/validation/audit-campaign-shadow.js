import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema } from "../automation/campaign.js";
import { markdownPublicationErrors } from "./markdown-publication-gates.js";
import { assertReviewedContentIntegrity, assertScheduledReceipt } from "./editorial-receipt.js";
import { classifyEditorialFailure } from "./editorial-failures.js";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ACTIVE_WITH_DRAFT = new Set(["blocked", "validation", "approved", "scheduled"]);

function localDate(now, timezone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function auditCampaignShadow({ root = defaultRoot, now = new Date(), horizonDays = 14 } = {}) {
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(path.join(root, "bot/editorial-campaign.json"), "utf8")));
  const today = localDate(now, campaign.timezone);
  const horizon = addDays(today, horizonDays);
  const draftsRoot = path.resolve(root, "_posts/drafts");
  const findings = [];

  for (const item of campaign.items.filter((candidate) => ACTIVE_WITH_DRAFT.has(candidate.status) && candidate.publishDate >= today && candidate.publishDate <= horizon)) {
    const severity = item.status === "blocked" ? "warning" : "error";
    if (!item.postPath) {
      findings.push({ itemId: item.id, status: item.status, severity, ...classifyEditorialFailure("Pauta ativa sem postPath", { stage: "shadow-gate", now }) });
      continue;
    }
    const draftPath = path.resolve(root, item.postPath);
    const relative = path.relative(draftsRoot, draftPath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      findings.push({ itemId: item.id, status: item.status, severity, ...classifyEditorialFailure("postPath precisa apontar para _posts/drafts", { stage: "shadow-gate", now }) });
      continue;
    }
    let content;
    try {
      content = await fs.readFile(draftPath, "utf8");
    } catch (error) {
      findings.push({ itemId: item.id, status: item.status, severity, ...classifyEditorialFailure(error, { stage: "shadow-gate", now }) });
      continue;
    }
    for (const message of markdownPublicationErrors(content)) {
      findings.push({ itemId: item.id, status: item.status, severity, ...classifyEditorialFailure(message, { stage: "shadow-gate", now }) });
    }
    try {
      if (item.status === "scheduled") assertScheduledReceipt(content, item);
      if (item.status === "validation") assertReviewedContentIntegrity(content, item.aiReview);
    } catch (error) {
      findings.push({ itemId: item.id, status: item.status, severity, ...classifyEditorialFailure(error, { stage: "shadow-gate", now }) });
    }
  }

  return {
    today,
    horizon,
    checked: campaign.items.filter((item) => ACTIVE_WITH_DRAFT.has(item.status) && item.publishDate >= today && item.publishDate <= horizon).length,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    findings,
  };
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  auditCampaignShadow().then((result) => {
    for (const finding of result.findings) console.log(`${finding.severity.toUpperCase()} ${finding.code} ${finding.itemId}: ${finding.message}`);
    console.log(`Shadow gate: ${result.checked} pauta(s), ${result.errors} erro(s), ${result.warnings} aviso(s), horizonte ${result.today}..${result.horizon}.`);
    if (result.errors > 0) process.exitCode = 1;
  }).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
