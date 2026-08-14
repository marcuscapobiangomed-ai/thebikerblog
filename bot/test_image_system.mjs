#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ImageManifestV2Schema,
  validateImageManifestV2,
} from "./src/validation/image-manifest-v2.js";
import { prepareImageVariants } from "./src/images/prepare-variants.js";
import fsPromises from "node:fs/promises";
import os from "node:os";
import sharp from "sharp";
import { selectImageCandidate, selectImageCandidates } from "./src/images/select-image.js";
import { imageArticleConsistencyErrors } from "./src/validation/image-article-consistency.js";
import { issueVisualDecision, visualDecisionErrors } from "./src/validation/visual-decision.js";
import { alignCampaignVisual, alignRealContextVisual } from "./src/images/align-campaign-visual.js";
import { assertCampaignVisualAvailable, productImageCandidates } from "./src/images/official-campaign-image.js";
import { perceptualHash, sha256 } from "./src/images/dedupe.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalog = { products: [{
  id: "addict-rc-pro",
  name: "Bicicleta Scott Addict RC Pro Di2 2026",
  brand: "Scott",
  category: "bikes",
  productUrl: "https://thebikershop.com.br/produtos/addict-rc-pro/",
}] };
const conceptualComparisonCandidate = selectImageCandidate({
  id: "addict-rc-20-vs-pro",
  title: "Addict RC 20 ou RC Pro: rodas e pneus em comparação",
  summary: "Comparação técnica de rodas, pneus e cockpit das duas Addict.",
  productIds: [],
}, catalog, { assets: [] });
assert.equal(conceptualComparisonCandidate, null, "pauta sem produto visual explícito deve permanecer conceitual");
const explicitCandidate = selectImageCandidate({
  id: "addict-rc-20-vs-pro",
  title: "Addict RC 20 ou RC Pro: rodas e pneus em comparação",
  summary: "Comparação técnica de rodas, pneus e cockpit das duas Addict.",
  productIds: ["addict-rc-pro"],
}, catalog, { assets: [] });
assert.equal(explicitCandidate?.product.id, "addict-rc-pro", "produto visual explícito deve ser selecionado por ID");
assert.equal(selectImageCandidate({
  id: "produto-ausente",
  title: "Produto visual ausente no catálogo editorial",
  summary: "A seleção precisa falhar fechada quando o produto solicitado não existe.",
  productIds: ["nao-existe"],
}, catalog, { assets: [] }), null);
const configuredManufacturerCandidates = await productImageCandidates({
  id: "bicicleta-scott-scale-940-black",
  brand: "Scott",
  productUrl: "https://thebikershop.com.br/produtos/bicicleta-scott-scale-940-black/",
  images: [],
}, {
  allowedPageHosts: ["thebikershop.com.br"],
  officialProductImages: {
    "bicicleta-scott-scale-940-black": {
      officialPageUrl: "https://www.scott-sports.com/global/en/product/scott-scale-940-bike",
      images: ["https://static.scott-sports.com/image/upload/v1779976552/2217844.png"],
    },
  },
}, async () => { throw new Error("a página da loja não deve ser necessária quando há imagem oficial configurada"); });
assert.deepEqual(configuredManufacturerCandidates[0], {
  url: "https://static.scott-sports.com/image/upload/v1779976552/2217844.png",
  sourceType: "manufacturer",
  sourceName: "Scott",
  sourcePageUrl: "https://www.scott-sports.com/global/en/product/scott-scale-940-bike",
});

const galleryCandidateUrl = "https://acdn-us.mitiendanube.com/stores/001/062/247/products/scale-gallery-1024-1024.webp";
const manufacturerAndGallery = await productImageCandidates({
  id: "bicicleta-scott-scale-940-black",
  brand: "Scott",
  productUrl: "https://thebikershop.com.br/produtos/bicicleta-scott-scale-940-black/",
  images: [],
}, {
  allowedPageHosts: ["thebikershop.com.br"],
  officialProductImages: {
    "bicicleta-scott-scale-940-black": {
      officialPageUrl: "https://www.scott-sports.com/global/en/product/scott-scale-940-bike",
      images: ["https://static.scott-sports.com/image/upload/scale.png"],
    },
  },
}, async () => ({
  ok: true,
  text: async () => `<a href="//acdn-us.mitiendanube.com/stores/001/062/247/products/scale-gallery-1024-1024.webp" data-fancybox="product-gallery">foto</a>`,
}));
assert.ok(manufacturerAndGallery.some((candidate) => candidate.url === galleryCandidateUrl),
  "imagem oficial configurada não pode impedir a descoberta das alternativas da galeria");

