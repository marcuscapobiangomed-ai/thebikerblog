import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { replenishCampaignBuffer } from "../bot/src/automation/replenish-buffer.js";
import { retryCampaignFinalization } from "../bot/src/retry_campaign_finalization.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceCampaign = JSON.parse(await fs.readFile(path.join(root, "bot/editorial-campaign.json"), "utf8"));
const publishedTemplate = {
  aiReview: {
    score: 95,
    finalScore: 95,
    finalBlockers: 0,
    premiumEditUsed: false,
    providers: { fixture: "fixture" },
    generatedAt: "2026-08-20T12:00:00.000Z",
    contentHash: `sha256:${"a".repeat(64)}`,
  },
  visualDecision: {
    schemaVersion: 1,
    policyVersion: "thebiker-visual-autonomy-v1",
    inputHash: `sha256:${"b".repeat(64)}`,
    mode: "real-context",
    productId: null,
    score: 100,
    hardGates: { fixture: true },
    blockers: [],
    issuedAt: "2026-08-20T12:00:00.000Z",
  },
  editorialReceipt: {
    schemaVersion: 1,
    policyVersion: "fixture-v1",
    origin: "pipeline",
    reviewedContentHash: `sha256:${"c".repeat(64)}`,
    scheduledContentHash: `sha256:${"d".repeat(64)}`,
    researchHash: null,
    sourceHash: null,
    finalScore: 95,
    finalBlockers: 0,
    issuedAt: "2026-08-20T12:00:00.000Z",
  },
};
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "thebiker-replenish-"));
await fs.mkdir(path.join(fixtureRoot, "bot"), { recursive: true });

const fixture = structuredClone(sourceCampaign);
const fixtureDate = fixture.startsOn;
// This fixture exercises the retry path itself. It must not inherit a live
// scheduled item from the production campaign, otherwise the buffer target is
// already satisfied and the producer/finalizer are never called.
for (const item of fixture.items) {
  item.status = "planned";
  item.category = "engenharia";
  delete item.race;
  item.productIds = [];
  item.heroImage = { mode: "conceptual" };
  item.postPath = undefined;
  item.aiReview = undefined;
  item.editorialReceipt = undefined;
  item.visualDecision = undefined;
  item.imageManifestPath = undefined;
  item.imageStatus = undefined;
  item.imageValidatedAt = undefined;
  item.imageAssetIds = [];
  item.failure = undefined;
  item.blockReason = undefined;
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
const now = new Date(`${fixtureDate}T15:00:00-03:00`);

const fakeRecover = async () => {
  recoveryCalls += 1;
  const campaign = await load();
  const blocked = campaign.items.find((item) => item.status === "blocked" && item.publishDate >= fixtureDate);
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
  requiredDate: fixtureDate,
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

const retryFixture = structuredClone(sourceCampaign);
for (const item of retryFixture.items.filter((candidate) => candidate.status === "blocked")) {
  item.status = "planned";
  delete item.blockReason;
  delete item.failure;
}
const retryItem = retryFixture.items[0];
Object.assign(retryItem, {
  category: "engenharia",
  productIds: [],
  heroImage: { mode: "conceptual" },
  postPath: `_posts/drafts/${retryItem.publishDate}-${retryItem.id}.md`,
  aiReview: structuredClone(publishedTemplate.aiReview),
  imageStatus: "approved",
  imageManifestPath: "assets/img/posts/test/image-manifest.json",
  imageAssetIds: ["test-image"],
  visualDecision: structuredClone(publishedTemplate.visualDecision),
  editorialReceipt: structuredClone(publishedTemplate.editorialReceipt),
});
delete retryItem.race;
retryItem.status = "blocked";
retryItem.failure = {
  code: "IMAGE_NOT_PUBLISHABLE",
  retryable: false,
  stage: "finalization",
  message: "Galeria oficial sem imagem inédita válida",
  recordedAt: now.toISOString(),
};
retryItem.blockReason = `Validação final: [IMAGE_NOT_PUBLISHABLE] ${retryItem.failure.message}`;
await save(retryFixture);
let retryOptions = null;
const retryResult = await retryCampaignFinalization({
  root: fixtureRoot,
  now,
  env: { CAMPAIGN_FINALIZATION_MAX_ATTEMPTS: "4" },
  replenisher: async (options) => {
    retryOptions = options;
    return { status: "replenished", requiredReady: true };
  },
});
const scheduledBeforeRetry = retryFixture.items.filter((item) => item.publishDate >= fixtureDate && item.status === "scheduled").length;
assert.equal(retryResult.status, "scheduled");
assert.equal(retryOptions.targetBuffer, scheduledBeforeRetry + 1, "failover precisa exigir um novo artigo além do buffer existente");
assert.equal(retryOptions.requiredDate, retryItem.publishDate, "a data da pauta bloqueada precisa terminar pronta");
assert.equal(retryOptions.maxAttempts, 4, "o número de tentativas precisa ser limitado e configurável");

await fs.rm(fixtureRoot, { recursive: true, force: true });
console.log("Recomposição do buffer e failover de finalização validados com sucesso.");
