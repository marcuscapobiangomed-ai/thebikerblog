export const EditorialFailureCode = Object.freeze({
  POLICY_MARKETING_LANGUAGE: "POLICY_MARKETING_LANGUAGE",
  POLICY_NON_CANONICAL_TAG: "POLICY_NON_CANONICAL_TAG",
  POLICY_UNSUPPORTED_TEST: "POLICY_UNSUPPORTED_TEST",
  CONTENT_HASH_MISMATCH: "CONTENT_HASH_MISMATCH",
  UNSAFE_PATH: "UNSAFE_PATH",
  IMAGE_NOT_PUBLISHABLE: "IMAGE_NOT_PUBLISHABLE",
  AI_REVIEW_REJECTED: "AI_REVIEW_REJECTED",
  RESEARCH_INSUFFICIENT: "RESEARCH_INSUFFICIENT",
  TRANSIENT_PROVIDER: "TRANSIENT_PROVIDER",
  VALIDATION_FAILED: "VALIDATION_FAILED",
});

const RULES = [
  [EditorialFailureCode.CONTENT_HASH_MISMATCH, /integridade editorial divergente|hash do artefato|contenthash/i, false],
  [EditorialFailureCode.POLICY_MARKETING_LANGUAGE, /linguagem publicit[aá]ria proibida/i, false],
  [EditorialFailureCode.POLICY_NON_CANONICAL_TAG, /tags? n[aã]o can[oô]nic/i, false],
  [EditorialFailureCode.POLICY_UNSUPPORTED_TEST, /teste pr[aá]tico proibid|testamos|durante o pedal/i, false],
  [EditorialFailureCode.UNSAFE_PATH, /postpath inseguro|precisa apontar para _posts\/drafts/i, false],
  [EditorialFailureCode.IMAGE_NOT_PUBLISHABLE, /imagem|image|variante public[aá]vel|fallback|pol[ií]tica visual|fotografia real/i, false],
  [EditorialFailureCode.AI_REVIEW_REJECTED, /nota editorial final insuficiente|revis[aã]o final reprovada|bloqueadores/i, false],
  [EditorialFailureCode.RESEARCH_INSUFFICIENT, /sem fontes editoriais|nenhuma fonte oficial|pesquisa bloqueada/i, false],
  [EditorialFailureCode.TRANSIENT_PROVIDER, /timeout|timed out|aborted|429|rate limit|temporar|econnreset|fetch failed/i, true],
];

export function classifyEditorialFailure(error, { stage = "unknown", now = new Date() } = {}) {
  const message = String(error?.message || error || "Falha editorial não especificada").slice(0, 650);
  const match = RULES.find(([, pattern]) => pattern.test(message));
  const [code, , retryable] = match || [EditorialFailureCode.VALIDATION_FAILED, null, false];
  return { code, retryable, stage, message, recordedAt: now.toISOString() };
}
