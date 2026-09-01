import { editorialTextQualityErrors } from "./editorial-text-quality.js";
import { editorialWordRange } from "../editorial-length-policy.js";

function wordCount(article) {
  return article.sections.reduce((total, section) => {
    return total + (section.content.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []).length;
  }, 0);
}

function evidenceContractErrors(article) {
  if (article.editorial_format !== "full-article-v2") return [];

  const errors = [];
  const sourceIds = new Set((article.sources || []).map((source) => source.id).filter(Boolean));
  if (sourceIds.size !== article.sources.length) {
    errors.push("contrato de evidência v2 exige id estável em todas as fontes");
  }

  for (const [index, section] of article.sections.entries()) {
    if (!String(section.target_question || "").trim()) {
      errors.push(`seção ${index + 1} sem pergunta ou decisão explícita`);
    }
    const isMethodology = /fontes|referências|metodologia|limitações/i.test(section.heading);
    if (!isMethodology && (!Array.isArray(section.claims) || section.claims.length === 0)) {
      errors.push(`seção ${index + 1} sem afirmação rastreável`);
    }
    for (const [claimIndex, claim] of (section.claims || []).entries()) {
      if (!String(claim.statement || "").trim()) {
        errors.push(`seção ${index + 1}, afirmação ${claimIndex + 1} sem texto`);
      }
      if (String(claim.evidence_quote || "").trim().length < 12) {
        errors.push(`seção ${index + 1}, afirmação ${claimIndex + 1} sem trecho de evidência suficiente`);
      }
      for (const sourceId of claim.source_ids || []) {
        if (!sourceIds.has(sourceId)) {
          errors.push(`seção ${index + 1}, afirmação ${claimIndex + 1} referencia fonte inexistente: ${sourceId}`);
        }
      }
    }
    for (const link of section.internal_links || []) {
      if (!/^\/(?!\/)/.test(String(link.url || ""))) {
        errors.push(`seção ${index + 1} contém link que não é interno: ${link.url}`);
      }
    }
  }
  return errors;
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
  errors.push(...evidenceContractErrors(article));

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
  return {
    words,
    minimum,
    maximum,
    sourceCount: article.sources.length,
    sectionCount: article.sections.length,
    claimCount: article.sections.reduce((total, section) => total + (section.claims?.length || 0), 0),
    internalLinkCount: article.sections.reduce((total, section) => total + (section.internal_links?.length || 0), 0),
    evidenceContract: article.editorial_format,
  };
}
