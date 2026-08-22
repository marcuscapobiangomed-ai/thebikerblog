import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { CampaignSchema, publicCampaignSummary } from "../bot/src/automation/campaign.js";
import { markdownPublicationErrors } from "../bot/src/validation/markdown-publication-gates.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check");
const nowArgument = process.argv.find((argument) => argument.startsWith("--now="));
const now = nowArgument ? new Date(nowArgument.slice("--now=".length)) : new Date();
const fingerprint = /o segundo modelo listado na pesquisa|Use esta ficha como roteiro documental|Este ficha editorial/iu;
const quarantineRoot = path.join(root, "content/quarantine/editorial-fallback");
const ledgerPath = path.join(quarantineRoot, "ledger.json");

function editorialFallbackFingerprint(content) {
  if (fingerprint.test(String(content || ""))) return true;
  return markdownPublicationErrors(String(content || "")).some((error) =>
    /placeholder ou erro gramatical|texto dominado por bastidores|instrução interna exposta|intertítulo de processo editorial|resposta direta descreve o processo editorial/iu.test(error));
}

async function markdownFiles(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await markdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(absolute);
  }
  return result;
}

function quarantineFrontmatter(content) {
  const match = String(content).match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/u);
  if (!match) return content;
  let frontmatter = match[2]
    .replace(/^published:\s*true\s*$/mu, "published: false")
    .replace(/^editorial_status:\s*.*$/mu, 'editorial_status: "draft"')
    .replace(/^status:\s*.*$/mu, 'status: "draft"')
    .replace(/^reviewed_by:\s*.*$/mu, 'reviewed_by: ""');
  return `${match[1]}${frontmatter}${match[3]}${content.slice(match[0].length)}`;
}

const campaignPath = path.join(root, "bot/editorial-campaign.json");
const campaign = JSON.parse(await fs.readFile(campaignPath, "utf8"));
const fallbackArtifactPaths = new Set(
  campaign.items
    .filter((item) => item.aiReview?.deterministicFullArticleFallbackUsed && item.postPath)
    .map((item) => item.postPath),
);

