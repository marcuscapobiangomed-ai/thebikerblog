#!/usr/bin/env node
/**
 * Adaptador de compatibilidade do publicador manual antigo.
 *
 * Ele não altera mais front matter nem arquivos diretamente. O alvo informado
 * precisa existir no ledger da campanha e ser exatamente o candidato que o
 * publicador transacional considera seguro para a data/política escolhida.
 *
 * Uso: node src/publish_post.js <id-ou-postPath>
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema } from "./automation/campaign.js";
import { CatchUpPolicy, publishScheduled } from "./publish_scheduled.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function normalizedTarget(target, root) {
  const absolute = path.isAbsolute(target) ? path.resolve(target) : null;
  const relative = absolute && absolute.startsWith(`${path.resolve(root)}${path.sep}`)
    ? path.relative(root, absolute)
    : target;
  return relative.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function resolveLegacyTarget(campaign, target, { root = ROOT_DIR } = {}) {
  const normalized = normalizedTarget(String(target || "").trim(), root);
  if (!normalized) throw new Error("Publicacao bloqueada: informe id ou postPath registrado na campanha");
  const basename = path.posix.basename(normalized);
  const matches = campaign.items.filter((item) => {
    const postPath = String(item.postPath || "").replaceAll("\\", "/");
    return item.id === normalized || postPath === normalized || path.posix.basename(postPath) === basename;
  });
  if (matches.length === 0) {
    throw new Error(`Publicacao bloqueada: alvo legado nao esta no ledger da campanha (${normalized})`);
  }
  if (matches.length > 1) {
    throw new Error(`Publicacao bloqueada: alvo legado ambiguo (${normalized})`);
  }
  return matches[0];
}

export async function publishLegacyTarget({
  target,
  root = ROOT_DIR,
  now = new Date(),
  dryRun = false,
  catchUpPolicy = CatchUpPolicy.DISABLED,
} = {}) {
  const campaignPath = path.join(root, "bot/editorial-campaign.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, "utf8")));
  const item = resolveLegacyTarget(campaign, target, { root });
  if (item.status === "published") {
    return { status: "already-published", itemId: item.id, deprecatedAdapter: true };
  }
  if (item.status !== "scheduled") {
    throw new Error(`Publicacao bloqueada: ${item.id} esta em ${item.status}, nao scheduled`);
  }
  const result = await publishScheduled({
    root,
    now,
    dryRun,
    catchUpPolicy,
    expectedItemId: item.id,
  });
  return { ...result, deprecatedAdapter: true };
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Uso: node src/publish_post.js <id-ou-postPath-registrado>");
    process.exitCode = 1;
  } else {
    console.error("AVISO: publish_post.js esta depreciado; delegando para publish_scheduled.js.");
    publishLegacyTarget({
      target,
      dryRun: process.env.AUTOMATION_DRY_RUN === "true",
      catchUpPolicy: process.env.AUTOMATION_CATCH_UP_POLICY || CatchUpPolicy.DISABLED,
    })
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
      });
  }
}
