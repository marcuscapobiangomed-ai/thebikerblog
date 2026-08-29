export const SEO_TITLE_MAX = 70;
export const META_DESCRIPTION_MIN = 140;
export const META_DESCRIPTION_MAX = 160;

function comparable(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
}

export function seoMetadataIssues({ title, description, directAnswer } = {}) {
  const issues = [];
  const cleanTitle = String(title || "").trim();
  const cleanDescription = String(description || "").trim();

  if (cleanTitle.length > SEO_TITLE_MAX) {
    issues.push(`titulo com ${cleanTitle.length} caracteres; maximo ${SEO_TITLE_MAX}`);
  }
  if (cleanDescription.length < META_DESCRIPTION_MIN || cleanDescription.length > META_DESCRIPTION_MAX) {
    issues.push(`description com ${cleanDescription.length} caracteres; esperado ${META_DESCRIPTION_MIN}-${META_DESCRIPTION_MAX}`);
  }
  if (cleanDescription && !/[.!?]$/.test(cleanDescription)) {
    issues.push("description parece truncada: falta pontuacao final");
  }
  if (directAnswer && comparable(cleanDescription) === comparable(directAnswer)) {
    issues.push("description e direct_answer devem cumprir funcoes diferentes");
  }
  return issues;
}
