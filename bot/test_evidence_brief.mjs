import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { buildEvidenceBrief } from "./src/editorial/evidence-brief.js";
import { runCampaignProducer } from "./src/campaign_producer.js";
import { assertArticleResearchGrounding } from "./src/validation/article-research-grounding.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const research = JSON.parse(await fs.readFile(path.join(root, "content/research/campaign/spark-rc-team-expert-world-cup.json"), "utf8"));
const campaign = JSON.parse(await fs.readFile(path.join(root, "bot/editorial-campaign.json"), "utf8"));
const item = campaign.items.find((candidate) => candidate.id === research.slug);
assert.ok(item, "a pauta usada no teste precisa existir na campanha");

const result = buildEvidenceBrief({ item, research, today: "2026-08-13", env: {} });
const parsed = matter(result.content);
assert.equal(parsed.data.editorial_format, "evidence-brief-v1");
assert.equal(parsed.data.brand, "Scott", "a marca da bicicleta deve prevalecer sobre marcas de componentes");
assert.deepEqual(parsed.data.promoted_brands, ["Scott"]);
assert.equal(parsed.data.published, false);
assert.equal(parsed.data.editorial_status, "draft");
assert.equal(result.pipelineMetadata.evidenceBriefUsed, true);
assert.equal(result.pipelineMetadata.finalScore, 100);
assert.equal(result.pipelineMetadata.finalBlockers, 0);
assert.ok(result.pipelineMetadata.evidenceBriefGate.words >= 250);
assert.ok((result.content.match(/^## /gm) || []).length >= 6);
assert.match(result.content, /\| Documento \| Campo \| Valor registrado \|/);
assert.doesNotThrow(() => assertArticleResearchGrounding({ content: result.content, research }));

assert.throws(() => buildEvidenceBrief({
  item: { ...item, race: { eventIds: ["evento"] } },
  research,
  today: "2026-08-13",
  env: {},
}), /não substitui cobertura de corrida/);

assert.throws(() => buildEvidenceBrief({
  item,
  research: { ...research, confirmed_facts: research.confirmed_facts.slice(0, 4) },
  today: "2026-08-13",
  env: {},
}), /cinco fatos confirmados/);

const stagedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "thebiker-evidence-brief-"));
try {
  await fs.mkdir(path.join(stagedRoot, "bot"), { recursive: true });
  await fs.mkdir(path.join(stagedRoot, "_data"), { recursive: true });
  await fs.mkdir(path.join(stagedRoot, "content/product-links"), { recursive: true });
  await fs.mkdir(path.join(stagedRoot, "content/product-discovery"), { recursive: true });
  await fs.cp(path.join(root, "_data/product-knowledge"), path.join(stagedRoot, "_data/product-knowledge"), { recursive: true });
  await fs.copyFile(path.join(root, "content/product-links/thebiker-link-rules.json"), path.join(stagedRoot, "content/product-links/thebiker-link-rules.json"));
  await fs.copyFile(path.join(root, "content/product-discovery/thebiker-media-catalog.json"), path.join(stagedRoot, "content/product-discovery/thebiker-media-catalog.json"));

  const stagedCampaign = structuredClone(campaign);
  for (const candidate of stagedCampaign.items) candidate.status = "replaced";
  const stagedItem = stagedCampaign.items.find((candidate) => candidate.id === research.slug);
  stagedItem.status = "planned";
  delete stagedItem.postPath;
  delete stagedItem.aiReview;
  delete stagedItem.failure;
  delete stagedItem.blockReason;
  delete stagedItem.editorialReceipt;
  delete stagedItem.visualDecision;
  stagedItem.attempts = 0;
  await fs.writeFile(path.join(stagedRoot, "bot/editorial-campaign.json"), `${JSON.stringify(stagedCampaign, null, 2)}\n`);

  let aiCalls = 0;
  const produced = await runCampaignProducer({
    root: stagedRoot,
    now: new Date("2026-08-13T18:45:00.000Z"),
    env: {},
    researcher: { research: async () => structuredClone(research) },
    ai: { processCase: async () => { aiCalls += 1; throw new Error("falha de IA induzida"); } },
  });
  assert.equal(aiCalls, 1);
  assert.equal(produced.status, "validation");
  const persistedCampaign = JSON.parse(await fs.readFile(path.join(stagedRoot, "bot/editorial-campaign.json"), "utf8"));
  const persistedItem = persistedCampaign.items.find((candidate) => candidate.id === research.slug);
  assert.equal(persistedItem.aiReview.evidenceBriefUsed, true);
  assert.match(persistedItem.aiReview.fallbackReason, /falha de IA induzida/);
  assert.equal(persistedItem.aiReview.providers.fallback, "deterministic-evidence-brief-v1");
  assert.equal(matter(await fs.readFile(path.join(stagedRoot, produced.postPath), "utf8")).data.editorial_format, "evidence-brief-v1");

  persistedItem.status = "planned";
  persistedItem.attempts = 3;
  delete persistedItem.postPath;
  delete persistedItem.aiReview;
  await fs.writeFile(path.join(stagedRoot, "bot/editorial-campaign.json"), `${JSON.stringify(persistedCampaign, null, 2)}\n`);
  const retried = await runCampaignProducer({
    root: stagedRoot,
    now: new Date("2026-08-13T19:00:00.000Z"),
    env: {},
    researcher: { research: async () => structuredClone(research) },
    ai: { processCase: async () => { aiCalls += 1; throw new Error("esta chamada não deve ocorrer"); } },
  });
  assert.equal(retried.status, "validation");
  assert.equal(aiCalls, 1, "a quarta tentativa deve usar a contingência sem repetir chamadas de IA");
  const retriedCampaign = JSON.parse(await fs.readFile(path.join(stagedRoot, "bot/editorial-campaign.json"), "utf8"));
  const retriedItem = retriedCampaign.items.find((candidate) => candidate.id === research.slug);
  assert.equal(retriedItem.aiReview.evidenceBriefUsed, true);
  assert.match(retriedItem.aiReview.fallbackReason, /4 tentativas editoriais/);
} finally {
  await fs.rm(stagedRoot, { recursive: true, force: true });
}

console.log("Evidence brief tests passed.");
