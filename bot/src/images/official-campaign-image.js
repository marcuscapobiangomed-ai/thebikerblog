import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { canonicalPortfolioBrand } from "../portfolio-policy.js";
import { prepareImageVariants } from "./prepare-variants.js";
import { validateImageManifestV2 } from "../validation/image-manifest-v2.js";
import { secureDownloadImage } from "./secure-download.js";
import { assertNotDuplicate, perceptualHash, sha256 } from "./dedupe.js";
import { loadAssetLibrary, registerAsset } from "./asset-library.js";
import { preferLargestStoreImage, selectImageCandidates } from "./select-image.js";

function extensionFor(contentType) {
  return { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif" }[contentType];
}

export function classifyOfficialImageQuality(metadata, config) {
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const minimumLongEdge = config.minimumPublishableLongEdge;
  const minimumShortEdge = config.minimumPublishableShortEdge;
  if (longEdge >= minimumLongEdge && shortEdge >= minimumShortEdge) {
    return { qualityTier: "high-definition", outputFormat: "png" };
  }
  if (longEdge < config.minimumStandardLongEdge || shortEdge < config.minimumStandardShortEdge) {
    throw new Error(`resolução insuficiente para o padrão editorial: ${width}x${height}`);
  }
  return { qualityTier: "standard", outputFormat: "webp" };
}

function galleryUrls(html) {
  return [...new Set([...String(html).matchAll(/<a\s+href=["'](?:https?:)?(\/\/acdn-us\.mitiendanube\.com\/stores\/001\/062\/247\/products\/[^"']+)["'][^>]*data-fancybox=["']product-gallery["']/gi)]
    .map((match) => `https:${match[1]}`.replace(/&amp;/g, "&")))]
    .filter((url) => /\.(?:webp|jpe?g|png)(?:\?|$)/i.test(url));
}

export async function productImageCandidates(product, config, fetchImpl) {
  const page = new URL(product.productUrl);
  if (!config.allowedPageHosts.some((host) => page.hostname === host || page.hostname.endsWith(`.${host}`))) {
    throw new Error(`Página de produto fora da allowlist: ${page.hostname}`);
  }
  const configuredOfficial = config.officialProductImages?.[product.id] || null;
  const officialImages = configuredOfficial?.images?.length
    ? configuredOfficial.images
    : product.officialImages || [];
  let gallery = [];
  let galleryError = null;
  try {
    const response = await fetchImpl(page, { headers: { "user-agent": "TheBikerBlogMediaBot/1.0" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Página do produto: HTTP ${response.status}`);
    gallery = galleryUrls(await response.text());
  } catch (error) {
    galleryError = error;
  }
  const withLargestFirst = (urls) => urls.flatMap((url) => {
    const largest = preferLargestStoreImage(url);
    return largest === url ? [url] : [largest, url];
  });
  const manufacturer = officialImages.map((url) => ({
    url,
    sourceType: "manufacturer",
    sourceName: product.brand,
    sourcePageUrl: configuredOfficial?.officialPageUrl || product.officialPageUrl,
  }));
  const store = [...new Set([...withLargestFirst(gallery), ...withLargestFirst(product.images || [])])].map((url) => ({
    url,
    sourceType: "thebiker",
    sourceName: "TheBiker Shop",
    sourcePageUrl: product.productUrl,
  }));
  const candidates = [...manufacturer, ...store];
  if (candidates.length === 0 && galleryError) throw galleryError;
  return candidates;
}

async function loadOfficialImageContext(root) {
  const [config, catalog, storeRights, brandRights, library] = await Promise.all([
    fs.readFile(path.join(root, "bot/config/official-image-sources.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, "content/product-discovery/thebiker-media-catalog.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, "content/image-rights/thebiker-official-editorial-v1.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, "content/image-rights/official-brand-editorial-v1.json"), "utf8").then(JSON.parse),
    loadAssetLibrary(root),
  ]);
  for (const rights of [storeRights, brandRights]) {
    if (rights.status !== "approved") throw new Error(`Política visual não aprovada: ${rights.id}`);
  }
  return { config, catalog, storeRights, brandRights, library };
}

async function selectPublishableOfficialImage({ root, item, approvedAt, fetchImpl = fetch, context = null }) {
  const imageContext = context || await loadOfficialImageContext(root);
  const selections = selectImageCandidates(item, imageContext.catalog, imageContext.library.data);
  if (selections.length === 0) throw new Error(`Nenhuma imagem real compatível para ${item.id}`);
  const rejected = [];
  for (const selected of selections) {
    let candidates;
    try {
      candidates = await productImageCandidates(selected.product, imageContext.config, fetchImpl);
    } catch (error) {
      rejected.push(`${selected.product.id}: ${error.message}`);
      continue;
    }
    for (const image of candidates) {
      try {
        const downloaded = await secureDownloadImage(image.url, imageContext.config, { fetchImpl });
        const metadata = await sharp(downloaded.buffer).metadata();
        const imageQuality = classifyOfficialImageQuality(metadata, imageContext.config);
        const identity = { sha256: sha256(downloaded.buffer), perceptualHash: await perceptualHash(downloaded.buffer) };
        assertNotDuplicate(identity, imageContext.library.data.assets, {
          now: new Date(`${approvedAt}T12:00:00Z`),
          excludePostId: item.id,
        });
        return { ...imageContext, selected, selectedImage: image, downloaded, identity, imageQuality };
      } catch (error) {
        rejected.push(`${selected.product.id}: ${error.message}`);
      }
    }
  }
  throw new Error(`Galeria oficial sem imagem inédita válida: ${[...new Set(rejected)].slice(0, 8).join(" | ")}`);
}

export async function assertCampaignVisualAvailable({ root, item, approvedAt, fetchImpl = fetch }) {
  const selected = await selectPublishableOfficialImage({ root, item, approvedAt, fetchImpl });
  return {
    status: "available",
    productId: selected.selected.product.id,
    sourceType: selected.selectedImage.sourceType,
    qualityTier: selected.imageQuality.qualityTier,
  };
}

export async function produceOfficialCampaignImage({ root, item, approvedAt, fetchImpl = fetch, force = false }) {
  const context = await loadOfficialImageContext(root);
  const { storeRights, brandRights, library } = context;
  const existingDirectory = path.join(root, "assets/img/posts", item.id);
  const existingManifestPath = path.join(existingDirectory, "image-manifest.json");
  try {
    const existingManifest = JSON.parse(await fs.readFile(existingManifestPath, "utf8"));
    const registered = library.data.assets.some((asset) =>
      asset.assetId === existingManifest.assetId &&
      (asset.uses || []).some((use) => use.postId === item.id),
    );
    const requestedProductMatches = (item.productIds || []).includes(existingManifest.matchedProduct?.id);
    if (registered && requestedProductMatches && !force) {
      validateImageManifestV2(existingManifest, existingDirectory, { requirePublishable: true });
      return { directory: existingDirectory, manifest: existingManifest, publicBase: `/assets/img/posts/${item.id}` };
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  const selectedResult = await selectPublishableOfficialImage({ root, item, approvedAt, fetchImpl, context });
  const { selected, downloaded, identity, selectedImage, imageQuality } = selectedResult;
  const rights = selectedImage.sourceType === "manufacturer" ? brandRights : storeRights;
  const assetId = `${selectedImage.sourceType}-${selected.product.id}-${identity.sha256.slice(0, 10)}`;
  const directory = path.join(root, "assets/img/posts", item.id);
  await fs.mkdir(directory, { recursive: true });
  const source = path.join(directory, `source${extensionFor(downloaded.contentType)}`);
  await fs.writeFile(source, downloaded.buffer);
  const brand = canonicalPortfolioBrand(selected.product.brand || selected.product.name.split(/\s+/)[0]);
  const baseManifest = {
    schemaVersion: 2,
    status: "approved",
    editorialUse: "publishable",
    assetType: "official-product-photo",
    factualSubject: "exact-product",
    editorialScope: "portfolio",
    purpose: `Ilustrar ${item.title} com produto real do catálogo TheBiker.`,
    alt: `${selected.product.name} em fotografia oficial de ${selectedImage.sourceName}`,
    caption: `${selected.product.name}, em fotografia oficial de ${selectedImage.sourceName}.`,
    credit: selectedImage.sourceName,
    containsText: false,
    aiGenerated: false,
    assetId,
    ...identity,
    preserveFullProduct: true,
    outputFormat: imageQuality.outputFormat,
    qualityTier: imageQuality.qualityTier,
    matchedProduct: { id: selected.product.id, name: selected.product.name, sku: selected.product.sku || null, matchLevel: selected.matchLevel },
    depictedBrands: brand ? [brand] : [],
    depictedProducts: [selected.product.name],
    focalPoint: { x: 0.5, y: 0.5 },
    source: {
      type: selectedImage.sourceType,
      name: selectedImage.sourceName,
      url: selectedImage.sourcePageUrl,
      fileUrl: downloaded.finalUrl,
      localFile: path.basename(source),
      obtainedAt: approvedAt,
      license: rights.license || "Uso editorial no blog oficial TheBiker",
      licenseEvidence: rights.authorizationBasis,
      rightsPolicyId: rights.id,
    },
    files: {},
    approval: {
      reviewedBy: "TheBiker deterministic image gate",
      approvedAt,
      method: "automated-editorial-gate",
      checks: [
        "fonte-oficial",
        imageQuality.qualityTier === "high-definition" ? "alta-resolucao" : "resolucao-padrao-declarada",
        imageQuality.outputFormat === "png" ? "png-sem-perdas" : "webp-otimizado",
        "direitos",
        "produto-relacionado",
        "sha256",
        "hash-perceptual",
        "sem-concorrente",
      ],
    },
  };
  const manifest = await prepareImageVariants({ input: source, outputDirectory: directory, manifest: baseManifest });
  await fs.writeFile(path.join(directory, "image-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  validateImageManifestV2(manifest, directory, { requirePublishable: true });
  await registerAsset(root, {
    assetId,
    sha256: identity.sha256,
    perceptualHash: identity.perceptualHash,
    sourcePageUrl: selectedImage.sourcePageUrl,
    sourceFileUrl: downloaded.finalUrl,
    productId: selected.product.id,
    productName: selected.product.name,
    rightsPolicyId: rights.id,
    uses: [{ postId: item.id, position: "hero", usedAt: `${approvedAt}T12:00:00.000Z` }],
  });
  return { directory, manifest, publicBase: `/assets/img/posts/${item.id}` };
}