const ordered = selectImageCandidates({ id: "contexto", productIds: ["produto-usado", "produto-livre"] }, {
  products: [
    { id: "produto-usado", productUrl: "https://thebikershop.com.br/produtos/usado/" },
    { id: "produto-livre", productUrl: "https://thebikershop.com.br/produtos/livre/" },
  ],
}, { assets: [{ sourcePageUrl: "https://thebikershop.com.br/produtos/usado/", uses: [{ postId: "outro", usedAt: "2026-08-14T12:00:00.000Z" }] }] });
assert.equal(ordered[0]?.product.id, "produto-livre", "produto ainda não consumido precisa ser tentado primeiro");

const visualProbeRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "thebiker-visual-probe-"));
try {
  await Promise.all([
    fsPromises.mkdir(path.join(visualProbeRoot, "bot/config"), { recursive: true }),
    fsPromises.mkdir(path.join(visualProbeRoot, "content/product-discovery"), { recursive: true }),
    fsPromises.mkdir(path.join(visualProbeRoot, "content/image-rights"), { recursive: true }),
    fsPromises.mkdir(path.join(visualProbeRoot, "content/image-library"), { recursive: true }),
  ]);
  const duplicateBuffer = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#224466" } }).webp().toBuffer();
  const lowResolutionBuffer = await sharp({ create: { width: 480, height: 480, channels: 3, background: "#6688aa" } }).webp().toBuffer();
  const publishableBuffer = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#aa4422" } })
    .composite([{ input: { create: { width: 600, height: 800, channels: 3, background: "#f5f5f5" } }, left: 0, top: 0 }])
    .webp()
    .toBuffer();
  const firstProduct = "produto-imagem-esgotada";
  const secondProduct = "produto-imagem-disponivel";
  const assetHost = "acdn-us.mitiendanube.com";
  const config = {
    allowedPageHosts: ["thebikershop.com.br"],
    allowedAssetHosts: [assetHost],
    maximumDownloadBytes: 12_582_912,
    minimumPublishableLongEdge: 1600,
    minimumPublishableShortEdge: 800,
    minimumStandardLongEdge: 800,
    minimumStandardShortEdge: 600,
    officialProductImages: {
      [firstProduct]: {
        officialPageUrl: "https://thebikershop.com.br/produtos/esgotada/",
        images: [`https://${assetHost}/duplicate.webp`],
      },
    },
  };
  const products = [
    { id: firstProduct, name: "Produto esgotado", brand: "Scott", productUrl: "https://thebikershop.com.br/produtos/esgotada/", images: [`https://${assetHost}/forbidden.webp`, `https://${assetHost}/low.webp`] },
    { id: secondProduct, name: "Produto disponível", brand: "Scott", productUrl: "https://thebikershop.com.br/produtos/disponivel/", images: [`https://${assetHost}/publishable.webp`] },
  ];
  const rights = { id: "visual-rights", status: "approved", authorizationBasis: "catálogo oficial", license: "uso editorial" };
  const library = {
    schemaVersion: 1,
    updatedAt: "2026-08-14T12:00:00.000Z",
    assets: [{
      assetId: "duplicate-existing",
      sha256: sha256(duplicateBuffer),
      perceptualHash: await perceptualHash(duplicateBuffer),
      sourcePageUrl: "https://thebikershop.com.br/produtos/esgotada/",
      uses: [{ postId: "artigo-anterior", position: "hero", usedAt: "2026-08-14T12:00:00.000Z" }],
    }],
  };
  await Promise.all([
    fsPromises.writeFile(path.join(visualProbeRoot, "bot/config/official-image-sources.json"), JSON.stringify(config)),
    fsPromises.writeFile(path.join(visualProbeRoot, "content/product-discovery/thebiker-media-catalog.json"), JSON.stringify({ products })),
    fsPromises.writeFile(path.join(visualProbeRoot, "content/image-rights/thebiker-official-editorial-v1.json"), JSON.stringify(rights)),
    fsPromises.writeFile(path.join(visualProbeRoot, "content/image-rights/official-brand-editorial-v1.json"), JSON.stringify(rights)),
    fsPromises.writeFile(path.join(visualProbeRoot, "content/image-library/index.json"), JSON.stringify(library)),
  ]);
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("/produtos/")) return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    if (url.endsWith("duplicate.webp")) return new Response(duplicateBuffer, { status: 200, headers: { "content-type": "image/webp" } });
    if (url.endsWith("forbidden.webp")) return new Response("forbidden", { status: 403 });
    if (url.endsWith("low.webp")) return new Response(lowResolutionBuffer, { status: 200, headers: { "content-type": "image/webp" } });
    if (url.endsWith("publishable.webp")) return new Response(publishableBuffer, { status: 200, headers: { "content-type": "image/webp" } });
    throw new Error(`URL inesperada: ${url}`);
  };
  await assert.rejects(() => assertCampaignVisualAvailable({
    root: visualProbeRoot,
    item: { id: "exact-esgotado", productIds: [firstProduct] },
    approvedAt: "2026-08-14",
    fetchImpl,
  }), /Imagem duplicada[\s\S]*HTTP 403[\s\S]*resolução insuficiente/);
  const available = await assertCampaignVisualAvailable({
    root: visualProbeRoot,
    item: { id: "contexto-com-failover", productIds: [firstProduct, secondProduct] },
    approvedAt: "2026-08-14",
    fetchImpl,
  });
  assert.equal(available.productId, secondProduct, "failover contextual precisa avançar até um produto realmente publicável");
} finally {
  await fsPromises.rm(visualProbeRoot, { recursive: true, force: true });
}

