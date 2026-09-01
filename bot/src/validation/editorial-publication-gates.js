import { editorialTextQualityErrors } from "./editorial-text-quality.js";
import { editorialWordRange } from "../editorial-length-policy.js";

function wordCount(article) {
  return article.sections.reduce((total, section) => {
    return total + (section.content.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []).length;
  }, 0);
}

export function assertEditorialPublicationGates(article, env = process.env) {
  const errors = [];
  const { min: minimum, max: maximum } = editorialWordRange(article.content_type, env);
  const words = wordCount(article);
  if (words < minimum) errors.push(`extensão insuficiente: ${words} palavras; mínimo ${minimum}`);
  if (words > maximum) errors.push(`extensão excessiva: ${words} palavras; máximo ${maximum}; remova repetição e conteúdo sem evidência`);

  const sourcesWithoutUrl = article.sources.filter((source) => !source.url);
  if (sourcesWithoutUrl.length > 0) {
    errors.push(`${sourcesWithoutUrl.length} fonte(s) sem URL rastreável`);
  }

  if (["review", "comparativo", "lancamento"].includes(article.content_type)
      && !article.sources.some((source) => String(source.type).toLowerCase() === "manufacturer")) {
    errors.push("conteúdo de produto sem fonte técnica do fabricante");
  }

  const headings = article.sections.map((section) => section.heading.trim().toLocaleLowerCase("pt-BR"));
  if (new Set(headings).size !== headings.length) errors.push("intertítulos duplicados");

  if (article.sections.length < 5) errors.push("menos de 5 seções editoriais");

  errors.push(...editorialTextQualityErrors({
    body: article.sections.map((section) => `${section.heading}\n${section.content}`).join("\n\n"),
    contentType: article.content_type,
    directAnswer: article.direct_answer,
    title: article.title,
    description: article.description,
    headings: article.sections.map((section) => section.heading),
  }));

  if (errors.length > 0) {
    throw new Error(`Gates editoriais não atendidos: ${errors.join("; ")}`);
  }
  return { words, minimum, maximum, sourceCount: article.sources.length, sectionCount: article.sections.length };
}
