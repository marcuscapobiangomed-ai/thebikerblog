import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import campaignFixture from '../bot/editorial-campaign.json' with { type: 'json' }
import { recoverBlockedCampaign, recoverBlockedCampaignFiles } from '../bot/src/automation/recover-blocked.js'
import { CampaignSchema } from '../bot/src/automation/campaign.js'

const transient = structuredClone(campaignFixture)
for (const item of transient.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
function addIsolatedReserve(campaign, id) {
  campaign.reserves = campaign.reserves.filter((reserve) => reserve.id !== id)
  campaign.reserves.unshift({
    id,
    title: 'Reserva isolada para teste de recomposição segura',
    summary: 'Reserva de teste independente do calendário vivo para verificar a substituição automática de uma pauta bloqueada.',
    category: 'manutencao-ajustes',
    productIds: ['corrente-sram-nx-eagle'],
    heroImage: { mode: 'exact-product', productId: 'corrente-sram-nx-eagle' },
  })
  return campaign
}
function makeProducedFixture(campaign) {
  const item = campaign.items.find((candidate) => candidate.status === 'planned') || campaign.items[0]
  item.status = 'planned'
  item.category = 'engenharia'
  delete item.race
  item.productIds = []
  item.heroImage = { mode: 'conceptual' }
  item.postPath = `_posts/drafts/${item.publishDate}-${item.id}.md`
  item.aiReview = {
    score: 95,
    finalScore: 95,
    finalBlockers: 0,
    premiumEditUsed: false,
    providers: { fixture: 'fixture' },
    generatedAt: '2026-08-13T15:00:00.000Z',
    contentHash: `sha256:${'a'.repeat(64)}`,
  }
  delete item.publishedAt
  delete item.blockReason
  delete item.failure
  return item
}
const timeout = transient.items.find((item) => item.status === 'planned')
assert.ok(timeout, 'A campanha precisa ter ao menos uma pauta planejada para o teste transitório')
timeout.status = 'blocked'
timeout.attempts = 1
timeout.blockReason = 'The operation was aborted due to timeout'
const retried = recoverBlockedCampaign(transient, { now: new Date('2026-08-07T12:00:00Z') })
assert.equal(retried.result.status, 'retry')
assert.equal(retried.campaign.items.find((item) => item.id === timeout.id).status, 'planned')

const providerQuota = structuredClone(campaignFixture)
for (const item of providerQuota.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
const quotaItem = providerQuota.items.find((item) => item.status === 'planned')
assert.ok(quotaItem, 'A campanha precisa de uma pauta para testar a recuperaÃ§Ã£o de cota do provedor')
quotaItem.status = 'blocked'
quotaItem.attempts = 1
quotaItem.blockReason = '[VALIDATION_FAILED] Etapa final-audit falhou. deepseek: 402 Insufficient Balance | groq: 413 tokens per minute'
const quotaRetry = recoverBlockedCampaign(providerQuota, { now: new Date('2026-08-13T12:01:00Z') })
assert.equal(quotaRetry.result.status, 'retry')
assert.equal(quotaRetry.campaign.items.find((item) => item.id === quotaItem.id).status, 'planned')

const groundingFailure = structuredClone(campaignFixture)
for (const item of groundingFailure.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
// Keep the replacement assertion independent from the live calendar: the
// replenishment workflow legitimately consumes reserve IDs between runs.
const isolatedGroundingReserveId = 'reserva-recovery-fixture-grounding'
groundingFailure.reserves = groundingFailure.reserves.filter((reserve) => reserve.id !== isolatedGroundingReserveId)
groundingFailure.reserves.unshift({
  id: isolatedGroundingReserveId,
  title: 'Reserva de teste para falha de grounding e recomposição',
  summary: 'Reserva isolada para verificar a troca automática depois do limite de pesquisa sem tocar na pauta real.',
  category: 'manutencao-ajustes',
  productIds: ['corrente-sram-nx-eagle'],
})
const ungrounded = groundingFailure.items.find((item) => item.status === 'planned')
ungrounded.status = 'blocked'
ungrounded.attempts = 1
ungrounded.postPath = `_posts/drafts/${ungrounded.publishDate}-${ungrounded.id}.md`
ungrounded.aiReview = { score: 85, finalScore: 95, finalBlockers: 0, premiumEditUsed: true, providers: {}, generatedAt: '2026-08-13T15:00:00.000Z', contentHash: `sha256:${'a'.repeat(64)}` }
ungrounded.failure = { code: 'RESEARCH_INSUFFICIENT', retryable: false, stage: 'grounding-audit', message: 'Pesquisa bloqueada por integridade de fontes', recordedAt: '2026-08-13T15:00:00.000Z' }
ungrounded.blockReason = `[RESEARCH_INSUFFICIENT] ${ungrounded.failure.message}`
const groundingRetry = recoverBlockedCampaign(groundingFailure, { now: new Date('2026-08-13T15:01:00Z') })
assert.equal(groundingRetry.result.status, 'retry-research-grounding')
const groundedRetryItem = groundingRetry.campaign.items.find((item) => item.id === ungrounded.id)
assert.equal(groundedRetryItem.status, 'planned')
assert.equal(groundedRetryItem.postPath, undefined)
assert.equal(groundedRetryItem.aiReview, undefined)
const setGroundingFailure = (attempts, message, stage = 'claim-grounding-audit', recordedAt = '2026-08-13T15:02:00.000Z') => {
  const item = groundingFailure.items.find((candidate) => candidate.id === ungrounded.id)
  item.status = 'blocked'
  item.attempts = attempts
  item.failure = { code: 'RESEARCH_INSUFFICIENT', retryable: false, stage, message, recordedAt }
  item.blockReason = `[RESEARCH_INSUFFICIENT] ${message}`
}
setGroundingFailure(3, 'Artigo bloqueado por integridade de claims')
const finalGroundingRetry = recoverBlockedCampaign(groundingFailure, { now: new Date('2026-08-13T15:03:00Z') })
assert.equal(finalGroundingRetry.result.status, 'retry-research-grounding')
setGroundingFailure(4, 'Artigo bloqueado por integridade de claims')
const providerGroundingRetry = recoverBlockedCampaign(groundingFailure, { now: new Date('2026-08-13T15:04:00Z') })
assert.equal(providerGroundingRetry.result.status, 'retry-research-grounding')
setGroundingFailure(5, 'Artigo bloqueado por integridade de claims')
const deterministicGroundingRetry = recoverBlockedCampaign(groundingFailure, { now: new Date('2026-08-13T15:05:00Z') })
assert.equal(deterministicGroundingRetry.result.status, 'retry-research-grounding')
setGroundingFailure(6, 'Artigo bloqueado por integridade de claims')
const schemaSafeGroundingRetry = recoverBlockedCampaign(groundingFailure, { now: new Date('2026-08-13T15:06:00Z') })
assert.equal(schemaSafeGroundingRetry.result.status, 'retry-research-grounding')
setGroundingFailure(7, 'Artigo bloqueado por integridade de claims')
const neutralizedGroundingRetry = recoverBlockedCampaign(groundingFailure, { now: new Date('2026-08-13T15:07:00Z') })
assert.equal(neutralizedGroundingRetry.result.status, 'retry-research-grounding')
setGroundingFailure(8, 'Artigo bloqueado por integridade de claims')
const cappedGroundingRetry = recoverBlockedCampaign(groundingFailure, { now: new Date('2026-08-13T15:08:00Z') })
assert.notEqual(cappedGroundingRetry.result.status, 'retry-research-grounding')
const earlyReplacement = structuredClone(groundingFailure)
const earlyBlocked = earlyReplacement.items.find((item) => item.id === ungrounded.id)
earlyBlocked.attempts = 2
const replacedAfterAutomaticResearchCap = recoverBlockedCampaign(earlyReplacement, {
  now: new Date('2026-08-13T15:09:00Z'),
  maximumResearchAttempts: 2,
})
assert.equal(replacedAfterAutomaticResearchCap.result.status, 'replaced',
  'a recomposição automática deve avançar para uma reserva após duas falhas de grounding')

const rejectedArticleCampaign = structuredClone(campaignFixture)
for (const item of rejectedArticleCampaign.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
addIsolatedReserve(rejectedArticleCampaign, 'reserva-recovery-fixture-rejected-article')
const rejectedArticle = rejectedArticleCampaign.items.find((item) => item.status === 'planned')
rejectedArticle.status = 'blocked'
rejectedArticle.attempts = 1
rejectedArticle.failure = { code: 'RESEARCH_INSUFFICIENT', retryable: false, stage: 'production', message: 'Rascunho bloqueado após 2 reparos: Artigo bloqueado por integridade de claims', recordedAt: '2026-08-13T15:09:00.000Z' }
rejectedArticle.blockReason = `[RESEARCH_INSUFFICIENT] ${rejectedArticle.failure.message}`
const replacedRejectedArticle = recoverBlockedCampaign(rejectedArticleCampaign, { now: new Date(`${rejectedArticle.publishDate}T12:00:00Z`) })
assert.equal(replacedRejectedArticle.result.status, 'replaced')
assert.notEqual(replacedRejectedArticle.result.replacementId, rejectedArticle.id)
assert.equal(replacedRejectedArticle.campaign.items[rejectedArticle.day - 1].status, 'planned')

const structuralFailure = structuredClone(campaignFixture)
for (const item of structuralFailure.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
const malformedDraft = structuralFailure.items.find((item) => item.status === 'planned')
malformedDraft.status = 'blocked'
malformedDraft.attempts = 4
malformedDraft.failure = { code: 'VALIDATION_FAILED', retryable: false, stage: 'production', message: 'Rascunho bloqueado após 2 reparos: Artigo inválido: sections.0.heading: Too small: expected string to have >=1 characters', recordedAt: '2026-08-13T15:44:50.000Z' }
malformedDraft.blockReason = `[VALIDATION_FAILED] ${malformedDraft.failure.message}`
const structureRetry = recoverBlockedCampaign(structuralFailure, { now: new Date('2026-08-13T15:35:00Z') })
assert.equal(structureRetry.result.status, 'retry-editorial-structure')
assert.equal(structureRetry.campaign.items.find((item) => item.id === malformedDraft.id).status, 'planned')

const finalization = structuredClone(campaignFixture)
for (const item of finalization.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
addIsolatedReserve(finalization, 'reserva-recovery-fixture-finalization')
const finalizable = makeProducedFixture(finalization)
finalizable.status = 'blocked'
delete finalizable.publishedAt
finalizable.blockReason = 'Validação final: imagem oficial ainda sem variante publicável'
const resumed = recoverBlockedCampaign(finalization, { now: new Date('2026-08-07T12:00:00Z') })
assert.equal(resumed.result.status, 'retry-finalization')
assert.equal(resumed.campaign.items.find((item) => item.id === finalizable.id).status, 'validation')

const duplicateImageFinalization = structuredClone(finalization)
const duplicateImageItem = duplicateImageFinalization.items.find((item) => item.id === finalizable.id)
duplicateImageItem.status = 'blocked'
duplicateImageItem.productIds = ['bicicleta-scott-scale-940-black']
duplicateImageItem.heroImage = {
  mode: 'real-context',
  productId: 'bicicleta-scott-scale-940-black',
  relationship: 'category-example',
  rationale: 'Produto real usado apenas como exemplo visual.',
}
duplicateImageItem.blockReason = 'Validacao final: [IMAGE_NOT_PUBLISHABLE] Galeria oficial sem imagem inedita valida: Imagem duplicada: manufacturer-scale'
const alternativeVisualRetry = recoverBlockedCampaign(duplicateImageFinalization, { now: new Date('2026-08-07T12:00:00Z') })
assert.equal(alternativeVisualRetry.result.status, 'retry-finalization-alternative-visual')
assert.equal(alternativeVisualRetry.campaign.items.find((item) => item.id === duplicateImageItem.id).status, 'validation')
assert.ok(alternativeVisualRetry.campaign.items.find((item) => item.id === duplicateImageItem.id).productIds.length > 1)

const exhaustedExactProduct = structuredClone(finalization)
const exhaustedExactItem = exhaustedExactProduct.items.find((item) => item.id === finalizable.id)
exhaustedExactItem.status = 'blocked'
exhaustedExactItem.productIds = ['bicicleta-scott-scale-940-black']
exhaustedExactItem.heroImage = { mode: 'exact-product', productId: 'bicicleta-scott-scale-940-black' }
exhaustedExactItem.failure = {
  code: 'IMAGE_NOT_PUBLISHABLE', retryable: false, stage: 'finalization',
  message: 'Galeria oficial sem imagem inédita válida: Imagem duplicada | HTTP 403 | resolução insuficiente: 480x480',
  recordedAt: '2026-08-14T10:08:48.000Z',
}
exhaustedExactItem.blockReason = `Validação final: [IMAGE_NOT_PUBLISHABLE] ${exhaustedExactItem.failure.message}`
const exactReplacement = recoverBlockedCampaign(exhaustedExactProduct, { now: new Date('2026-08-07T12:00:00Z') })
assert.equal(exactReplacement.result.status, 'replaced', 'imagem permanente de exact-product exige outra pauta, não nova tentativa idêntica')
const exactReplacementItem = exactReplacement.campaign.items[exhaustedExactItem.day - 1]
assert.notEqual(exactReplacementItem.id, exhaustedExactItem.id)
assert.notEqual(exactReplacementItem.heroImage.productId, exhaustedExactItem.heroImage.productId,
  'a reserva não pode reutilizar o produto cujo inventário visual foi esgotado')

const deterministicReviewCampaign = structuredClone(campaignFixture)
for (const item of deterministicReviewCampaign.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
const deterministicReviewItem = makeProducedFixture(deterministicReviewCampaign)
deterministicReviewItem.status = 'blocked'
deterministicReviewItem.attempts = 1
deterministicReviewItem.aiReview = {
  ...structuredClone(deterministicReviewItem.aiReview),
  finalScore: null,
  finalBlockers: 0,
  deterministicFullArticleFallbackUsed: true,
}
deterministicReviewItem.failure = {
  code: 'AI_REVIEW_REJECTED', retryable: false, stage: 'finalization',
  message: 'Recibo editorial exige nota final >= 90 e zero bloqueadores', recordedAt: '2026-08-13T15:00:00.000Z',
}
deterministicReviewItem.blockReason = `Validação final: [AI_REVIEW_REJECTED] ${deterministicReviewItem.failure.message}`
const deterministicReviewRetry = recoverBlockedCampaign(deterministicReviewCampaign, { now: new Date('2026-08-13T15:01:00Z') })
assert.equal(deterministicReviewRetry.result.status, 'retry-deterministic-fallback-review')
const resetDeterministicReview = deterministicReviewRetry.campaign.items.find((item) => item.id === deterministicReviewItem.id)
assert.equal(resetDeterministicReview.status, 'planned')
assert.equal(resetDeterministicReview.postPath, undefined)
assert.equal(resetDeterministicReview.aiReview, undefined)

const conceptualFinalization = structuredClone(campaignFixture)
for (const item of conceptualFinalization.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
const conceptualPolicyId = 'reserva-pressao-pneus-terreno'
conceptualFinalization.reserves = conceptualFinalization.reserves.filter((item) => item.id !== conceptualPolicyId)
const conceptual = conceptualFinalization.items.find((item) => item.id === conceptualPolicyId)
  || conceptualFinalization.items.find((item) => item.id === finalizable.id)
assert.ok(conceptual, 'A campanha precisa conter uma pauta produzida para testar o reparo visual')
conceptual.id = conceptualPolicyId
conceptual.postPath = finalizable.postPath
conceptual.aiReview = structuredClone(finalizable.aiReview)
conceptual.status = 'blocked'
conceptual.heroImage = { mode: 'conceptual' }
conceptual.blockReason = 'Validação final: Politica visual conceptual: agendamento exige fotografia real explicitamente vinculada'
conceptual.failure = {
  code: 'IMAGE_NOT_PUBLISHABLE', retryable: false, stage: 'finalization',
  message: 'Politica visual conceptual: agendamento exige fotografia real explicitamente vinculada',
  recordedAt: '2026-08-07T12:00:00.000Z',
}
const visualRecovered = recoverBlockedCampaign(conceptualFinalization, { now: new Date('2026-08-07T12:00:00Z') })
assert.equal(visualRecovered.result.status, 'repair-finalization-visual')
const repairedVisualItem = visualRecovered.campaign.items.find((item) => item.id === conceptual.id)
assert.equal(repairedVisualItem.status, 'validation')
assert.equal(repairedVisualItem.heroImage.mode, 'real-context')
assert.deepEqual(repairedVisualItem.productIds, [repairedVisualItem.heroImage.productId])

const missingDynamicDraft = structuredClone(campaignFixture)
for (const item of missingDynamicDraft.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
const dynamicItem = missingDynamicDraft.items.find((item) => item.id === 'youtube-bicicletas-eletricas-arquitetura-autonomia-limites-e-criterios-t')
  || missingDynamicDraft.items.find((item) => item.status === 'planned')
dynamicItem.status = 'blocked'
dynamicItem.attempts = 1
dynamicItem.heroImage = { mode: 'conceptual' }
dynamicItem.postPath = `_posts/drafts/${dynamicItem.publishDate}-${dynamicItem.id}.md`
dynamicItem.aiReview = { score: 85, finalScore: 95, finalBlockers: 0, premiumEditUsed: true, providers: {}, generatedAt: '2026-08-13T14:24:34.237Z', contentHash: `sha256:${'a'.repeat(64)}` }
dynamicItem.failure = { code: 'IMAGE_NOT_PUBLISHABLE', retryable: false, stage: 'finalization', message: 'Politica visual conceptual: agendamento exige fotografia real explicitamente vinculada', recordedAt: '2026-08-13T14:26:16.026Z' }
dynamicItem.blockReason = `Validação final: [IMAGE_NOT_PUBLISHABLE] ${dynamicItem.failure.message}`
const regeneratedDynamic = recoverBlockedCampaign(missingDynamicDraft, {
  now: new Date('2026-08-13T15:00:00Z'),
  finalizationDraftErrors: ['rascunho indisponível (ENOENT)'],
})
assert.equal(regeneratedDynamic.result.status, 'retry-production-with-semantic-visual')
const resetDynamicItem = regeneratedDynamic.campaign.items.find((item) => item.id === dynamicItem.id)
assert.equal(resetDynamicItem.status, 'planned')
assert.equal(resetDynamicItem.postPath, undefined)
assert.equal(resetDynamicItem.aiReview, undefined)
assert.equal(resetDynamicItem.attempts, 1)

const policyAlias = structuredClone(campaignFixture)
for (const item of policyAlias.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
const aliasBlocked = policyAlias.items.find((item) => item.id === conceptualPolicyId) || policyAlias.items.find((item) => item.status === 'planned')
assert.ok(aliasBlocked, 'A campanha precisa conter uma pauta para testar normalização de marca')
aliasBlocked.status = 'blocked'
aliasBlocked.failure = { code: 'VALIDATION_FAILED', retryable: false, stage: 'production', message: 'Política TheBiker: promoção bloqueada para marca fora do portfólio: TheBiker Shop.', recordedAt: '2026-08-13T10:12:09.040Z' }
aliasBlocked.blockReason = `[VALIDATION_FAILED] ${aliasBlocked.failure.message}`
const policyRetried = recoverBlockedCampaign(policyAlias, { now: new Date('2026-08-13T12:00:00Z') })
assert.equal(policyRetried.result.status, 'retry-policy-normalization')
assert.equal(policyRetried.campaign.items.find((item) => item.id === aliasBlocked.id).status, 'planned')

const nearMiss = structuredClone(campaignFixture)
for (const item of nearMiss.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
// The workflow runs this suite after producing content, so the live campaign
// may already have consumed most of its reserve pool. Keep this recovery test
// independent from that mutable production state.
for (let index = 1; index <= 4; index += 1) addIsolatedReserve(nearMiss, `reserva-recovery-fixture-near-miss-${index}`)
const shortItem = nearMiss.items.find((item) => item.id === conceptualPolicyId) || nearMiss.items.find((item) => item.status === 'planned')
shortItem.status = 'blocked'
shortItem.attempts = 2
shortItem.failure = { code: 'VALIDATION_FAILED', retryable: false, stage: 'production', message: 'Gates editoriais não atendidos: extensão insuficiente: 1532 palavras; mínimo 1600', recordedAt: '2026-08-13T12:05:24.534Z' }
shortItem.blockReason = `[VALIDATION_FAILED] ${shortItem.failure.message}`
const expandedRetry = recoverBlockedCampaign(nearMiss, { now: new Date('2026-08-13T13:00:00Z') })
assert.equal(expandedRetry.result.status, 'retry-editorial-expansion')
assert.equal(expandedRetry.campaign.items.find((item) => item.id === shortItem.id).status, 'planned')
shortItem.attempts = 3
const cappedRetry = recoverBlockedCampaign(nearMiss, { now: new Date('2026-08-13T13:00:00Z') })
assert.notEqual(cappedRetry.result.status, 'retry-editorial-expansion')

const legacyRepairRegression = structuredClone(nearMiss)
const regressedItem = legacyRepairRegression.items.find((item) => item.id === shortItem.id)
regressedItem.status = 'blocked'
regressedItem.attempts = 3
regressedItem.failure = { code: 'VALIDATION_FAILED', retryable: false, stage: 'production', message: 'Rascunho bloqueado após 2 reparos: Gates editoriais não atendidos: extensão insuficiente: 1333 palavras; mínimo 1600', recordedAt: '2026-08-13T12:19:22.290Z' }
regressedItem.blockReason = `[VALIDATION_FAILED] ${regressedItem.failure.message}`
const regressionRetry = recoverBlockedCampaign(legacyRepairRegression, { now: new Date('2026-08-13T13:00:00Z') })
assert.equal(regressionRetry.result.status, 'retry-editorial-expansion')
regressedItem.attempts = 4
const cappedRegression = recoverBlockedCampaign(legacyRepairRegression, { now: new Date('2026-08-13T13:00:00Z') })
assert.notEqual(cappedRegression.result.status, 'retry-editorial-expansion')

const invalidFinalization = structuredClone(finalization)
addIsolatedReserve(invalidFinalization, 'reserva-recovery-fixture-invalid-finalization')
const invalidDraft = invalidFinalization.items.find((item) => item.id === finalizable.id)
invalidDraft.status = 'blocked'
invalidDraft.blockReason = 'Validação final: Gate Markdown reprovado: linguagem publicitária proibida: imbatível'
const invalidRecovered = recoverBlockedCampaign(invalidFinalization, {
  now: new Date('2026-08-07T12:00:00Z'),
  finalizationDraftErrors: ['linguagem publicitária proibida: imbatível'],
})
assert.equal(invalidRecovered.result.status, 'replaced')
assert.notEqual(invalidRecovered.campaign.items[invalidDraft.day - 1].id, invalidDraft.id)
assert.match(invalidRecovered.exception.reason, /rascunho ainda reprovado/)

const recoveryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'thebiker-campaign-recovery-'))
try {
  await fs.mkdir(path.join(recoveryRoot, 'bot/operational-state'), { recursive: true })
  await fs.mkdir(path.join(recoveryRoot, '_data'), { recursive: true })
  const invalidDraftPath = path.join(recoveryRoot, invalidDraft.postPath)
  await fs.mkdir(path.dirname(invalidDraftPath), { recursive: true })
  await fs.writeFile(path.join(recoveryRoot, 'bot/editorial-campaign.json'), `${JSON.stringify(invalidFinalization, null, 2)}\n`)
  await fs.writeFile(invalidDraftPath, `---
published: false
tags: ["ciclismo", "componentes"]
review_method: "desk-research"
tested_by_thebikerblog: false
---

Este produto é imbatível.
`)
  const fileRecovery = await recoverBlockedCampaignFiles({ root: recoveryRoot, now: new Date('2026-08-07T12:00:00Z') })
  assert.equal(fileRecovery.status, 'replaced')
  const persistedCampaign = JSON.parse(await fs.readFile(path.join(recoveryRoot, 'bot/editorial-campaign.json'), 'utf8'))
  assert.notEqual(persistedCampaign.items[invalidDraft.day - 1].id, invalidDraft.id)
} finally {
  await fs.rm(recoveryRoot, { recursive: true, force: true })
}

const exhaustedCleanupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'thebiker-exhausted-image-cleanup-'))
try {
  const cleanupCampaign = structuredClone(exhaustedExactProduct)
  const cleanupItem = cleanupCampaign.items.find((item) => item.id === exhaustedExactItem.id)
  cleanupItem.postPath = `_posts/drafts/${cleanupItem.publishDate}-${cleanupItem.id}.md`
  const cleanupDraftPath = path.join(exhaustedCleanupRoot, cleanupItem.postPath)
  const cleanupResearchPath = path.join(exhaustedCleanupRoot, 'content/research/campaign', `${cleanupItem.id}.json`)
  await Promise.all([
    fs.mkdir(path.join(exhaustedCleanupRoot, 'bot/operational-state'), { recursive: true }),
    fs.mkdir(path.join(exhaustedCleanupRoot, '_data'), { recursive: true }),
    fs.mkdir(path.dirname(cleanupDraftPath), { recursive: true }),
    fs.mkdir(path.dirname(cleanupResearchPath), { recursive: true }),
  ])
  await Promise.all([
    fs.writeFile(path.join(exhaustedCleanupRoot, 'bot/editorial-campaign.json'), `${JSON.stringify(cleanupCampaign, null, 2)}\n`),
    fs.writeFile(cleanupDraftPath, '---\npublished: false\n---\n\nCandidato que será substituído.\n'),
    fs.writeFile(cleanupResearchPath, '{}\n'),
  ])
  const cleanupRecovery = await recoverBlockedCampaignFiles({ root: exhaustedCleanupRoot, now: new Date('2026-08-07T12:00:00Z') })
  assert.equal(cleanupRecovery.status, 'replaced')
  await assert.rejects(() => fs.stat(cleanupDraftPath), { code: 'ENOENT' })
  await assert.rejects(() => fs.stat(cleanupResearchPath), { code: 'ENOENT' })
} finally {
  await fs.rm(exhaustedCleanupRoot, { recursive: true, force: true })
}

const permanent = structuredClone(campaignFixture)
for (const item of permanent.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason; delete item.failure }
addIsolatedReserve(permanent, 'reserva-recovery-fixture-permanent')
addIsolatedReserve(permanent, 'reserva-recovery-fixture-permanent-remaining')
const unsupported = permanent.items.find((item) => item.status === 'planned')
assert.ok(unsupported, 'A campanha precisa ter ao menos uma pauta planejada para o teste permanente')
unsupported.status = 'blocked'
unsupported.blockReason = 'Falha editorial permanente sem estratégia segura de recuperação'
const replaced = recoverBlockedCampaign(permanent, { now: new Date('2026-08-07T12:00:00Z') })
assert.equal(replaced.result.status, 'replaced')
assert.equal(replaced.campaign.items[unsupported.day - 1].publishDate, unsupported.publishDate)
assert.notEqual(replaced.campaign.items[unsupported.day - 1].id, unsupported.id)
assert.ok(replaced.exception)
assert.ok(replaced.campaign.reserves.length >= 3)
const executableReplacement = replaced.campaign.items[unsupported.day - 1]
// A legacy reserve in the live calendar has no productIds but is mapped to a
// real-context product. It must still be selected after a provider/evidence
// failure, and the campaign must remain schema-valid with a replenished pool.
const legacyReserveFallback = structuredClone(campaignFixture)
for (const item of legacyReserveFallback.items.filter((candidate) => candidate.publishDate >= '2026-08-20')) {
  item.status = 'planned'
  delete item.blockReason
  delete item.failure
  delete item.postPath
  delete item.aiReview
  delete item.editorialReceipt
  delete item.visualDecision
  delete item.imageManifestPath
  delete item.imageStatus
  delete item.imageValidatedAt
  item.imageAssetIds = []
}
const legacyBlocked = legacyReserveFallback.items.find((item) => item.day === 13)
// The live workflow may already have consumed this reserve before the test
// suite runs. Give the blocked fixture its own id so the reserve selection is
// deterministic and independent from persisted campaign state.
legacyBlocked.id = 'legacy-research-failure-fixture'
legacyBlocked.category = 'manutencao-ajustes'
delete legacyBlocked.race
legacyBlocked.productIds = []
legacyBlocked.heroImage = { mode: 'conceptual' }
legacyBlocked.status = 'blocked'
legacyBlocked.attempts = 2
legacyBlocked.blockReason = '[IMAGE_NOT_PUBLISHABLE] Fallback interno bloqueado: nenhuma fonte oficial permitida (Groq 429)'
legacyBlocked.failure = {
  code: 'IMAGE_NOT_PUBLISHABLE', retryable: false, stage: 'production',
  message: 'Fallback interno bloqueado: nenhuma fonte oficial permitida (Groq 429)',
  recordedAt: '2026-08-13T16:00:00.000Z',
}
const legacyRecovered = recoverBlockedCampaign(legacyReserveFallback, {
  now: new Date('2026-08-13T16:00:00Z'),
  maximumResearchAttempts: 2,
})
assert.equal(legacyRecovered.result.status, 'replaced')
const legacyReplacement = legacyRecovered.campaign.items[legacyBlocked.day - 1]
assert.notEqual(legacyReplacement.category, 'competicoes')
assert.ok(legacyReplacement.productIds.length > 0)
assert.equal(legacyReplacement.heroImage.mode, 'real-context')
assert.doesNotThrow(() => CampaignSchema.parse(legacyRecovered.campaign),
  'consumir uma reserva legítima não pode tornar a campanha inválida')
assert.ok(executableReplacement.productIds.length > 0, 'reserva comum precisa carregar evidência de produto recuperável')
assert.ok(['exact-product', 'real-context'].includes(executableReplacement.heroImage.mode), 'reserva comum precisa carregar política visual publicável')
assert.ok(replaced.campaign.reserves.some((reserve) => reserve.productIds.length > 0), 'reposição precisa manter ao menos uma reserva executável')
console.log('Recuperação autônoma de pautas bloqueadas validada com sucesso.')