const shimanoArticle = {
  slug: "cambio-eletronico-ajuste-diagnostico",
  brand: "Shimano",
  promoted_brands: ["Shimano"],
  image_subject_id: "grupo-shimano-105-di2",
};
const shimanoManifest = {
  assetId: "thebiker-grupo-shimano-105-di2-2a6b056cb4",
  sha256: "2a6b056cb47e4f84b19f13eef3f1e4bf7e73b49fb77b57c49ebfe9e0b0caf74b",
  factualSubject: "exact-product",
  matchedProduct: { id: "grupo-shimano-105-di2", name: "Grupo Shimano 105 Di2" },
  depictedBrands: ["Shimano"],
  depictedProducts: ["Grupo Shimano 105 Di2"],
  source: { rightsPolicyId: "thebiker-official-editorial-v1" },
};
const productCatalog = { products: [
  { id: "grupo-shimano-105-di2", name: "Grupo Shimano 105 Di2", brand: "Shimano" },
  { id: "bateria-sram-axs", name: "Bateria Sram AXS", brand: "Sram" },
] };

const cleaningItem = {
  id: "reserva-limpeza-transmissao-metodo",
  title: "Limpeza de transmissão: como remover contaminantes sem deslocar o problema",
  summary: "Sequência de limpeza de corrente, cassete, coroas e roldanas.",
  productIds: ["corrente-sram-nx-eagle"],
  heroImage: {
    mode: "real-context",
    productId: "corrente-sram-nx-eagle",
    relationship: "category-example",
    rationale: "Fotografia real usada como exemplo visual da categoria técnica abordada.",
  },
};
const componentCatalog = { products: [
  { id: "corrente-sram-nx-eagle", name: "Corrente Sram NX Eagle", brand: "Sram", category: "componentes", images: ["sram.webp"] },
  { id: "pedal-shimano-m520", name: "Pedal Shimano MTB M520", brand: "Shimano", category: "componentes", images: ["pedal.webp"] },
  { id: "corrente-shimano-dura-ace", name: "Corrente Shimano Dura Ace 12v", brand: "Shimano", category: "componentes", images: ["corrente.webp"] },
] };
const alignment = alignRealContextVisual({ item: cleaningItem, article: shimanoArticle, catalog: componentCatalog });
assert.equal(alignment.changed, true);
assert.equal(alignment.previousProductId, "corrente-sram-nx-eagle");
assert.equal(cleaningItem.heroImage.productId, "corrente-shimano-dura-ace");
assert.equal(cleaningItem.productIds[0], "corrente-shimano-dura-ace");
const exactItem = { ...cleaningItem, heroImage: { mode: "exact-product", productId: "corrente-sram-nx-eagle" } };
assert.equal(alignRealContextVisual({ item: exactItem, article: shimanoArticle, catalog: componentCatalog }).changed, false);
assert.throws(() => alignRealContextVisual({
  item: { ...cleaningItem, productIds: ["corrente-sram-nx-eagle"], heroImage: { ...cleaningItem.heroImage, productId: "corrente-sram-nx-eagle" } },
  article: { brand: "Marca sem foto", promoted_brands: ["Marca sem foto"] },
  catalog: componentCatalog,
}), /Nenhuma fotografia real semanticamente compatível/);
const electricItem = {
  id: "youtube-bicicletas-eletricas-arquitetura-autonomia-limites-e-criterios-t",
  title: "Bicicletas elétricas: arquitetura, autonomia, limites e critérios técnicos",
  summary: "Método para compreender autonomia e arquitetura de bicicletas elétricas.",
  productIds: [],
  heroImage: { mode: "conceptual" },
};
const electricCatalog = { products: [
  { id: "bomba-eletrica", name: "Bomba Elétrica Session", brand: "Session", category: "acessorios", images: ["bomba.webp"] },
  { id: "bicicleta-eletrica-oggi", name: "Bicicleta Elétrica Oggi Razzo T-130", brand: "Oggi", category: "bikes", images: ["oggi.webp"] },
] };
const electricAlignment = alignCampaignVisual({
  item: electricItem,
  article: { brand: "TheBiker", promoted_brands: ["TheBiker"], product_name: "Bicicletas elétricas" },
  catalog: electricCatalog,
  library: { assets: [] },
});
assert.equal(electricAlignment.changed, true);
assert.equal(electricAlignment.previousMode, "conceptual");
assert.equal(electricAlignment.productId, "bicicleta-eletrica-oggi");
assert.equal(electricItem.heroImage.mode, "real-context");
assert.deepEqual(electricItem.productIds, ["bicicleta-eletrica-oggi"]);
assert.throws(() => alignCampaignVisual({
  item: { id: "tema-sem-foto", title: "Tema sem produto relacionado", summary: "Assunto abstrato", productIds: [], heroImage: { mode: "conceptual" } },
  article: { brand: "TheBiker", promoted_brands: ["TheBiker"] },
  catalog: electricCatalog,
}), /Nenhuma fotografia real semanticamente compatível/);
assert.deepEqual(imageArticleConsistencyErrors({
  article: shimanoArticle,
  manifest: shimanoManifest,
  campaignItem: { heroImage: { mode: "exact-product", productId: "grupo-shimano-105-di2" } },
  catalog: productCatalog,
}), []);
const contextualItem = {
  heroImage: {
    mode: "real-context",
    productId: "grupo-shimano-105-di2",
    relationship: "component-example",
    rationale: "Produto real usado como exemplo visual do sistema explicado no artigo.",
  },
  productIds: ["grupo-shimano-105-di2"],
};
assert.deepEqual(imageArticleConsistencyErrors({
  article: shimanoArticle,
  manifest: shimanoManifest,
  campaignItem: contextualItem,
  catalog: productCatalog,
}), [], "contexto real preserva a identidade factual do produto sem declarar review");
const publishableManifest = {
  ...shimanoManifest,
  editorialUse: "publishable",
  factualSubject: "exact-product",
  aiGenerated: false,
  qualityTier: "standard",
  source: {
    type: "thebiker",
    rightsPolicyId: "thebiker-official-editorial-v1",
    licenseEvidence: "catalogo oficial",
  },
  approval: { checks: ["sem-concorrente"] },
};
const visualDecision = issueVisualDecision({
  item: contextualItem,
  article: shimanoArticle,
  manifest: publishableManifest,
  catalog: productCatalog,
  now: new Date("2026-08-11T12:00:00.000Z"),
});
assert.equal(visualDecision.score, 100);
assert.deepEqual(visualDecisionErrors({
  receipt: visualDecision,
  item: contextualItem,
  article: shimanoArticle,
  manifest: publishableManifest,
  catalog: productCatalog,
}), []);
assert.match(visualDecisionErrors({
  receipt: visualDecision,
  item: contextualItem,
  article: shimanoArticle,
  manifest: { ...publishableManifest, matchedProduct: { id: "bateria-sram-axs", name: "Bateria SRAM AXS" } },
  catalog: productCatalog,
}).join("; "), /nao corresponde|reprovada/i);
const immutableShimanoProof = {
  assetId: shimanoManifest.assetId,
  sha256: shimanoManifest.sha256,
  productId: "grupo-shimano-105-di2",
  rightsPolicyId: "thebiker-official-editorial-v1",
};
assert.deepEqual(imageArticleConsistencyErrors({
  article: shimanoArticle,
  manifest: shimanoManifest,
  catalog: { products: [] },
  archivedAsset: immutableShimanoProof,
}), [], "post publicado pode usar prova imutável quando o produto sai do catálogo vivo");
assert.match(imageArticleConsistencyErrors({
  article: shimanoArticle,
  manifest: shimanoManifest,
  catalog: { products: [] },
  archivedAsset: { ...immutableShimanoProof, sha256: "divergente" },
}).join("; "), /prova imutável/i);
assert.match(imageArticleConsistencyErrors({
  article: shimanoArticle,
  manifest: {
    ...shimanoManifest,
    matchedProduct: { id: "bateria-sram-axs", name: "Bateria Sram AXS" },
    depictedBrands: ["SRAM"],
    depictedProducts: ["Bateria Sram AXS"],
  },
  campaignItem: { heroImage: { mode: "exact-product", productId: "grupo-shimano-105-di2" } },
  catalog: productCatalog,
}).join("; "), /produto visual|marca da imagem/i);
assert.match(imageArticleConsistencyErrors({
  article: shimanoArticle,
  manifest: { ...shimanoManifest, matchedProduct: { id: "outro-produto-shimano", name: "Sapatilha Shimano" } },
  campaignItem: { heroImage: { mode: "exact-product", productId: "grupo-shimano-105-di2" } },
  catalog: productCatalog,
}).join("; "), /produto visual/i);
assert.deepEqual(imageArticleConsistencyErrors({
  article: { slug: "guia-generico", brand: "TheBiker", promoted_brands: ["TheBiker"] },
  manifest: { factualSubject: "conceptual", depictedBrands: [], depictedProducts: [] },
  campaignItem: { heroImage: { mode: "conceptual" } },
  catalog: productCatalog,
}), []);

