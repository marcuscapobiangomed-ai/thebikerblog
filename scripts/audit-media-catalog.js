import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "bot/config/official-image-sources.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "content/product-discovery/thebiker-media-catalog.json"), "utf8"));
const campaign = JSON.parse(fs.readFileSync(path.join(root, "bot/editorial-campaign.json"), "utf8"));
const byId = new Map((catalog.products || []).map((product) => [product.id, product]));
const errors = [];

for (const required of config.requiredProductPages || []) {
  const expectedPath = new URL(required.url).pathname.replace(/\/$/, "");
  if (!(catalog.products || []).some((product) => new URL(product.productUrl).pathname.replace(/\/$/, "") === expectedPath)) {
    errors.push(`produto obrigatorio ausente do catalogo: ${required.url}`);
  }
}

for (const item of campaign.items.filter((candidate) => ["validation", "approved", "scheduled", "published"].includes(candidate.status))) {
  if (["exact-product", "real-context"].includes(item.heroImage?.mode)) {
    const product = byId.get(item.heroImage.productId);
    if (!product) errors.push(`${item.id}: produto visual ${item.heroImage.productId} ausente do catalogo`);
    else if (!product.productUrl || !(product.images || product.officialImages || []).length) errors.push(`${item.id}: produto visual sem pagina ou imagem oficial`);
  }
}

if (errors.length) {
  console.error(`Catalogo visual reprovado:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Catalogo visual aprovado: ${catalog.total} produtos; cobertura integral das pautas ativas.`);
}
