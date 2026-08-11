import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function productsFromJsonLd(html, category, pageUrl) {
  const products = [];
  for (const match of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1]);
      const entries = Array.isArray(value) ? value : [value];
      for (const product of entries.filter((entry) => entry?.["@type"] === "Product")) {
        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        const productUrl = offer?.url || product.url;
        const images = (Array.isArray(product.image) ? product.image : [product.image]).filter(Boolean);
        if (!productUrl || images.length === 0) continue;
        const parsed = new URL(productUrl, pageUrl);
        const id = parsed.pathname.split("/").filter(Boolean).at(-1);
        products.push({
          id,
          name: product.name || id,
          brand: typeof product.brand === "string" ? product.brand : product.brand?.name || null,
          category,
          productUrl: parsed.href,
          images,
          sku: product.sku || null,
        });
      }
    } catch {}
  }
  return products;
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  return patterns.map((pattern) => String(html).match(pattern)?.[1]).find(Boolean) || null;
}

export function requiredProductFromPage(html, required) {
  const expectedPath = new URL(required.url).pathname.replace(/\/$/, "");
  const exact = productsFromJsonLd(html, required.category, required.url)
    .find((candidate) => new URL(candidate.productUrl).pathname.replace(/\/$/, "") === expectedPath);
  if (exact) return exact;
  const image = metaContent(html, "og:image");
  if (!image || !required.name || !required.brand) return null;
  return {
    id: expectedPath.split("/").filter(Boolean).at(-1),
    name: required.name,
    brand: required.brand,
    category: required.category,
    productUrl: required.url,
    images: [image.replace(/&amp;/g, "&").replace(/^http:/, "https:")],
    sku: null,
  };
}

export async function discoverTheBikerMedia({
  fetchImpl = fetch,
  maxPages = Number(process.env.MEDIA_DISCOVERY_MAX_PAGES || 12),
  configPath = path.join(root, "bot/config/official-image-sources.json"),
} = {}) {
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const products = new Map();
  for (const source of config.catalogPages) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL(source.url);
      url.searchParams.set("page", String(page));
      const response = await fetchImpl(url, { headers: { "user-agent": "TheBikerBlogMediaBot/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Catálogo visual ${url}: HTTP ${response.status}`);
      const found = productsFromJsonLd(await response.text(), source.category, url.href);
      if (found.length === 0) break;
      for (const product of found) {
        const official = config.officialProductImages?.[product.id];
        products.set(product.id, official ? {
          ...product,
          officialPageUrl: official.officialPageUrl,
          officialImages: official.images,
        } : product);
      }
    }
  }
  for (const required of config.requiredProductPages || []) {
    const response = await fetchImpl(required.url, { headers: { "user-agent": "TheBikerBlogMediaBot/1.0" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Produto visual obrigatorio ${required.url}: HTTP ${response.status}`);
    const product = requiredProductFromPage(await response.text(), required);
    if (!product) throw new Error(`Produto visual obrigatorio sem JSON-LD valido: ${required.url}`);
    const official = config.officialProductImages?.[product.id];
    products.set(product.id, official ? { ...product, officialPageUrl: official.officialPageUrl, officialImages: official.images } : product);
  }
  return {
    schemaVersion: 1,
    source: "https://thebikershop.com.br/",
    discoveredAt: new Date().toISOString(),
    rightsPolicyId: config.rightsPolicyId,
    total: products.size,
    products: [...products.values()],
  };
}

async function main() {
  const catalog = await discoverTheBikerMedia();
  const target = path.join(root, "content/product-discovery/thebiker-media-catalog.json");
  await fs.writeFile(target, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`${catalog.total} produtos com imagem oficial catalogados.`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
