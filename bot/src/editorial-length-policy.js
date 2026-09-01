const WORD_RANGES = {
  review: { min: 900, max: 1600 },
  comparativo: { min: 1000, max: 1800 },
  "guia-de-compra": { min: 1000, max: 1800 },
  "guia-tecnico": { min: 900, max: 1700 },
  noticia: { min: 650, max: 1200 },
  lancamento: { min: 700, max: 1300 },
  "previa-corrida": { min: 800, max: 1500 },
  "resumo-corrida": { min: 900, max: 1600 },
  "calendario-provas": { min: 750, max: 1400 },
  "guia-prova": { min: 900, max: 1600 },
};

export function editorialWordRange(contentType, env = {}) {
  const policy = WORD_RANGES[contentType] || { min: 700, max: 1400 };
  const min = Number(env.AI_MIN_ARTICLE_WORDS || policy.min);
  const requestedMax = Number(env.AI_MAX_ARTICLE_WORDS || policy.max);
  const max = Math.max(min, requestedMax);
  return { min, max, target: Math.round((min + max) / 2) };
}
