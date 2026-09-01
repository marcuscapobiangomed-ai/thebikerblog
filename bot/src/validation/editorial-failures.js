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
  // A message naming the specific reason research is unusable (no permitted
  // source, missing evidence, etc.) is a research failure even when a
  // provider/429 detail is also mentioned alongside it — the root cause is
  // the missing source, not the provider hiccup, and it shouldn't retry as
  // transient. Checked before the transient-provider rule for that reason.
  [EditorialFailureCode.RESEARCH_INSUFFICIENT, /nenhuma fonte oficial permitida|sem fontes editoriais|pesquisa bloqueada|integridade de fontes|integridade de claims/i, false],
  [EditorialFailureCode.TRANSIENT_PROVIDER, /timeout|timed out|aborted|429|rate limit|temporar|econnreset|fetch failed|insufficient balance|tokens per minute|rate_limit_exceeded|quota(?: exceeded| limit)?|payment required/i, true],
  // Provider outages that prevent the internal evidence fallback are research
  // failures. Classifying them before the visual rule lets recovery retry the
  // research path or consume a verified reserve instead of repairing images.
  [EditorialFailureCode.RESEARCH_INSUFFICIENT, /fallback interno bloqueado/i, false],
  [EditorialFailureCode.IMAGE_NOT_PUBLISHABLE, /imagem|image|variante public[aá]vel|fallback (?:de|da)?\s*(?:imagem|visual|capa)|pol[ií]tica visual|fotografia real/i, false],
  [EditorialFailureCode.AI_REVIEW_REJECTED, /nota editorial final insuficiente|revis[aã]o final reprovada|bloqueadores/i, false],
];

export function classifyEditorialFailure(error, { stage = "unknown", now = new Date() } = {}) {
  const message = String(error?.message || error || "Falha editorial não especificada").slice(0, 650);
  const match = RULES.find(([, pattern]) => pattern.test(message));
  const [code, , retryable] = match || [EditorialFailureCode.VALIDATION_FAILED, null, false];
  return { code, retryable, stage, message, recordedAt: now.toISOString() };
}
