import { canonicalPortfolioBrand } from "../portfolio-policy.js";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function comparableUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return `${url.hostname.replace(/^www\./u, "").toLowerCase()}${url.pathname.replace(/\/$/u, "")}`;
  } catch {
    return "";
  }
}

function modelTokens(value, brand) {
  const ignored = new Set([
    "bicicleta", "bike", "quadro", "pre", "venda", "di2",
    ...normalize(brand).split(" "),
  ]);
  return normalize(value).split(" ").filter((token) => token.length >= 2 && !/^20\d{2}$/u.test(token) && !ignored.has(token));
}

export function productIdentityConsistencyErrors({ article = {}, campaignItem = {}, catalog = {}, research = {} } = {}) {
  if (!['review', 'lancamentos'].includes(String(campaignItem.category || ""))) return [];
  const errors = [];
  if (campaignItem.productIds?.length !== 1) {
    return ["review ou lançamento de produto exige exatamente um productId para impedir mistura de modelos"];
  }

  const productId = campaignItem.productIds[0];
  const product = (catalog.products || []).find((candidate) => candidate.id === productId);
  if (!product) return [`produto ${productId} não encontrado no catálogo TheBiker`];

  const articleBrand = canonicalPortfolioBrand(article.brand) || article.brand;
  const catalogBrand = canonicalPortfolioBrand(product.brand) || product.brand;
  if (normalize(articleBrand) !== normalize(catalogBrand)) {
    errors.push(`marca do artigo (${article.brand || "ausente"}) não corresponde ao produto ${productId} (${product.brand})`);
  }

  const expectedTokens = new Set(modelTokens(product.name, product.brand));
  const declaredTokens = modelTokens(article.product_name, article.brand);
  const alienTokens = declaredTokens.filter((token) => !expectedTokens.has(token));
  if (declaredTokens.length === 0 || alienTokens.length > 0) {
    errors.push(`modelo do artigo (${article.product_name || "ausente"}) não corresponde ao produto selecionado ${product.name}`);
  }

  const catalogYear = String(product.name || "").match(/\b20\d{2}\b/u)?.[0];
  if (catalogYear && String(article.model_year || "") !== catalogYear) {
    errors.push(`ano do artigo (${article.model_year || "ausente"}) não corresponde ao catálogo (${catalogYear})`);
  }

  const officialUrl = comparableUrl(product.officialPageUrl);
  const manufacturerUrls = (research.sources || [])
    .filter((source) => String(source.type || "").toLowerCase() === "manufacturer")
    .map((source) => comparableUrl(source.url))
    .filter(Boolean);
  if (!officialUrl) {
    errors.push(`produto ${productId} sem página oficial exata do fabricante no catálogo`);
  } else if (!manufacturerUrls.includes(officialUrl)) {
    errors.push(`pesquisa não contém a página oficial exata do fabricante para ${productId}`);
  }

  return errors;
}
