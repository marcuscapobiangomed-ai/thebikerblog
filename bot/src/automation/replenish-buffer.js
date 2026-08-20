import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema } from "./campaign.js";
import { runCampaignProducer } from "../campaign_producer.js";
import { finalizeCampaignItem } from "../campaign_finalize.js";
import { recoverBlockedCampaignFiles } from "./recover-blocked.js";
import { campaignCoverageSnapshot } from "./campaign-coverage.js";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function readCampaign(root) {
  return CampaignSchema.parse(JSON.parse(await fs.readFile(path.join(root, "bot/editorial-campaign.json"), "utf8")));
}

export function campaignBufferSnapshot(campaign, { now = new Date(), requiredDate = null } = {}) {
  return campaignCoverageSnapshot(campaign, { now, requiredDate });
}

export function bufferTargetReached(snapshot, { targetBuffer, requiredDate = null } = {}) {
  return snapshot.consecutiveReadyDays >= targetBuffer && (!requiredDate || snapshot.requiredReady);
}

function errorMessage(error) {
  return String(error?.message || error).replace(/\s+/g, " ").trim().slice(0, 360);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Keeps the future editorial buffer populated without ever bypassing the
 * production/finalization gates. A failed attempt remains recorded by the
 * existing producer/finalizer and the next attempt starts with recovery.
 */
export async function replenishCampaignBuffer({
  root = defaultRoot,
  env = process.env,
  now = new Date(),
  targetBuffer,
  requiredDate = null,
  maxAttempts = parsePositiveInteger(env.CAMPAIGN_REPLENISH_MAX_ATTEMPTS, 3),
  maximumResearchAttempts = parsePositiveInteger(env.CAMPAIGN_RESEARCH_MAX_ATTEMPTS, 2),
  producer = runCampaignProducer,
  finalizer = finalizeCampaignItem,
  recoverer = recoverBlockedCampaignFiles,
  allowPartial = false,
} = {}) {
  const initial = await readCampaign(root);
  const target = targetBuffer === undefined ? initial.minimumApprovedBuffer : parsePositiveInteger(targetBuffer, initial.minimumApprovedBuffer);
  const attemptsLimit = parsePositiveInteger(maxAttempts, 3);
  const actions = [];
  let lastError = null;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
    const before = await readCampaign(root);
    const beforeSnapshot = campaignBufferSnapshot(before, { now, requiredDate });
    if (bufferTargetReached(beforeSnapshot, { targetBuffer: target, requiredDate })) break;
    attemptsMade = attempt;

    try {
      const recovered = await recoverer({ root, now, maximumResearchAttempts });
      actions.push({ attempt, stage: "recovery", result: recovered?.status || "unknown" });
    } catch (error) {
      lastError = error;
      actions.push({ attempt, stage: "recovery", status: "failed", error: errorMessage(error) });
    }

    let produced;
    try {
      produced = await producer({ root, env, now });
      actions.push({ attempt, stage: "production", result: produced?.status || "unknown", itemId: produced?.itemId });
    } catch (error) {
      lastError = error;
      actions.push({ attempt, stage: "production", status: "failed", error: errorMessage(error) });
      continue;
    }

    // `campaign:produce` returns validation both for a new draft and for a
    // draft recovered after a finalization error. In either case the only
    // acceptable next state is a fully finalized scheduled item.
    try {
      const finalized = await finalizer({ root, now });
      actions.push({ attempt, stage: "finalization", result: finalized?.status || "unknown", itemId: finalized?.itemId });
    } catch (error) {
      lastError = error;
      actions.push({ attempt, stage: "finalization", status: "failed", error: errorMessage(error) });
    }
  }

  const finalCampaign = await readCampaign(root);
  const snapshot = campaignBufferSnapshot(finalCampaign, { now, requiredDate });
  const reached = bufferTargetReached(snapshot, { targetBuffer: target, requiredDate });
  const result = {
    status: reached ? "replenished" : allowPartial ? "partial" : "insufficient",
    targetBuffer: target,
    attempts: attemptsMade,
    ...snapshot,
    actions,
    lastError: lastError ? errorMessage(lastError) : null,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!reached && !allowPartial) {
    throw new Error(`Buffer editorial consecutivo não recomposto: ${snapshot.consecutiveReadyDays}/${target}; primeira lacuna ${snapshot.firstGapDate || "fora da campanha"}${requiredDate ? `; ${requiredDate} em ${snapshot.requiredStatus || "ausente"}` : ""}${result.lastError ? `; último erro: ${result.lastError}` : ""}`);
  }
  return result;
}

function cliOption(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const targetBuffer = cliOption("target-buffer");
  const requiredDate = cliOption("required-date");
  const maxAttempts = cliOption("max-attempts");
  const allowPartial = process.argv.includes("--allow-partial");
  replenishCampaignBuffer({
    targetBuffer: targetBuffer ? Number(targetBuffer) : undefined,
    requiredDate: requiredDate || null,
    maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
    allowPartial,
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
