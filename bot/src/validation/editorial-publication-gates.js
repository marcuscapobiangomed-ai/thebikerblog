const MIN_WORDS = {
  review: 1800,
  comparativo: 1600,
  "guia-de-compra": 1600,
  "guia-tecnico": 1600,
  noticia: 900,
  lancamento: 900,
  "previa-corrida": 1000,
  "resumo-corrida": 1200,
  "calendario-provas": 1000,
  "guia-prova": 1200,
};

function wordCount(article) {
  return article.sections.reduce((total, section) => {
    return total + (section.content.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []).length;
  }, 0);
}

export function assertEditorialPublicationGates(article, env = process.env) {
  const errors = [];
  const minimum = Number(env.AI_MIN_ARTICLE_WORDS || MIN_WORDS[article.content_type] || 900);
  const words = wordCount(article);
  if (words < minimum) errors.push(`extensão insuficiente: ${words} palavras; mínimo ${minimum}`);

  const sourcesWithoutUrl = article.sources.filter((source) => !source.url);
  if (sourcesWithoutUrl.length > 0) {
    errors.push(`${sourcesWithoutUrl.length} fonte(s) sem URL rastreável`);
  }

  const headings = article.sections.map((section) => section.heading.trim().toLocaleLowerCase("pt-BR"));
  if (new Set(headings).size !== headings.length) errors.push("intertítulos duplicados");

  if (article.sections.length < 5) errors.push("menos de 5 seções editoriais");

  if (errors.length > 0) {
    throw new Error(`Gates editoriais não atendidos: ${errors.join("; ")}`);
  }
  return { words, minimum, sourceCount: article.sources.length, sectionCount: article.sections.length };
}
