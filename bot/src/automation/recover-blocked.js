import fs from 'node:fs/promises'
import path from 'node:path'
import { CampaignSchema, publicCampaignSummary } from './campaign.js'
import { markdownPublicationErrors } from '../validation/markdown-publication-gates.js'
import { classifyEditorialFailure } from '../validation/editorial-failures.js'

const TRANSIENT = /timeout|timed out|aborted|429|rate limit|temporar|econnreset|fetch failed/i
const FINALIZATION = /^Valida(?:ção|cao) final:/i
const NORMALIZABLE_PORTFOLIO_ALIAS = /promo(?:ção|cao) bloqueada[^\n]*TheBiker Shop/i
const NEAR_MISS_LENGTH = /extens(?:ão|ao) insuficiente:\s*(\d+) palavras; m(?:í|i)nimo\s*(\d+)/i
const EXHAUSTED_LEGACY_REPAIR = /Rascunho bloqueado.+\d+ reparos/i
const STRUCTURAL_REPAIR_FAILURE = /Rascunho bloqueado.+\d+ reparos[\s\S]*(?:Description precisa|M[ií]nimo de 2 se[cç][oõ]es|sections\.\d+\.heading)/i
const MISSING_DRAFT = /rascunho indisponível/i

const REAL_CONTEXT_BY_RESERVE_ID = Object.freeze({
  'reserva-diagnostico-ruidos-bike': 'bicicleta-scott-scale-940-black',
  'reserva-pressao-pneus-terreno': 'pneu-schwalbe-racing-ray-29-x-2-25-super-race-tlr-addix',
  'reserva-inspecao-pos-chuva': 'corrente-sram-nx-eagle',
  'reserva-cabos-mangueiras-roteamento': 'bicicleta-scott-scale-940-black',
  'reserva-limpeza-transmissao-metodo': 'corrente-sram-nx-eagle',
})

function realContextPolicy(item) {
  const productId = REAL_CONTEXT_BY_RESERVE_ID[item.id]
  if (!productId) return null
  return {
    productId,
    heroImage: {
      mode: 'real-context',
      productId,
      relationship: 'category-example',
      rationale: 'Fotografia real do catálogo TheBiker usada apenas como exemplo visual da categoria técnica abordada.',
    },
  }
}

function clearDiscardedDraftState(item) {
  delete item.postPath
  delete item.aiReview
  delete item.editorialReceipt
  delete item.visualDecision
  delete item.imageManifestPath
  delete item.imageStatus
  delete item.imageValidatedAt
  item.imageAssetIds = []
}

