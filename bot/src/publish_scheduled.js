import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CampaignSchema, publicCampaignSummary, racePublicationSourceIsFresh } from "./automation/campaign.js";
import { validateImageManifestV2 } from "./validation/image-manifest-v2.js";
import { assertMarkdownPublicationGates } from "./validation/markdown-publication-gates.js";
import matter from "gray-matter";
import { assertImageArticleConsistency } from "./validation/image-article-consistency.js";
import { assertScheduledReceipt, hashEditorialText } from "./validation/editorial-receipt.js";
import { createStagedWorkspace, discardStagedWorkspace, promoteStagedPaths } from "./automation/file-transaction.js";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function localDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function selectScheduledPublication(campaign, date) {
  const due = campaign.items.find((candidate) => candidate.publishDate === date) || null;
  if (due && !["scheduled", "published"].includes(due.status)) {
    throw new Error(`Publicacao bloqueada: pauta ${due.id} de hoje esta em ${due.status}, nao scheduled`);
  }
  if (due?.status === "scheduled") return { item: due, catchUp: false };

  const catchUpAlreadyPublished = campaign.items.some((candidate) => {
    if (candidate.status !== "published" || candidate.publishDate >= date || !candidate.publishedAt) return false;
    return localDate(new Date(candidate.publishedAt)) === date;
  });
  if (catchUpAlreadyPublished) return { item: null, catchUp: false, alreadyPublished: true };

  const overdue = campaign.items
    .filter((candidate) => candidate.status === "scheduled" && candidate.publishDate < date)
    .sort((left, right) => left.publishDate.localeCompare(right.publishDate))[0] || null;
  if (overdue) return { item: overdue, catchUp: true };
  return { item: null, catchUp: false, alreadyPublished: due?.status === "published" };
}

async function publishInWorkspace({ now, dryRun, root }) {
  const campaignPath = path.join(root, "bot/editorial-campaign.json");
  const calendarPath = path.join(root, "_data/editorial-calendar.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, "utf8")));
  const date = localDate(now);
  const selected = selectScheduledPublication(campaign, date);
  const item = selected.item;

  if (!item) {
    if (selected.alreadyPublished) return { status: "already-published", date };
    const endDate = campaign.items.at(-1)?.publishDate;
    if (date >= campaign.startsOn && date <= endDate) {
      throw new Error(`Publicacao bloqueada: campanha possui lacuna em ${date}`);
    }
    return { status: "idle", date, message: "Data fora da campanha ativa" };
  }
  if (!racePublicationSourceIsFresh(item, now)) {
    throw new Error(`Publicacao bloqueada: pauta de corrida ${item.id} sem fonte oficial verificada nas ultimas 24 horas`);
  }
  if (!item.postPath) throw new Error(`Pauta ${item.id} esta agendada sem postPath`);
  if (item.imageStatus !== "approved" || !item.imageManifestPath) {
    throw new Error(`Pauta ${item.id} sem imagem oficial aprovada`);
  }
  if ((item.aiReview?.finalScore ?? 0) < 90 || (item.aiReview?.finalBlockers ?? 0) > 0) {
    throw new Error(`Pauta ${item.id} sem aprovacao editorial final >= 90 e zero bloqueadores`);
  }

  const manifestPath = path.resolve(root, item.imageManifestPath);
  const imagesRoot = path.resolve(root, "assets/img/posts") + path.sep;
  if (!manifestPath.startsWith(imagesRoot)) throw new Error(`imageManifestPath inseguro: ${item.imageManifestPath}`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const validatedManifest = validateImageManifestV2(manifest, path.dirname(manifestPath), { requirePublishable: true });

  const sourcePath = path.resolve(root, item.postPath);
  const draftsRoot = path.join(root, "_posts", "drafts") + path.sep;
  if (!sourcePath.startsWith(draftsRoot)) throw new Error(`postPath inseguro: ${item.postPath}`);
  let content = await fs.readFile(sourcePath, "utf8");
  const catalog = JSON.parse(await fs.readFile(path.join(root, "content/product-discovery/thebiker-media-catalog.json"), "utf8"));
  assertImageArticleConsistency({ article: matter(content).data, manifest: validatedManifest, campaignItem: item, catalog });
  assertScheduledReceipt(content, item);
  content = content.replace(/^published:\s*false\s*$/m, "published: true");
  content = content.replace(/^editorial_status:\s*.*$/m, 'editorial_status: "published"');
  content = content.replace(/^status:\s*.*$/m, 'status: "published"');
  if (selected.catchUp) {
    content = content.replace(/^date:\s*.*$/m, `date: ${date}`);
    content = content.replace(/^last_modified_at:\s*.*$/m, `last_modified_at: ${date}`);
  }
  if (!/^published:\s*true\s*$/m.test(content)) throw new Error(`Post ${item.id} nao possui published: false valido`);
  assertMarkdownPublicationGates(content);
  item.editorialReceipt.publishedContentHash = hashEditorialText(content);
  const targetName = `${selected.catchUp ? date : item.publishDate}-${item.id}.md`;
  const targetPath = path.join(root, "_posts", targetName);
  if (dryRun) return {
    status: "ready",
    date,
    itemId: item.id,
    scheduledDate: item.publishDate,
    catchUp: selected.catchUp,
    targetPath,
  };

  await fs.writeFile(targetPath, content);
  await fs.unlink(sourcePath);
  item.status = "published";
  item.publishedAt = now.toISOString();
  item.postPath = path.relative(root, targetPath).replace(/\\/g, "/");
  await fs.writeFile(campaignPath, JSON.stringify(campaign, null, 2) + "\n");
  await fs.writeFile(calendarPath, JSON.stringify(publicCampaignSummary(campaign), null, 2) + "\n");
  return {
    status: "published",
    date,
    itemId: item.id,
    scheduledDate: item.publishDate,
    catchUp: selected.catchUp,
    targetPath,
  };
}

export async function publishScheduled({ now = new Date(), dryRun = false, root = defaultRoot, beforePromote } = {}) {
  if (dryRun) return publishInWorkspace({ now, dryRun: true, root });
  const campaignPath = path.join(root, "bot/editorial-campaign.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, "utf8")));
  const date = localDate(now);
  const selected = selectScheduledPublication(campaign, date);
  if (!selected.item) return publishInWorkspace({ now, dryRun: false, root });
  const item = selected.item;
  const imageDirectory = item.imageManifestPath ? path.dirname(item.imageManifestPath).replace(/\\/g, "/") : null;
  const transaction = await createStagedWorkspace(root, [
    "bot/editorial-campaign.json",
    "_data/editorial-calendar.json",
    item.postPath,
    imageDirectory,
    "content/product-discovery/thebiker-media-catalog.json",
  ].filter(Boolean), { transactionId: `publish-${item.id}-${process.pid}-${Date.now()}` });
  try {
    const result = await publishInWorkspace({ now, dryRun: false, root: transaction.workspaceRoot });
    const targetRelative = path.relative(transaction.workspaceRoot, result.targetPath).replace(/\\/g, "/");
    await promoteStagedPaths(
      transaction,
      [targetRelative, "bot/editorial-campaign.json", "_data/editorial-calendar.json"],
      { beforePromote, deletions: [item.postPath] },
    );
    return { ...result, targetPath: path.join(root, targetRelative), transactionId: transaction.id };
  } finally {
    await discardStagedWorkspace(transaction);
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  publishScheduled({ dryRun: process.env.AUTOMATION_DRY_RUN === "true" })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
