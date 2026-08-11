import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = process.env.SITE_URL;
if (!siteUrl) throw new Error("SITE_URL obrigatoria");
const campaign = JSON.parse(await fs.readFile(path.join(root, "bot/editorial-campaign.json"), "utf8"));
const published = campaign.items.filter((item) => item.status === "published");
const errors = [];

function articleData(content) {
  const match = String(content).match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("Frontmatter ausente");
  return yaml.load(match[1]);
}

for (const item of published) {
  const postPath = path.join(root, item.postPath || `_posts/${item.publishDate}-${item.id}.md`);
  const post = { data: articleData(await fs.readFile(postPath, "utf8")) };
  const [year, month] = item.publishDate.split("-");
  const pageUrl = new URL(`${year}/${month}/${post.data.slug || item.id}/`, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
  const pageResponse = await fetch(pageUrl, { redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!pageResponse.ok) { errors.push(`${item.id}: pagina HTTP ${pageResponse.status}`); continue; }
  const html = await pageResponse.text();
  const imagePath = String(post.data.image || "");
  if (!imagePath || !html.includes(imagePath)) errors.push(`${item.id}: HTML nao referencia a capa aprovada`);
  if (!html.includes(String(post.data.image_credit || ""))) errors.push(`${item.id}: credito da imagem ausente do HTML`);
  const imageUrl = new URL(imagePath.replace(/^\//, ""), siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
  const imageResponse = await fetch(imageUrl, { redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!imageResponse.ok) { errors.push(`${item.id}: imagem HTTP ${imageResponse.status}`); continue; }
  const remote = Buffer.from(await imageResponse.arrayBuffer());
  const local = await fs.readFile(path.join(root, imagePath.replace(/^\//, "")));
  const digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
  if (digest(remote) !== digest(local)) errors.push(`${item.id}: hash da imagem publicada diverge do artefato aprovado`);
}

if (errors.length) {
  console.error(`Prova publica visual reprovada:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Prova publica visual aprovada: ${published.length} post(s), HTML, credito e hash conferidos.`);
}
