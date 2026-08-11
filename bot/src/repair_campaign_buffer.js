import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { CampaignSchema, publicCampaignSummary } from "./automation/campaign.js";
import { ThreeProviderPipeline } from "./ai/three-provider-pipeline.js";
import { hashPayload } from "./ai/runtime.js";
import { auditCampaignBuffer } from "./audit_campaign_buffer.js";
import { assertMarkdownPublicationGates, MARKDOWN_POLICY_GUIDANCE } from "./validation/markdown-publication-gates.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function extractMarkdown(text) {
  return String(text || "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

async function persist(campaign) {
  await fs.writeFile(path.join(root, "bot/editorial-campaign.json"), JSON.stringify(campaign, null, 2) + "\n");
  await fs.writeFile(path.join(root, "_data/editorial-calendar.json"), JSON.stringify(publicCampaignSummary(campaign), null, 2) + "\n");
}

export async function repairCampaignBuffer({ env = process.env } = {}) {
  const campaignFile = path.join(root, "bot/editorial-campaign.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignFile, "utf8")));
  const blockedIds = campaign.items
    .filter((item) =>
      (item.status === "blocked" && (item.failure?.stage === "buffer-audit" || /Auditoria final:/i.test(item.blockReason || ""))) ||
      (item.status === "published" && ((item.aiReview?.finalScore ?? 0) < 90 || (item.aiReview?.finalBlockers ?? 0) > 0)),
    )
    .map((item) => item.id);
  const pipeline = new ThreeProviderPipeline({ env });
  const results = [];

  for (const itemId of blockedIds) {
    const latest = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignFile, "utf8")));
    const item = latest.items.find((entry) => entry.id === itemId);
    const originalStatus = item.status;
    const originalReview = structuredClone(item.aiReview);
    const originalReceipt = structuredClone(item.editorialReceipt);
    const originalFailure = structuredClone(item.failure);
    let postFile;
    let originalRaw;
    try {
      postFile = path.resolve(root, item.postPath);
      const raw = await fs.readFile(postFile, "utf8");
      originalRaw = raw;
      const parsed = matter(raw);
      const research = JSON.parse(await fs.readFile(path.join(root, "content/research/campaign", `${item.id}.json`), "utf8"));
      const response = await pipeline.callStep({
        step: "buffer-repair",
        providers: ["deepseek"],
        sourceHash: hashPayload({ research, article: parsed.content, reason: item.blockReason }),
        options: {
          jsonMode: false,
          temperature: 0.1,
          maxTokens: 12000,
          model: env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
        },
        system: [
          "Voce e o editor tecnico senior do blog oficial da TheBiker.",
          "Reescreva usando apenas a pesquisa fornecida e sem inventar testes, medidas ou disponibilidade.",
          "Nao promova concorrentes. Escreva para ciclistas experientes, com subtitulos fortes.",
          ...MARKDOWN_POLICY_GUIDANCE,
          "Nao use secoes chamadas Introducao ou Conclusao. Responda somente com o corpo em Markdown, sem JSON e sem frontmatter.",
        ].join("\n"),
        user: JSON.stringify({
          title: item.title,
          summary: item.summary,
          auditFailure: item.blockReason,
          research,
          requirements: [
            "entre 1600 e 2200 palavras uteis; conte antes de responder",
            "ao menos 5 subtitulos H2 em Markdown",
            "corrigir todos os bloqueios",
            "nao incluir frontmatter",
            "preservar Perguntas Frequentes quando for util",
          ],
        }),
      });
      const repaired = extractMarkdown(response.content);
      if (!repaired) throw new Error("Reparo sem corpo Markdown");
      if ((repaired.match(/^##\s+/gm) || []).length < 5) throw new Error("Reparo com menos de cinco H2");
      if (repaired.trim().split(/\s+/).length < 1200) throw new Error("Reparo com menos de 1200 palavras");
      if (/^##\s+(introducao|introdução|conclusao|conclusão)\b/im.test(repaired)) throw new Error("Reparo com secao generica proibida");
      const frontmatter = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
      if (!frontmatter) throw new Error("Frontmatter nao encontrado");
      const repairedContent = `${frontmatter[0]}\n${repaired.trim()}\n`;
      assertMarkdownPublicationGates(repairedContent);
      await fs.writeFile(postFile, repairedContent);
      item.status = "scheduled";
      delete item.blockReason;
      delete item.failure;
      delete item.editorialReceipt;
      await persist(latest);
      await auditCampaignBuffer({ env });
      if (originalStatus === "published") {
        const promoted = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignFile, "utf8")));
        const promotedItem = promoted.items.find((entry) => entry.id === itemId);
        promotedItem.status = "published";
        await persist(promoted);
      }
      results.push({ itemId, status: "repaired-and-approved", provider: response.provider });
    } catch (error) {
      if (originalStatus === "published") {
        if (postFile && originalRaw) await fs.writeFile(postFile, originalRaw);
        const rollback = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignFile, "utf8")));
        const rollbackItem = rollback.items.find((entry) => entry.id === itemId);
        rollbackItem.status = "published";
        rollbackItem.aiReview = originalReview;
        rollbackItem.editorialReceipt = originalReceipt;
        rollbackItem.failure = originalFailure;
        delete rollbackItem.blockReason;
        await persist(rollback);
      }
      results.push({ itemId, status: "blocked", error: String(error.message || error).slice(0, 300) });
    }
  }
  const failed = results.filter((result) => result.status === "blocked");
  console.log(JSON.stringify({ repaired: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length > 0) throw new Error(`Reparo incompleto: ${failed.map((entry) => entry.itemId).join(", ")}`);
  return results;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  repairCampaignBuffer().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
