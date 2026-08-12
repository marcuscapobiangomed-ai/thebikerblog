import { canonicalPortfolioBrand } from "../portfolio-policy.js";

const GENERIC_TOKENS = new Set([
  "bicicleta", "bike", "produto", "para", "com", "sem", "thebiker", "shop",
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
  ));
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

export function alignRealContextVisual({ item, article, catalog }) {
  const visual = item?.heroImage;
  if (visual?.mode !== "real-context") return { changed: false, productId: visual?.productId || null };

  const promoted = promotedArticleBrands(article);
  if (promoted.length === 0) return { changed: false, productId: visual.productId };

  const products = catalog?.products || [];
  const current = products.find((product) => product.id === visual.productId) || null;
  if (current && promoted.includes(normalizeBrand(current.brand))) {
    return { changed: false, productId: current.id };
  }

  const currentTokens = tokens(current?.name, [current?.brand]);
  const topicTokens = tokens(`${item.title} ${item.summary}`);
  const compatible = products
    .filter((product) => promoted.includes(normalizeBrand(product.brand)))
    .map((product) => {
      const productTokens = tokens(product.name, [product.brand]);
      const typeOverlap = overlap(productTokens, currentTokens);
      const topicOverlap = overlap(productTokens, topicTokens);
      const sameCategory = current?.category && product.category === current.category ? 1 : 0;
      const hasImage = (product.officialImages || []).length > 0 || (product.images || []).length > 0 ? 1 : 0;
      return {
        product,
        semanticOverlap: typeOverlap + topicOverlap,
        score: typeOverlap * 100 + topicOverlap * 10 + sameCategory * 5 + hasImage,
      };
    })
    .filter((candidate) => candidate.semanticOverlap > 0)
    .sort((left, right) => right.score - left.score || left.product.id.localeCompare(right.product.id, "pt-BR"));

  const selected = compatible[0]?.product || null;
  if (!selected) {
    throw new Error(`Nenhuma fotografia real semanticamente compatível com as marcas promovidas (${promoted.join(", ")}) para ${item.id}`);
  }

  const previousProductId = visual.productId;
  item.productIds = [selected.id, ...(item.productIds || []).filter((id) => id !== previousProductId && id !== selected.id)];
  item.heroImage = { ...visual, productId: selected.id };
  return { changed: true, previousProductId, productId: selected.id };
}
