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
import { selectImageCandidate } from "./src/images/select-image.js";
import { imageArticleConsistencyErrors } from "./src/validation/image-article-consistency.js";

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

const shimanoArticle = {
  slug: "cambio-eletronico-ajuste-diagnostico",
  brand: "Shimano",
  promoted_brands: ["Shimano"],
  image_subject_id: "grupo-shimano-105-di2",
};
const shimanoManifest = {
  factualSubject: "exact-product",
  matchedProduct: { id: "grupo-shimano-105-di2", name: "Grupo Shimano 105 Di2" },
  depictedBrands: ["Shimano"],
  depictedProducts: ["Grupo Shimano 105 Di2"],
};
const productCatalog = { products: [
  { id: "grupo-shimano-105-di2", name: "Grupo Shimano 105 Di2", brand: "Shimano" },
  { id: "bateria-sram-axs", name: "Bateria Sram AXS", brand: "Sram" },
] };
assert.deepEqual(imageArticleConsistencyErrors({
  article: shimanoArticle,
  manifest: shimanoManifest,
  campaignItem: { heroImage: { mode: "exact-product", productId: "grupo-shimano-105-di2" } },
  catalog: productCatalog,
}), []);
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
