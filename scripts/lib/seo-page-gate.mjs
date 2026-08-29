const ALLOWED_TYPES = new Set([
  'alternative',
  'comparison',
  'constraint',
  'pricing',
  'use-case',
  'problem',
  'feature',
]);

const MEASURED_SOURCES = new Set(['search-console', 'keyword-planner']);
const STOPWORDS = new Set(['para', 'como', 'com', 'uma', 'das', 'dos', 'que', 'por', 'thebiker', 'bike', 'bikes', 'ciclismo']);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function validateSeoPageMetadata(data, body = '') {
  const seo = data.seo_page;
  if (!seo) return [];
  const errors = [];
  const type = String(seo.type || '');
  const demand = seo.demand || {};
  const products = list(seo.verified_product_ids);

  if (!ALLOWED_TYPES.has(type)) errors.push('seo_page.type invalido');
  if (String(seo.primary_query || '').trim().length < 4) errors.push('seo_page.primary_query ausente');
  if (!MEASURED_SOURCES.has(demand.source)) errors.push('seo_page.demand.source deve ser search-console ou keyword-planner');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(demand.measured_at || ''))) errors.push('seo_page.demand.measured_at deve usar YYYY-MM-DD');
  if (!(Number(demand.value) > 0)) errors.push('seo_page.demand.value deve ser maior que zero');
  if (list(seo.differentiation).length < 3) errors.push('seo_page.differentiation exige ao menos tres diferencas substantivas');
  if (list(seo.unique_evidence).length < 2) errors.push('seo_page.unique_evidence exige ao menos duas evidencias proprias');
  if (['alternative', 'comparison'].includes(type) && products.length < 2) errors.push(`seo_page.${type} exige ao menos dois produtos verificados`);
  if (['constraint', 'pricing', 'use-case', 'feature'].includes(type) && products.length < 1) errors.push(`seo_page.${type} exige produto verificado`);
  if (type === 'constraint' && String(seo.constraint || '').trim().length < 3) errors.push('seo_page.constraint ausente');
  if (String(body).trim().split(/\s+/).length < 700) errors.push('pagina SEO programatica exige ao menos 700 palavras de conteudo visivel');
  return errors;
}

export function pageFingerprint(body = '') {
  return new Set(String(body).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token)));
}

export function jaccardSimilarity(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
