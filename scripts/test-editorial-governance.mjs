import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import campaignFixture from "../bot/editorial-campaign.json" with { type: "json" };
import { auditCampaignShadow } from "../bot/src/validation/audit-campaign-shadow.js";
import { classifyEditorialFailure, EditorialFailureCode } from "../bot/src/validation/editorial-failures.js";
import { assertScheduledReceipt, hashEditorialText, issueEditorialReceipt } from "../bot/src/validation/editorial-receipt.js";
import { buildSystemPrompt } from "../bot/src/editorial-prompt.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await fs.readFile(path.join(repositoryRoot, ".github/workflows/cron-post.yml"), "utf8");
assert.match(workflow, /id: validation/);
assert.match(workflow, /steps\.validation\.outcome == 'success'/);
assert.match(workflow, /Persistir somente estado seguro da falha/);
assert.match(workflow, /run: npm run validate:ci/);
assert.doesNotMatch(workflow, /run: npm run links:thebiker/);
assert.match(buildSystemPrompt(), /imbatível/);

assert.equal(classifyEditorialFailure("Gate Markdown: linguagem publicitária proibida: imbatível").code, EditorialFailureCode.POLICY_MARKETING_LANGUAGE);
assert.equal(classifyEditorialFailure("provider timeout").retryable, true);
assert.equal(classifyEditorialFailure("Integridade editorial divergente").retryable, false);

const content = `---
published: false
tags: ["ciclismo", "componentes"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Conteúdo técnico sustentado pelas fontes declaradas.
`;
const aiReview = {
  score: 92,
  finalScore: 95,
  finalBlockers: 0,
  premiumEditUsed: true,
  providers: { final: "deepseek" },
  generatedAt: "2026-08-11T12:00:00.000Z",
  contentHash: hashEditorialText(content),
};
const receipt = issueEditorialReceipt({ content, researchContent: "{}", aiReview, now: new Date("2026-08-11T12:00:00Z") });
const receiptItem = { id: "teste-recibo-editorial", aiReview, editorialReceipt: receipt };
assert.equal(assertScheduledReceipt(content, receiptItem), receipt.scheduledContentHash);
assert.throws(() => assertScheduledReceipt(`${content}\nAlteração posterior.`, receiptItem), /Hash do artefato agendado divergente/);

const root = await fs.mkdtemp(path.join(os.tmpdir(), "thebiker-editorial-governance-"));
try {
  const campaign = structuredClone(campaignFixture);
  for (const item of campaign.items) {
    item.status = "planned";
    delete item.postPath;
    delete item.editorialReceipt;
    delete item.failure;
  }
  const item = campaign.items.find((candidate) => candidate.publishDate >= "2026-08-11");
  item.status = "scheduled";
  item.postPath = `_posts/drafts/${item.publishDate}-${item.id}.md`;
  item.aiReview = structuredClone(aiReview);
  item.editorialReceipt = structuredClone(receipt);
  await fs.mkdir(path.join(root, "bot"), { recursive: true });
  await fs.mkdir(path.dirname(path.join(root, item.postPath)), { recursive: true });
  await fs.writeFile(path.join(root, "bot/editorial-campaign.json"), `${JSON.stringify(campaign, null, 2)}\n`);
  await fs.writeFile(path.join(root, item.postPath), content);

  const approved = await auditCampaignShadow({ root, now: new Date("2026-08-11T12:00:00Z") });
  assert.equal(approved.errors, 0);
  assert.equal(approved.warnings, 0);

  await fs.writeFile(path.join(root, item.postPath), `${content}\nEste produto é imbatível.\n`);
  const rejected = await auditCampaignShadow({ root, now: new Date("2026-08-11T12:00:00Z") });
  assert.ok(rejected.errors >= 2);
  assert.ok(rejected.findings.some((finding) => finding.code === EditorialFailureCode.POLICY_MARKETING_LANGUAGE));
  assert.ok(rejected.findings.some((finding) => finding.code === EditorialFailureCode.CONTENT_HASH_MISMATCH));

  campaign.items[item.day - 1].status = "blocked";
  await fs.writeFile(path.join(root, "bot/editorial-campaign.json"), `${JSON.stringify(campaign, null, 2)}\n`);
  const quarantined = await auditCampaignShadow({ root, now: new Date("2026-08-11T12:00:00Z") });
  assert.equal(quarantined.errors, 0);
  assert.ok(quarantined.warnings >= 1);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log("Governança editorial, recibos e shadow gate validados com sucesso.");
