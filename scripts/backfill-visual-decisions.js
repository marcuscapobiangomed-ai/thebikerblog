import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { assertVisualDecision, issueVisualDecision } from "../bot/src/validation/visual-decision.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const campaignPath = path.join(root, "bot/editorial-campaign.json");
const campaign = JSON.parse(await fs.readFile(campaignPath, "utf8"));
const catalog = JSON.parse(await fs.readFile(path.join(root, "content/product-discovery/thebiker-media-catalog.json"), "utf8"));

function articleData(content) {
  const match = String(content).match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("Frontmatter ausente");
  return yaml.load(match[1]);
}

for (const item of campaign.items.filter((candidate) => ["validation", "approved", "scheduled", "published"].includes(candidate.status))) {
  if (!item.postPath || !item.imageManifestPath) throw new Error(`${item.id}: artefatos visuais incompletos`);
  const [content, manifestText] = await Promise.all([
    fs.readFile(path.join(root, item.postPath), "utf8"),
    fs.readFile(path.join(root, item.imageManifestPath), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  item.visualDecision = issueVisualDecision({ item, article: articleData(content), manifest, catalog, now: new Date() });
  assertVisualDecision({ receipt: item.visualDecision, item, article: articleData(content), manifest, catalog });
  console.log(`${item.id}: ${item.visualDecision.score}/100`);
}

await fs.writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`, "utf8");
