import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AIProvider } from "./gemini.js";
import { GitHubPublisher } from "./publisher.js";
import { loadQueue, selectReadyItem } from "./automation/queue.js";
import { validateResearch } from "./schemas/research.schema.js";
import { syncProductKnowledge } from "./knowledge/product-knowledge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, "../..");
const queuePath = path.resolve(repositoryRoot, process.env.AUTOMATION_QUEUE_PATH || "bot/automation-queue.json");

export async function runAutomation({ env = process.env, ai, publisher, now = new Date() } = {}) {
  if (env.AUTOMATION_ENABLED !== "true") {
    return { status: "disabled", message: "AUTOMATION_ENABLED não está ativo" };
  }

  const queue = await loadQueue(queuePath, repositoryRoot);
  const item = selectReadyItem(queue, now);
  if (!item) return { status: "idle", message: "Nenhuma pauta elegível na fila" };

  const researchData = validateResearch(JSON.parse(await fs.readFile(item.researchFile, "utf8")));
  if (researchData.status && researchData.status !== "pesquisa_concluida") {
    throw new Error(`Pesquisa de ${item.id} ainda não está concluída`);
  }

  const github = publisher || new GitHubPublisher({ env });
  const existing = await github.findOpenPullRequest(`content/${item.id}`);
  if (existing) {
    return { status: "waiting-review", itemId: item.id, prUrl: existing.html_url };
  }

  if (env.AUTOMATION_DRY_RUN === "true") {
    return { status: "ready", itemId: item.id, researchPath: item.researchPath };
  }

  const provider = ai || new AIProvider();
  const post = await provider.processCase(item.topic, { ...researchData, editorialPriority: item.priority });
  const knowledgeSync = await syncProductKnowledge(researchData, { root: repositoryRoot, syncedAt: now.toISOString().slice(0, 10) });
  const productKnowledge = knowledgeSync?.record || null;
  const prUrl = await github.publishPost({
    postContent: post.content,
    slug: item.id,
    researchData,
    productKnowledge,
    imageManifest: null,
    imageProductionPlan: post.imageProductionPlan,
    checklist: post.claims || [],
  });
  return { status: "pr-created", itemId: item.id, prUrl };
}

async function main() {
  throw new Error(
    "Entrypoint automation:run legado bloqueado. Use campaign:produce e campaign:finalize, que exigem ledger, imagens, recibos e gates.",
  );
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
