export function selectImageCandidate(item, catalog, library) {
  const requestedIds = [...new Set(item.productIds || [])];
  if (requestedIds.length === 0) return null;

  const productsById = new Map((catalog.products || []).map((product) => [product.id, product]));
  const exact = requestedIds
    .map((id) => productsById.get(id))
    .filter(Boolean)
    .map((product) => ({ product, matchLevel: "exact-id", score: 100 }));
  if (exact.length === 0) return null;

  const usedPages = new Set((library.assets || []).flatMap((asset) =>
    (asset.uses || []).some((use) => use.postId !== item.id) ? [asset.sourcePageUrl] : [],
  ));
  return exact.find((candidate) => !usedPages.has(candidate.product.productUrl)) || exact[0];
}

export function preferLargestStoreImage(url) {
  return String(url).replace(/-(?:240|320|480|640)-0(?=\.[^.]+$)/, "-1024-0");
}
