import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { replenishCampaignBuffer } from "../bot/src/automation/replenish-buffer.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceCampaign = JSON.parse(await fs.readFile(path.join(root, "bot/editorial-campaign.json"), "utf8"));
const publishedTemplate = structuredClone(sourceCampaign.items.find((item) => item.status === "published" && item.aiReview?.contentHash));
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "thebiker-replenish-"));
await fs.mkdir(path.join(fixtureRoot, "bot"), { recursive: true });

const fixture = structuredClone(sourceCampaign);
const next = fixture.items.find((item) => item.publishDate === "2026-08-14");
next.status = "planned";
next.postPath = undefined;
next.aiReview = undefined;
next.editorialReceipt = undefined;
next.visualDecision = undefined;
next.imageManifestPath = undefined;
next.imageStatus = undefined;
next.imageValidatedAt = undefined;
next.imageAssetIds = [];
next.failure = undefined;
next.blockReason = undefined;
for (const item of fixture.items.filter((candidate) => candidate.publishDate > "2026-08-14")) {
  if (item.status === "scheduled" || item.status === "published") continue;
  item.status = item.status === "blocked" ? "blocked" : "planned";
}
await fs.writeFile(path.join(fixtureRoot, "bot/editorial-campaign.json"), JSON.stringify(fixture, null, 2) + "\n");

async function load() {
  return JSON.parse(await fs.readFile(path.join(fixtureRoot, "bot/editorial-campaign.json"), "utf8"));
}
async function save(campaign) {
  await fs.writeFile(path.join(fixtureRoot, "bot/editorial-campaign.json"), JSON.stringify(campaign, null, 2) + "\n");
}

let recoveryCalls = 0;
let productionCalls = 0;
let finalizationCalls = 0;
const now = new Date("2026-08-13T15:00:00-03:00");

const fakeRecover = async () => {
  recoveryCalls += 1;
  const campaign = await load();
  const blocked = campaign.items.find((item) => item.status === "blocked" && item.publishDate >= "2026-08-13");
  if (!blocked) return { status: "idle" };
  blocked.status = "planned";
  delete blocked.failure;
  delete blocked.blockReason;
  await save(campaign);
  return { status: "retry", itemId: blocked.id };
};

const fakeProduce = async () => {
  productionCalls += 1;
  const campaign = await load();
  const item = campaign.items.find((candidate) => candidate.status === "planned");
  if (!item) return { status: "idle" };
  item.status = "validation";
  item.postPath = `_posts/drafts/${item.publishDate}-${item.id}.md`;
  item.aiReview = structuredClone(publishedTemplate.aiReview);
  await save(campaign);
  return { status: "validation", itemId: item.id };
};

const fakeFinalize = async () => {
  finalizationCalls += 1;
  const campaign = await load();
  const item = campaign.items.find((candidate) => candidate.status === "validation");
  if (!item) return { status: "idle" };
  if (finalizationCalls === 1) {
    item.status = "blocked";
    item.failure = {
      code: "IMAGE_NOT_PUBLISHABLE",
      retryable: true,
      stage: "finalization",
      message: "imagem simuladamente indisponível",
      recordedAt: now.toISOString(),
    };
    item.blockReason = "Validação final: imagem simuladamente indisponível";
    await save(campaign);
    throw new Error("imagem simuladamente indisponível");
  }
  item.status = "scheduled";
  item.imageStatus = "approved";
  item.imageManifestPath = "assets/img/posts/test/image-manifest.json";
  item.imageAssetIds = ["test-image"];
  item.visualDecision = structuredClone(publishedTemplate.visualDecision);
  item.editorialReceipt = structuredClone(publishedTemplate.editorialReceipt);
  await save(campaign);
  return { status: "scheduled", itemId: item.id };
};

const result = await replenishCampaignBuffer({
  root: fixtureRoot,
  now,
  targetBuffer: 1,
  requiredDate: "2026-08-13",
  maxAttempts: 3,
  producer: fakeProduce,
  finalizer: fakeFinalize,
  recoverer: fakeRecover,
});

assert.equal(result.status, "replenished", "o failover deve recompor o buffer após falha de finalização");
assert.equal(result.futureScheduled, 1, "a pauta recuperada deve terminar em scheduled");
assert.equal(finalizationCalls, 2, "a finalização deve ser tentada novamente no mesmo ciclo de recuperação");
assert.ok(recoveryCalls >= 2, "a recuperação deve ser executada antes da nova tentativa");
assert.equal(productionCalls, 2, "a segunda tentativa deve reutilizar a pauta recuperada, sem publicar conteúdo parcial");

const partial = await replenishCampaignBuffer({
  root: fixtureRoot,
  now,
  targetBuffer: 2,
  maxAttempts: 1,
  allowPartial: true,
  producer: async () => ({ status: "idle" }),
  finalizer: async () => ({ status: "idle" }),
  recoverer: async () => ({ status: "idle" }),
});
assert.equal(partial.status, "partial", "a recomposição periódica pode registrar avanço parcial sem mascarar o estado");

await fs.rm(fixtureRoot, { recursive: true, force: true });
console.log("Recomposição do buffer e failover de finalização validados com sucesso.");