for (const category of ["corrida-v2", "lancamento-v2"]) {
  const directory = path.resolve(__dirname, `../assets/img/system/covers/${category}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "image-manifest.json"), "utf8"));
  assert.doesNotThrow(() => validateImageManifestV2(manifest, directory));
}

const base = {
  schemaVersion: 2,
  status: "approved",
  editorialUse: "draft-only",
  assetType: "ai-editorial-concept",
  factualSubject: "exact-product",
  editorialScope: "portfolio",
  purpose: "Representar um produto exato em uma capa editorial.",
  alt: "Produto específico representado em estúdio",
  caption: "Representação de produto.",
  credit: "TheBiker",
  containsText: false,
  aiGenerated: true,
  depictedBrands: ["Scott"],
  depictedProducts: ["Produto"],
  focalPoint: { x: 0.5, y: 0.5 },
  source: {
    type: "generated",
    name: "TheBiker",
    url: "",
    obtainedAt: "2026-08-04",
    license: "Uso interno",
    licenseEvidence: "Registro interno",
  },
  files: {
    hero: { file: "hero.webp", width: 1600, height: 900, maxKB: 300 },
    mobile: { file: "mobile.webp", width: 800, height: 450, maxKB: 160 },
    card: { file: "card.webp", width: 640, height: 360, maxKB: 100 },
  },
};

assert.throws(
  () => ImageManifestV2Schema.parse(base),
  /não pode representar produto exato ou evento real/i,
);

assert.throws(
  () => ImageManifestV2Schema.parse({
    ...base,
    aiGenerated: false,
    preserveFullProduct: true,
    outputFormat: "png",
    qualityTier: "high-definition",
    composition: {
      strategy: "trim-contain-safe-area",
      safeArea: 0.9,
      trimThreshold: 16,
      sourceWidth: 380,
      sourceHeight: 380,
      subjectWidth: 364,
      subjectHeight: 272,
    },
  }),
  /Fonte insuficiente para imagem HD/i,
);

const framingDirectory = await fsPromises.mkdtemp(path.join(os.tmpdir(), "thebiker-framing-"));
try {
  const source = path.join(framingDirectory, "source.png");
  await sharp({
    create: { width: 640, height: 640, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: Buffer.from('<svg width="220" height="180"><rect width="220" height="180" fill="#b00020"/></svg>'), left: 210, top: 230 }])
    .png()
    .toFile(source);
  const framed = await prepareImageVariants({
    input: source,
    outputDirectory: framingDirectory,
    manifest: { preserveFullProduct: true, focalPoint: { x: 0.5, y: 0.5 } },
  });
  assert.equal(framed.composition.strategy, "trim-contain-safe-area");
  assert.ok(framed.composition.subjectWidth <= 230, "as margens vazias devem ser removidas");
  const cardBuffer = await fsPromises.readFile(path.join(framingDirectory, "card-640.webp"));
  const { data, info } = await sharp(cardBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] > data[offset + 1] + 35 && data[offset] > data[offset + 2] + 35) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const widthOccupancy = (maxX - minX + 1) / info.width;
  const heightOccupancy = (maxY - minY + 1) / info.height;
  assert.ok(Math.max(widthOccupancy, heightOccupancy) >= 0.82, "o produto deve ocupar a maior parte do quadro");
} finally {
  await fsPromises.rm(framingDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log("Sistema editorial de imagens v2 validado com sucesso.");
