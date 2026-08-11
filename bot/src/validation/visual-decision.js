import crypto from "node:crypto";
import { imageArticleConsistencyErrors } from "./image-article-consistency.js";

export const VISUAL_POLICY_VERSION = "thebiker-visual-autonomy-v1";
export const VISUAL_APPROVAL_SCORE = 90;

function stableInput({ item, manifest }) {
  return {
    heroImage: item.heroImage,
    assetId: manifest.assetId || null,
    sha256: manifest.sha256 || null,
    factualSubject: manifest.factualSubject || null,
    matchedProductId: manifest.matchedProduct?.id || null,
    depictedBrands: manifest.depictedBrands || [],
    sourceType: manifest.source?.type || null,
    rightsPolicyId: manifest.source?.rightsPolicyId || null,
    qualityTier: manifest.qualityTier || "standard",
  };
}

export function visualDecisionInputHash(options) {
  const value = JSON.stringify(stableInput(options));
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

export function issueVisualDecision({ item, article, manifest, catalog, now = new Date() }) {
  const consistency = imageArticleConsistencyErrors({ article, manifest, campaignItem: item, catalog });
  const expectedProductId = ["exact-product", "real-context"].includes(item.heroImage?.mode)
    ? item.heroImage.productId
    : null;
  const hardGates = {
    semanticMatch: consistency.length === 0,
    realAsset: manifest.factualSubject === "exact-product" && manifest.aiGenerated === false,
    explicitProduct: Boolean(expectedProductId) && manifest.matchedProduct?.id === expectedProductId,
    officialSource: ["thebiker", "manufacturer"].includes(manifest.source?.type),
    approvedRights: Boolean(manifest.source?.rightsPolicyId && manifest.source?.licenseEvidence),
    publishableResolution: manifest.editorialUse === "publishable" && (
      ["standard", "high-definition"].includes(manifest.qualityTier)
      || (manifest.files?.hero?.width === 1600 && manifest.files?.hero?.height === 900)
    ),
    uniqueAsset: Boolean(manifest.assetId && manifest.sha256 && manifest.approval?.checks?.includes("sem-concorrente")),
  };
  const weights = {
    semanticMatch: 30,
    realAsset: 20,
    explicitProduct: 15,
    officialSource: 10,
    approvedRights: 10,
    publishableResolution: 10,
    uniqueAsset: 5,
  };
  const score = Object.entries(weights).reduce((total, [gate, weight]) => total + (hardGates[gate] ? weight : 0), 0);
  const blockers = [
    ...consistency,
    ...Object.entries(hardGates).filter(([, passed]) => !passed).map(([gate]) => `gate visual reprovado: ${gate}`),
  ];
  return {
    schemaVersion: 1,
    policyVersion: VISUAL_POLICY_VERSION,
    inputHash: visualDecisionInputHash({ item, manifest }),
    mode: item.heroImage?.mode || "conceptual",
    productId: expectedProductId,
    score,
    hardGates,
    blockers: [...new Set(blockers)],
    issuedAt: now.toISOString(),
  };
}

export function visualDecisionErrors({ receipt, item, article, manifest, catalog }) {
  if (!receipt) return ["decisao visual auditavel ausente"];
  const recalculated = issueVisualDecision({ item, article, manifest, catalog, now: new Date(receipt.issuedAt) });
  const errors = [];
  if (receipt.inputHash !== recalculated.inputHash) errors.push("decisao visual nao corresponde aos artefatos atuais");
  if (receipt.mode !== recalculated.mode) errors.push("modo da decisao visual diverge da politica atual");
  if (receipt.productId !== recalculated.productId) errors.push("produto da decisao visual diverge da politica atual");
  if (receipt.score !== recalculated.score) errors.push(`nota visual divergente: registrada ${receipt.score}, calculada ${recalculated.score}`);
  if (JSON.stringify(receipt.hardGates) !== JSON.stringify(recalculated.hardGates)) errors.push("gates visuais registrados divergem da recalibracao");
  if (receipt.mode === "conceptual" || item.heroImage?.mode === "conceptual") errors.push("capa conceitual nao pode entrar no buffer agendado");
  if (recalculated.score < VISUAL_APPROVAL_SCORE || recalculated.blockers.length > 0) {
    errors.push(`decisao visual reprovada (${recalculated.score}/100): ${recalculated.blockers.join("; ")}`);
  }
  return errors;
}

export function assertVisualDecision(options) {
  const errors = visualDecisionErrors(options);
  if (errors.length > 0) throw new Error(`Gate de credibilidade visual: ${errors.join("; ")}`);
  return options.receipt;
}
