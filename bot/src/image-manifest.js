import { getCoverPreset } from "./image-presets.js";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

/**
 * Produz apenas um plano de produção. O manifesto publicável é criado depois
 * que os arquivos, a origem, a licença e a aprovação automatizada existem.
 */
export function buildImageProductionPlan(article) {
  const requested = Array.isArray(article?.imagePlan) ? article.imagePlan : [];
  const preset = getCoverPreset(article?.content_type);
  const items = requested.map((item) => ({
    position: text(item.position, "hero"),
    purpose: text(item.purpose),
    assetType: text(item.assetType, "system-fallback"),
    editorialUse: text(item.editorialUse, "draft-only"),
    factualSubject: text(item.factualSubject, "not-applicable"),
    brief: text(item.brief, item.purpose),
    sourceRequired: item.sourceRequired !== false,
    avoid: Array.isArray(item.avoid) ? item.avoid.map(String) : [],
    aspectRatio: "16:9",
    aiGeneratedAllowed: item.aiGeneratedAllowed === true,
  }));

  return {
    status: "planned",
    contentType: text(article?.content_type, "guia-de-compra"),
    productName: text(article?.product_name),
    brand: text(article?.brand),
    fallback: {
      editorialUse: "draft-only",
      hero: preset.hero,
      mobile: preset.mobile || preset.hero,
      card: preset.thumbnail,
    },
    requiredVariants: {
      hero: { width: 1600, height: 900, maxKB: 300 },
      mobile: { width: 800, height: 450, maxKB: 160 },
      card: { width: 640, height: 360, maxKB: 100 },
    },
    items,
  };
}

// Compatibilidade: retorna um plano, nunca um manifesto final ou uma licença inferida.
export const buildImageManifest = buildImageProductionPlan;
