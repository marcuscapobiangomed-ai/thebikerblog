import "dotenv/config";
import { runCampaignProducer } from "./campaign_producer.js";
import { finalizeCampaignItem } from "./campaign_finalize.js";

export async function runAutomation({ env = process.env, ai, publisher, now = new Date() } = {}) {
  if (env.AUTOMATION_ENABLED !== "true") {
    return { status: "disabled", message: "AUTOMATION_ENABLED não está ativo" };
  }

  // Compatibilidade histórica: os argumentos ai/publisher são ignorados.
  // Toda chamada usa o mesmo fluxo transacional da campanha, sem PR ou
  // aprovação humana: pesquisa -> produção -> crítica -> imagem -> recibo.
  const produced = await runCampaignProducer({ env, now });
  if (produced.status !== "validation") return produced;
  const finalized = await finalizeCampaignItem({ now });
  return { ...finalized, produced: produced.status, itemId: produced.itemId };
}

async function main() {
  const result = await runAutomation();
  console.log(JSON.stringify(result));
}

if (process.argv[1] && process.argv[1].endsWith("cron_post.js")) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