const RECOVERY_RESERVES = [
  { id: 'reserva-radar-profissional-oficial', title: 'Radar profissional: próxima prova com calendário e resultados oficialmente verificáveis', summary: 'Reserva de cobertura profissional que só avança depois de ser vinculada a um evento e a fontes oficiais revalidadas.', category: 'competicoes', race: { track: 'professional-coverage', format: 'weekly-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'reserva-calendario-participativo-oficial', title: 'Calendário brasileiro de provas: atualização com inscrições e mudanças verificadas', summary: 'Reserva participativa que permanece pendente até receber eventos oficiais, situação de inscrição e checagem recente das fontes.', category: 'competicoes', race: { track: 'participant-calendar', format: 'calendar-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'reserva-diagnostico-ruidos-bike', title: 'Diagnóstico de ruídos na bicicleta: método por carga, frequência e interface', summary: 'Protocolo técnico para isolar ruídos de transmissão, cockpit, rodas e quadro sem substituir componentes por tentativa e erro.', category: 'manutencao-ajustes' },
  { id: 'reserva-pressao-pneus-terreno', title: 'Pressão de pneus por terreno: como testar sem transformar sensação em dado', summary: 'Método de campo para ajustar pressão, registrar comportamento e separar aderência, suporte lateral, impacto e resistência ao rolamento.', category: 'engenharia' },
  { id: 'reserva-inspecao-pos-chuva', title: 'Inspeção pós-chuva: os pontos que concentram contaminação, corrosão e desgaste', summary: 'Rotina técnica depois de treinos molhados, priorizando rolamentos, transmissão, freios, suspensão e interfaces do quadro.', category: 'manutencao-ajustes' },
  { id: 'reserva-cabos-mangueiras-roteamento', title: 'Cabos e mangueiras: roteamento, atrito e sinais de montagem que pedem correção', summary: 'Leitura técnica de curvas, fixações, contato com o quadro e interferências que alteram comando, ruído e durabilidade.', category: 'componentes' },
  { id: 'reserva-limpeza-transmissao-metodo', title: 'Limpeza de transmissão: como remover contaminantes sem deslocar o problema', summary: 'Sequência de limpeza, inspeção e relubrificação que considera corrente, cassete, coroas, roldanas e compatibilidade química.', category: 'manutencao-ajustes' },
]

function localDate(now, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function reserveToItem(reserve, blocked) {
  const visual = realContextPolicy(reserve)
  return {
    day: blocked.day,
    publishDate: blocked.publishDate,
    id: reserve.id,
    title: reserve.title,
    summary: reserve.summary,
    category: reserve.category,
    ...(reserve.race ? { race: structuredClone(reserve.race) } : {}),
    freshness: reserve.category === 'competicoes' ? 'event-driven' : ['review', 'comparativo', 'lancamentos'].includes(reserve.category) ? 'revalidate-24h' : 'evergreen',
    status: 'planned',
    productIds: visual ? [visual.productId] : [],
    ...(visual ? { heroImage: visual.heroImage } : {}),
    imageAssetIds: [],
    attempts: 0,
  }
}

function nextReserve(campaign, blocked) {
  const used = new Set(campaign.items.map((item) => item.id))
  const available = [...campaign.reserves, ...RECOVERY_RESERVES].filter((item, index, items) => !used.has(item.id) && items.findIndex((candidate) => candidate.id === item.id) === index)
  if (blocked.race) return available.find((item) => item.race?.track === blocked.race.track) || null
  return available.find((item) => item.category !== 'competicoes') || null
}

export function recoverBlockedCampaign(campaignInput, {
  now = new Date(),
  maximumTransientAttempts = 2,
  finalizationDraftErrors = [],
} = {}) {
  const campaign = CampaignSchema.parse(structuredClone(campaignInput))
  const today = localDate(now, campaign.timezone)
  const blocked = campaign.items.find((item) => item.status === 'blocked' && item.publishDate >= today)
  if (!blocked) return { campaign, result: { status: 'idle' }, exception: null }
  let reason = blocked.blockReason || 'Motivo não informado'
  const classified = blocked.failure || classifyEditorialFailure(reason, { stage: 'recovery', now })
  const visual = realContextPolicy(blocked)
  if (FINALIZATION.test(reason)
      && classified.code === 'IMAGE_NOT_PUBLISHABLE'
      && blocked.heroImage?.mode === 'conceptual'
      && blocked.postPath
      && finalizationDraftErrors.length === 0
      && visual) {
    blocked.productIds = [visual.productId]
    blocked.heroImage = visual.heroImage
    blocked.status = 'validation'
    delete blocked.blockReason
    delete blocked.failure
    return {
      campaign: CampaignSchema.parse(campaign),
      result: { status: 'repair-finalization-visual', itemId: blocked.id, productId: visual.productId },
      exception: null,
    }
  }
  if (FINALIZATION.test(reason)
      && classified.code === 'IMAGE_NOT_PUBLISHABLE'
      && blocked.heroImage?.mode === 'conceptual'
      && finalizationDraftErrors.some((message) => MISSING_DRAFT.test(message))
      && (blocked.attempts || 0) < 2) {
    clearDiscardedDraftState(blocked)
    blocked.status = 'planned'
    delete blocked.blockReason
    delete blocked.failure
    return {
      campaign: CampaignSchema.parse(campaign),
      result: { status: 'retry-production-with-semantic-visual', itemId: blocked.id, attempts: blocked.attempts || 0 },
      exception: null,
    }
  }
  if (FINALIZATION.test(reason) && blocked.postPath && finalizationDraftErrors.length === 0) {
    blocked.status = 'validation'
    delete blocked.blockReason
    delete blocked.failure
    return {
      campaign: CampaignSchema.parse(campaign),
      result: { status: 'retry-finalization', itemId: blocked.id, attempts: blocked.attempts || 0 },
      exception: null,
    }
  }
  if (FINALIZATION.test(reason) && finalizationDraftErrors.length > 0) {
    reason = `${reason}; rascunho ainda reprovado: ${finalizationDraftErrors.join('; ')}`
  }
  if (NORMALIZABLE_PORTFOLIO_ALIAS.test(reason)) {
    blocked.status = 'planned'
    delete blocked.blockReason
    delete blocked.failure
    return { campaign: CampaignSchema.parse(campaign), result: { status: 'retry-policy-normalization', itemId: blocked.id, attempts: blocked.attempts || 0 }, exception: null }
  }
  if (classified.code === 'RESEARCH_INSUFFICIENT' && (blocked.attempts || 0) < 7) {
    clearDiscardedDraftState(blocked)
    blocked.status = 'planned'
    delete blocked.blockReason
    delete blocked.failure
    return { campaign: CampaignSchema.parse(campaign), result: { status: 'retry-research-grounding', itemId: blocked.id, attempts: blocked.attempts || 0 }, exception: null }
  }
  const lengthMatch = reason.match(NEAR_MISS_LENGTH)
  const legacyRepairFailure = EXHAUSTED_LEGACY_REPAIR.test(reason)
  if (STRUCTURAL_REPAIR_FAILURE.test(reason) && (blocked.attempts || 0) < 5) {
    clearDiscardedDraftState(blocked)
    blocked.status = 'planned'
    delete blocked.blockReason
    delete blocked.failure
    return { campaign: CampaignSchema.parse(campaign), result: { status: 'retry-editorial-structure', itemId: blocked.id, attempts: blocked.attempts || 0 }, exception: null }
  }
  const lengthRetryRatio = legacyRepairFailure ? 0.8 : 0.9
  const lengthRetryCap = legacyRepairFailure ? 4 : 3
  if (lengthMatch && Number(lengthMatch[1]) / Number(lengthMatch[2]) >= lengthRetryRatio && (blocked.attempts || 0) < lengthRetryCap) {
    blocked.status = 'planned'
    delete blocked.blockReason
    delete blocked.failure
    return { campaign: CampaignSchema.parse(campaign), result: { status: 'retry-editorial-expansion', itemId: blocked.id, attempts: blocked.attempts || 0 }, exception: null }
  }
  if (finalizationDraftErrors.length === 0 && (classified.retryable || TRANSIENT.test(reason)) && (blocked.attempts || 0) < maximumTransientAttempts) {
    blocked.status = 'planned'
    delete blocked.blockReason
    delete blocked.failure
    return { campaign: CampaignSchema.parse(campaign), result: { status: 'retry', itemId: blocked.id, attempts: blocked.attempts || 0 }, exception: null }
  }
  const reserve = nextReserve(campaign, blocked)
  if (!reserve) return { campaign, result: { status: 'blocked', itemId: blocked.id, reason: 'Nenhuma pauta-reserva disponível' }, exception: null }
  const exception = { recordedAt: now.toISOString(), campaignId: campaign.id, replacedItem: blocked, replacement: { id: reserve.id, title: reserve.title }, reason }
  campaign.items[blocked.day - 1] = reserveToItem(reserve, blocked)
  campaign.reserves = campaign.reserves.filter((item) => item.id !== reserve.id)
  for (const fallback of RECOVERY_RESERVES) {
    if (campaign.reserves.length >= 3 && campaign.reserves.some((item) => item.id === fallback.id)) continue
    if (!campaign.items.some((item) => item.id === fallback.id) && !campaign.reserves.some((item) => item.id === fallback.id)) campaign.reserves.push(fallback)
    if (campaign.reserves.length >= 5) break
  }
  return { campaign: CampaignSchema.parse(campaign), result: { status: 'replaced', itemId: blocked.id, replacementId: reserve.id, publishDate: blocked.publishDate }, exception }
}

export async function recoverBlockedCampaignFiles({ root, now = new Date() } = {}) {
  const campaignPath = path.join(root, 'bot/editorial-campaign.json')
  const campaign = JSON.parse(await fs.readFile(campaignPath, 'utf8'))
  const parsedCampaign = CampaignSchema.parse(campaign)
  const today = localDate(now, parsedCampaign.timezone)
  const blocked = parsedCampaign.items.find((item) => item.status === 'blocked' && item.publishDate >= today)
  let finalizationDraftErrors = []
  if (blocked?.postPath && FINALIZATION.test(blocked.blockReason || '')) {
    const draftsRoot = path.resolve(root, '_posts/drafts')
    const draftPath = path.resolve(root, blocked.postPath)
    const relativeDraftPath = path.relative(draftsRoot, draftPath)
    if (!relativeDraftPath || relativeDraftPath.startsWith('..') || path.isAbsolute(relativeDraftPath)) {
      finalizationDraftErrors = ['postPath precisa apontar para _posts/drafts']
    } else {
      try {
        const content = await fs.readFile(draftPath, 'utf8')
        finalizationDraftErrors = markdownPublicationErrors(content)
      } catch (error) {
        finalizationDraftErrors = [`rascunho indisponível (${error.code || error.message})`]
      }
    }
  }
  const recovered = recoverBlockedCampaign(parsedCampaign, { now, finalizationDraftErrors })
  if (recovered.result.status === 'idle' || recovered.result.status === 'blocked') return recovered.result
  await fs.writeFile(campaignPath, JSON.stringify(recovered.campaign, null, 2) + '\n')
  await fs.writeFile(path.join(root, '_data/editorial-calendar.json'), JSON.stringify(publicCampaignSummary(recovered.campaign), null, 2) + '\n')
  if (recovered.exception) {
    const ledgerPath = path.join(root, 'bot/operational-state/editorial-exceptions.json')
    const ledger = await fs.readFile(ledgerPath, 'utf8').then(JSON.parse).catch((error) => error?.code === 'ENOENT' ? { schemaVersion: 1, items: [] } : Promise.reject(error))
    ledger.items.push(recovered.exception)
    await fs.writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n')
  }
  return recovered.result
}
