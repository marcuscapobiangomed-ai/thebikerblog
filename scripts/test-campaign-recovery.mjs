import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import campaignFixture from '../bot/editorial-campaign.json' with { type: 'json' }
import { recoverBlockedCampaign, recoverBlockedCampaignFiles } from '../bot/src/automation/recover-blocked.js'

const transient = structuredClone(campaignFixture)
for (const item of transient.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason }
const timeout = transient.items.find((item) => item.status === 'planned')
assert.ok(timeout, 'A campanha precisa ter ao menos uma pauta planejada para o teste transitório')
timeout.status = 'blocked'
timeout.attempts = 1
timeout.blockReason = 'The operation was aborted due to timeout'
const retried = recoverBlockedCampaign(transient, { now: new Date('2026-08-07T12:00:00Z') })
assert.equal(retried.result.status, 'retry')
assert.equal(retried.campaign.items.find((item) => item.id === timeout.id).status, 'planned')

const finalization = structuredClone(campaignFixture)
for (const item of finalization.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason }
const finalizable = finalization.items.find((item) => item.status === 'scheduled' && item.postPath && item.aiReview && item.publishDate >= '2026-08-07')
assert.ok(finalizable, 'A campanha precisa ter uma pauta produzida para testar retomada de finalização')
finalizable.status = 'blocked'
finalizable.blockReason = 'Validação final: imagem oficial ainda sem variante publicável'
const resumed = recoverBlockedCampaign(finalization, { now: new Date('2026-08-07T12:00:00Z') })
assert.equal(resumed.result.status, 'retry-finalization')
assert.equal(resumed.campaign.items.find((item) => item.id === finalizable.id).status, 'validation')

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

const invalidFinalization = structuredClone(finalization)
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

const permanent = structuredClone(campaignFixture)
for (const item of permanent.items) if (item.status === 'blocked') { item.status = 'planned'; delete item.blockReason }
const unsupported = permanent.items.find((item) => item.status === 'planned')
assert.ok(unsupported, 'A campanha precisa ter ao menos uma pauta planejada para o teste permanente')
unsupported.status = 'blocked'
unsupported.blockReason = 'Pesquisa bloqueada: nenhuma fonte oficial permitida foi retornada'
const replaced = recoverBlockedCampaign(permanent, { now: new Date('2026-08-07T12:00:00Z') })
assert.equal(replaced.result.status, 'replaced')
assert.equal(replaced.campaign.items[unsupported.day - 1].publishDate, unsupported.publishDate)
assert.notEqual(replaced.campaign.items[unsupported.day - 1].id, unsupported.id)
assert.ok(replaced.exception)
assert.ok(replaced.campaign.reserves.length >= 3)
console.log('Recuperação autônoma de pautas bloqueadas validada com sucesso.')
