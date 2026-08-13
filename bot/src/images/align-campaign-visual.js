import { canonicalPortfolioBrand } from "../portfolio-policy.js";

const GENERIC_TOKENS = new Set([
  "bicicleta", "bicicletas", "bike", "bikes", "produto", "produtos", "para", "com", "sem", "thebiker", "shop",
  "guia", "tecnico", "tecnica", "criterio", "criterios", "como", "limite", "limites", "metodo", "metodos",
]);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function normalizeBrand(value) {
  return normalize(canonicalPortfolioBrand(value) || value);
}

function tokens(value, ignored = []) {
  const ignoredTokens = new Set(ignored.flatMap((entry) => normalize(entry).split(/\s+/)).filter(Boolean));
  return new Set(normalize(value).split(/\s+/).filter((token) =>
    token.length >= 3 && !/^\d+$/.test(token) && !GENERIC_TOKENS.has(token) && !ignoredTokens.has(token),
  ).map((token) => token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token));
}

function overlap(left, right) {
  let score = 0;
  for (const token of left) if (right.has(token)) score += 1;
  return score;
}

export function promotedArticleBrands(article = {}) {
  const declared = Array.isArray(article.promoted_brands) ? article.promoted_brands : [];
  return [...new Set([article.brand, ...declared].map(normalizeBrand).filter(Boolean))]
    .filter((brand) => brand !== "thebiker");
}

function inferredCatalogCategory(item) {
  const topic = normalize(`${item?.title || ""} ${item?.summary || ""}`);
  if (/\b(?:bicicleta|bicicletas|bike|bikes)\b/.test(topic)) return "bikes";
  if (/\b(?:capacete|sapatilha|camisa|bretelle|oculos|luva|jersey)\b/.test(topic)) return "vestuario";
  if (/\b(?:corrente|cassete|cambio|pneu|roda|guidao|canote|selim|suspensao|freio|pedal)\b/.test(topic)) return "componentes";
  return null;
}

function hasOfficialImage(product) {
  return (product.officialImages || []).length > 0 || (product.images || []).length > 0;
}

function usedByAnotherPost(product, item, library) {
  return (library?.assets || []).some((asset) => asset.productId === product.id
    && (asset.uses || []).some((use) => use.postId !== item.id));
}

function selectSemanticProduct({ item, article, catalog, library, current = null }) {
  const promoted = promotedArticleBrands(article);
  const topicTokens = tokens(`${item.title} ${item.summary} ${article.product_name || ""}`, promoted);
  const inferredCategory = inferredCatalogCategory(item);
  const candidates = (catalog?.products || [])
    .filter(hasOfficialImage)
    .filter((product) => promoted.length === 0 || promoted.includes(normalizeBrand(product.brand)))
    .map((product) => {
      const productTokens = tokens(product.name, [product.brand]);
      const semanticOverlap = overlap(productTokens, topicTokens);
      const currentOverlap = overlap(productTokens, tokens(current?.name, [current?.brand]));
      const sameCategory = inferredCategory && product.category === inferredCategory ? 1 : 0;
      const available = usedByAnotherPost(product, item, library) ? 0 : 1;
      return {
        product,
        semanticOverlap: semanticOverlap + currentOverlap,
        score: currentOverlap * 1000 + semanticOverlap * 100 + sameCategory * 10 + available,
      };
    })
    .filter((candidate) => candidate.semanticOverlap > 0)
    .sort((left, right) => right.score - left.score || left.product.id.localeCompare(right.product.id, "pt-BR"));
  return candidates[0]?.product || null;
}

export function alignCampaignVisual({ item, article, catalog, library = null }) {
  const visual = item?.heroImage;
  if (visual?.mode === "exact-product") return { changed: false, productId: visual.productId };

  if (!visual || visual.mode === "conceptual") {
    const selected = selectSemanticProduct({ item, article, catalog, library });
    if (!selected) {
      throw new Error(`Nenhuma fotografia real semanticamente compatível para ${item.id}`);
    }
    item.productIds = [selected.id, ...(item.productIds || []).filter((id) => id !== selected.id)];
    item.heroImage = {
      mode: "real-context",
      productId: selected.id,
      relationship: "category-example",
      rationale: "Fotografia real do catálogo TheBiker selecionada deterministicamente como exemplo visual da categoria técnica abordada.",
    };
    return { changed: true, previousMode: visual?.mode || "conceptual", productId: selected.id };
  }

  if (visual.mode !== "real-context") return { changed: false, productId: visual.productId || null };

  const promoted = promotedArticleBrands(article);
  if (promoted.length === 0) return { changed: false, productId: visual.productId };

  const products = catalog?.products || [];
  const current = products.find((product) => product.id === visual.productId) || null;
  if (current && promoted.includes(normalizeBrand(current.brand))) {
    return { changed: false, productId: current.id };
  }

  const selected = selectSemanticProduct({ item, article, catalog, library, current });
  if (!selected) {
    throw new Error(`Nenhuma fotografia real semanticamente compatível com as marcas promovidas (${promoted.join(", ")}) para ${item.id}`);
  }

  const previousProductId = visual.productId;
  item.productIds = [selected.id, ...(item.productIds || []).filter((id) => id !== previousProductId && id !== selected.id)];
  item.heroImage = { ...visual, productId: selected.id };
  return { changed: true, previousProductId, productId: selected.id };
}

export const alignRealContextVisual = alignCampaignVisual;
