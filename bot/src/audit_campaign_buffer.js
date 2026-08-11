import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { CampaignSchema, publicCampaignSummary } from "./automation/campaign.js";
import { ThreeProviderPipeline } from "./ai/three-provider-pipeline.js";
import { hashPayload } from "./ai/runtime.js";
import { hashEditorialText, issueEditorialReceipt } from "./validation/editorial-receipt.js";
import { classifyEditorialFailure } from "./validation/editorial-failures.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function extractJson(text) {
  const value = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(value); } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(value.slice(start, end + 1));
    throw new Error("Auditoria final sem JSON valido");
  }
}

async function persist(campaign) {
  await fs.writeFile(path.join(root, "bot/editorial-campaign.json"), JSON.stringify(campaign, null, 2) + "\n");
  await fs.writeFile(path.join(root, "_data/editorial-calendar.json"), JSON.stringify(publicCampaignSummary(campaign), null, 2) + "\n");
}

export async function auditCampaignBuffer({ env = process.env, now = new Date() } = {}) {
  const campaignFile = path.join(root, "bot/editorial-campaign.json");
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignFile, "utf8")));
  const pending = campaign.items.filter((item) =>
    item.status === "scheduled" &&
    ((item.aiReview?.finalScore ?? 0) < 90 || (item.aiReview?.finalBlockers ?? 0) > 0),
  );
  if (pending.length === 0) return { status: "idle", audited: 0 };

  const pipeline = new ThreeProviderPipeline({ env });
  const results = [];
  for (const item of pending) {
    const parsed = matter(await fs.readFile(path.resolve(root, item.postPath), "utf8"));
    const researchFile = path.join(root, "content/research/campaign", `${item.id}.json`);
    let research = null;
    try { research = JSON.parse(await fs.readFile(researchFile, "utf8")); } catch {}
    const response = await pipeline.callStep({
      step: "buffer-final-audit",
      providers: ["groq", "deepseek"],
      sourceHash: hashPayload({ research, article: parsed.content }),
      options: {
        jsonMode: true,
        temperature: 0,
        maxTokens: 1800,
        model: env.DEEPSEEK_FLASH_MODEL || "deepseek-v4-flash",
      },
      system: "Voce e o gate editorial final do blog oficial da TheBiker. Audite sem reescrever e responda somente em JSON. Nota abaixo de 90 ou qualquer bloqueador impede publicacao.",
      user: JSON.stringify({
        title: item.title,
        summary: item.summary,
        research,
        frontmatter: parsed.data,
        article: parsed.content,
        checks: [
          "alegacoes factuais sem apoio nas fontes",
          "marcas concorrentes promovidas",
          "produto, versao ou medida incompatível",
          "teste pratico nao realizado apresentado como realizado",
          "conteudo generico, repetitivo ou orientado a iniciante",
          "subtitulos fracos ou estrutura artificial de introducao/conclusao",
        ],
        output: { score: "calcule um inteiro de 0 a 100", blockers: [{ type: "...", detail: "..." }], warnings: [] },
      }),
    });
    const audit = extractJson(response.content);
    const score = Number(audit.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("Auditoria final retornou nota invalida");
    const blockers = Array.isArray(audit.blockers) ? audit.blockers : [];
    item.aiReview = {
      ...(item.aiReview || {}),
      score: item.aiReview?.score ?? null,
      finalScore: score,
      finalBlockers: blockers.length,
      premiumEditUsed: item.aiReview?.premiumEditUsed === true,
      providers: { ...(item.aiReview?.providers || {}), bufferFinalAudit: response.provider },
      generatedAt: item.aiReview?.generatedAt || now.toISOString(),
      contentHash: hashEditorialText(await fs.readFile(path.resolve(root, item.postPath), "utf8")),
      sourceHash: hashPayload(research),
    };
    if (item.status !== "published" && (score < Number(env.AI_FINAL_SCORE_THRESHOLD || 90) || blockers.length > 0)) {
      item.status = "blocked";
      const failureMessage = `Auditoria final: nota ${score}; ${blockers.map((entry) => entry.detail || entry.type).join("; ") || "nota abaixo do minimo"}`;
      item.failure = classifyEditorialFailure(failureMessage, { stage: "buffer-audit", now });
      item.blockReason = `[${item.failure.code}] ${item.failure.message}`;
      delete item.editorialReceipt;
    } else {
      const scheduledContent = await fs.readFile(path.resolve(root, item.postPath), "utf8");
      item.editorialReceipt = issueEditorialReceipt({
        content: scheduledContent,
        researchContent: research === null ? null : JSON.stringify(research),
        aiReview: item.aiReview,
        now,
        origin: "buffer-audit",
      });
      delete item.failure;
    }
    results.push({ itemId: item.id, score, blockers: blockers.length, provider: response.provider });
    await persist(campaign);
  }
  const rejected = results.filter((result) => result.score < 90 || result.blockers > 0);
  if (rejected.length > 0) throw new Error(`Buffer reprovado: ${rejected.map((result) => `${result.itemId} (${result.score}/${result.blockers})`).join(", ")}`);
  return { status: "audited", audited: results.length, results };
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  auditCampaignBuffer().then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
