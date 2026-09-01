import { createHash } from "node:crypto";

export const EDITORIAL_POLICY_VERSION = "thebiker-editorial-2026-08-v3";

export const AUTOMATED_REVIEWER = "TheBiker AI Editorial Gate";

export function assertAutomatedReviewer(article) {
  const reviewer = String(article?.ai_reviewed_by || "").trim();
  if (reviewer !== AUTOMATED_REVIEWER) {
    throw new Error(`Publicação automatizada exige ai_reviewed_by: "${AUTOMATED_REVIEWER}".`);
  }
  return reviewer;
}

export function hashEditorialText(value) {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n");
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

export function assertReviewedContentIntegrity(content, aiReview) {
  if (!aiReview?.contentHash) throw new Error("Recibo da revisão sem contentHash");
  const actual = hashEditorialText(content);
  if (actual !== aiReview.contentHash) {
    throw new Error(`Integridade editorial divergente: esperado ${aiReview.contentHash}, obtido ${actual}`);
  }
  return actual;
}

export function issueEditorialReceipt({ content, researchContent = null, aiReview, now = new Date(), origin = "pipeline" }) {
  if (aiReview?.deterministicFullArticleFallbackUsed) {
    throw new Error("Recibo editorial não pode ser emitido para artigo integral de fallback determinístico");
  }
  if ((aiReview?.finalScore ?? 0) < 90 || (aiReview?.finalBlockers ?? 0) > 0) {
    throw new Error("Recibo editorial exige nota final >= 90 e zero bloqueadores");
  }
  return {
    schemaVersion: 1,
    policyVersion: EDITORIAL_POLICY_VERSION,
    origin,
    reviewedContentHash: aiReview.contentHash || hashEditorialText(content),
    scheduledContentHash: hashEditorialText(content),
    researchHash: researchContent === null ? null : hashEditorialText(researchContent),
    sourceHash: aiReview.sourceHash || null,
    finalScore: aiReview.finalScore,
    finalBlockers: aiReview.finalBlockers,
    issuedAt: now.toISOString(),
  };
}

export function assertScheduledReceipt(content, item) {
  const receipt = item?.editorialReceipt;
  if (!receipt) throw new Error(`Pauta ${item?.id || "desconhecida"} sem recibo editorial`);
  if (item.aiReview?.deterministicFullArticleFallbackUsed) {
    throw new Error("Recibo editorial inválido para artigo integral de fallback determinístico");
  }
  if (receipt.policyVersion !== EDITORIAL_POLICY_VERSION) {
    throw new Error(`Política editorial desatualizada: ${receipt.policyVersion}`);
  }
  const actual = hashEditorialText(content);
  if (actual !== receipt.scheduledContentHash) {
    throw new Error(`Hash do artefato agendado divergente: esperado ${receipt.scheduledContentHash}, obtido ${actual}`);
  }
  if (receipt.finalScore !== item.aiReview?.finalScore || receipt.finalBlockers !== item.aiReview?.finalBlockers) {
    throw new Error("Recibo editorial não corresponde à revisão final registrada");
  }
  return actual;
}

export function refreshReceiptAfterDeterministicTransform({ content, item, now = new Date() }) {
  if (!item.editorialReceipt) return null;
  const hash = hashEditorialText(content);
  return {
    ...item.editorialReceipt,
    origin: "deterministic-transform",
    scheduledContentHash: item.status === "scheduled" ? hash : item.editorialReceipt.scheduledContentHash,
    publishedContentHash: item.status === "published" ? hash : item.editorialReceipt.publishedContentHash,
    issuedAt: now.toISOString(),
  };
}
