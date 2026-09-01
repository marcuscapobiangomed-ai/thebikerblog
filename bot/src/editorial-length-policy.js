const WORD_RANGES = {
  review: { min: 850, max: 1550 },
  comparativo: { min: 950, max: 1750 },
  "guia-de-compra": { min: 950, max: 1750 },
  "guia-tecnico": { min: 850, max: 1650 },
  noticia: { min: 650, max: 1200 },
  lancamento: { min: 650, max: 1250 },
};

export function editorialWordRange(contentType, env = {}) {
  const policy = WORD_RANGES[contentType] || { min: 700, max: 1400 };
  const min = Number(env.AI_MIN_ARTICLE_WORDS || policy.min);
  const requestedMax = Number(env.AI_MAX_ARTICLE_WORDS || policy.max);
  const max = Math.max(min, requestedMax);
  return { min, max, target: Math.round((min + max) / 2) };
}