const quarantinedFiles = [];
const publishableContaminatedFiles = [];
const quarantineIntegrityErrors = [];
const candidateFiles = new Set(await markdownFiles(path.join(root, "_posts")));
for (const relative of fallbackArtifactPaths) candidateFiles.add(path.resolve(root, relative));
const moves = [];
for (const file of candidateFiles) {
  const exists = await fs.access(file).then(() => true).catch((error) => error?.code === "ENOENT" ? false : Promise.reject(error));
  if (!exists) continue;
  const content = await fs.readFile(file, "utf8");
  const relative = path.relative(root, file).replace(/\\/g, "/");
  if (!editorialFallbackFingerprint(content) && !fallbackArtifactPaths.has(relative)) continue;
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] || "";
  if (/^published:\s*true\s*$/mu.test(frontmatter)
      || /^status:\s*["']?(?:scheduled|published)["']?\s*$/mu.test(frontmatter)
      || /^editorial_status:\s*["']?(?:reviewed|published)["']?\s*$/mu.test(frontmatter)) {
    publishableContaminatedFiles.push(relative);
  }
  const updated = quarantineFrontmatter(content);
  quarantinedFiles.push(relative);
  moves.push({ file, relative, content: updated });
}

const quarantinedItems = [];
for (const item of campaign.items) {
  if (!item.aiReview?.deterministicFullArticleFallbackUsed) continue;
  if (["validation", "approved", "scheduled"].includes(item.status)) quarantinedItems.push(item.id);
  if (!write) continue;
  if (["validation", "approved", "scheduled"].includes(item.status)) item.status = "blocked";
  item.blockReason = "[VALIDATION_FAILED] Quarentena: artigo integral de fallback determinístico exige nova redação e revisão independente";
  item.failure = {
    code: "VALIDATION_FAILED",
    retryable: false,
    stage: "editorial-quarantine",
    message: "Artigo integral de fallback determinístico reprovado pelo gate de qualidade editorial",
    recordedAt: now.toISOString(),
  };
  item.aiReview.score = null;
  item.aiReview.finalScore = null;
  item.aiReview.finalBlockers = Math.max(1, item.aiReview.finalBlockers || 0);
  delete item.postPath;
  delete item.editorialReceipt;
  delete item.visualDecision;
  delete item.imageManifestPath;
  delete item.imageStatus;
  delete item.imageValidatedAt;
  item.imageAssetIds = [];
}

if (write) {
  const ledger = await fs.readFile(ledgerPath, "utf8")
    .then(JSON.parse)
    .catch((error) => error?.code === "ENOENT" ? { schemaVersion: 1, entries: [] } : Promise.reject(error));
  const recordedPaths = new Set(ledger.entries.map((entry) => entry.originalPath));
  for (const move of moves) {
    const target = path.join(quarantineRoot, move.relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(move.file, move.content);
    await fs.rename(move.file, target);
    if (!recordedPaths.has(move.relative)) {
      ledger.entries.push({
        originalPath: move.relative,
        quarantinePath: path.relative(root, target).replace(/\\/g, "/"),
        sha256: crypto.createHash("sha256").update(move.content).digest("hex"),
        reason: "Artigo integral de fallback determinístico sem revisão editorial independente",
        quarantinedAt: now.toISOString(),
      });
    }
  }
  await fs.mkdir(quarantineRoot, { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const validated = CampaignSchema.parse(campaign);
  await fs.writeFile(campaignPath, `${JSON.stringify(validated, null, 2)}\n`);
  await fs.writeFile(
    path.join(root, "_data/editorial-calendar.json"),
    `${JSON.stringify(publicCampaignSummary(validated), null, 2)}\n`,
  );
}

if (check) {
  const ledger = await fs.readFile(ledgerPath, "utf8")
    .then(JSON.parse)
    .catch((error) => {
      quarantineIntegrityErrors.push(`ledger indisponível ou inválido: ${error.message}`);
      return { entries: [] };
    });
  for (const entry of ledger.entries || []) {
    const original = path.resolve(root, entry.originalPath);
    const quarantined = path.resolve(root, entry.quarantinePath);
    const originalContent = await fs.readFile(original).catch(() => null);
    if (originalContent) {
      const restoredText = originalContent.toString("utf8");
      if (editorialFallbackFingerprint(restoredText) || fallbackArtifactPaths.has(entry.originalPath)) {
        quarantineIntegrityErrors.push(`${entry.originalPath}: conteúdo de fallback reapareceu no caminho original`);
      }
    }
    const content = await fs.readFile(quarantined).catch((error) => {
      quarantineIntegrityErrors.push(`${entry.quarantinePath}: ${error.message}`);
      return null;
    });
    if (!content) continue;
    const digest = crypto.createHash("sha256").update(content).digest("hex");
    if (digest !== entry.sha256) quarantineIntegrityErrors.push(`${entry.quarantinePath}: hash divergente`);
    const frontmatter = content.toString("utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] || "";
    if (/^published:\s*true\s*$/mu.test(frontmatter)
        || /^status:\s*["']?(?:scheduled|published)["']?\s*$/mu.test(frontmatter)
        || /^editorial_status:\s*["']?(?:reviewed|published)["']?\s*$/mu.test(frontmatter)) {
      quarantineIntegrityErrors.push(`${entry.quarantinePath}: frontmatter ainda publicável`);
    }
  }
}

console.log(JSON.stringify({ write, check, quarantinedFiles, publishableContaminatedFiles, quarantinedItems, quarantineIntegrityErrors }, null, 2));
if (check && (publishableContaminatedFiles.length > 0 || quarantinedItems.length > 0 || quarantineIntegrityErrors.length > 0)) {
  throw new Error(`Fallback editorial inseguro: ${publishableContaminatedFiles.length} arquivo(s), ${quarantinedItems.length} item(ns), ${quarantineIntegrityErrors.length} erro(s) de integridade`);
}
