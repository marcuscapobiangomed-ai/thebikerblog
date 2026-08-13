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
const REJECTED_FULL_ARTICLE = /Rascunho bloqueado|Gates editoriais n[aã]o atendidos/i

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
  { id: 'reserva-limpeza-transmissao-metodo', title: 'Limpeza da transmissão depois de chuva e lama: método, inspeção e lubrificação', summary: 'Procedimento técnico baseado em orientações oficiais para remover contaminantes, verificar danos e devolver a corrente ao uso seguro.', category: 'manutencao-ajustes', productIds: ['corrente-sram-nx-eagle'] },
  { id: 'reserva-radar-profissional-oficial', title: 'Radar profissional: próxima prova com calendário e resultados oficialmente verificáveis', summary: 'Reserva de cobertura profissional que só avança depois de ser vinculada a um evento e a fontes oficiais revalidadas.', category: 'competicoes', race: { track: 'professional-coverage', format: 'weekly-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'reserva-calendario-participativo-oficial', title: 'Calendário brasileiro de provas: atualização com inscrições e mudanças verificadas', summary: 'Reserva participativa que permanece pendente até receber eventos oficiais, situação de inscrição e checagem recente das fontes.', category: 'competicoes', race: { track: 'participant-calendar', format: 'calendar-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'reserva-scale-940-980-comparativo', title: 'Scott Scale 940 e 980: diferenças verificáveis de quadro, suspensão e componentes', summary: 'Comparação limitada às especificações atualmente recuperáveis nas páginas oficiais e no catálogo TheBiker.', category: 'comparativo', productIds: ['bicicleta-scott-scale-940-black', 'bicicleta-scott-scale-980-black'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-scale-940-black' } },
  { id: 'reserva-addict-50-rc20-comparativo', title: 'Scott Addict 50 e Addict RC 20: duas propostas de estrada confrontadas pelas fichas oficiais', summary: 'Análise comparativa restrita a geometria, materiais e montagens comprovados nas fontes atuais dos dois modelos.', category: 'comparativo', productIds: ['bicicleta-scott-addict-50-2026-pre-venda-1bxzy', 'bicicleta-scott-addict-rc-20-di2-2026-pre-venda-vzvx9'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-addict-50-2026-pre-venda-1bxzy' } },
  { id: 'reserva-spark-rc-expert-ficha', title: 'Scott Spark RC Expert 2027: leitura técnica da montagem confirmada pelas fontes atuais', summary: 'Ficha editorial do modelo limitada aos materiais, suspensão, transmissão e limites explicitamente recuperados das fontes.', category: 'review', productIds: ['bicicleta-scott-spark-rc-expert-2027'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-spark-rc-expert-2027' } },
  { id: 'reserva-scale-940-ficha', title: 'Scott Scale 940: o que a ficha atual confirma sobre quadro, suspensão e transmissão', summary: 'Leitura de produto sem extrapolações, baseada somente nos campos que continuam presentes nas páginas recuperadas.', category: 'review', productIds: ['bicicleta-scott-scale-940-black'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-scale-940-black' } },
  { id: 'reserva-spark-rc-world-cup-ficha', title: 'Scott Spark RC World Cup 2027: especificações confirmadas e limites da análise documental', summary: 'Revisão documental que publica apenas características localizadas literalmente nas fontes oficiais recuperadas no dia.', category: 'review', productIds: ['bicicleta-scott-spark-rc-world-cup-20271'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-spark-rc-world-cup-20271' } },
]

function localDate(now, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function reserveToItem(reserve, blocked) {
  const visual = realContextPolicy(reserve)
  const productIds = [...new Set(reserve.productIds?.length ? reserve.productIds : visual ? [visual.productId] : [])]
  const heroImage = reserve.heroImage || visual?.heroImage || { mode: 'conceptual' }
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
    productIds,
    heroImage,
    imageAssetIds: [],
    attempts: 0,
  }
}

function nextReserve(campaign, blocked) {
  const used = new Set(campaign.items.map((item) => item.id))
  const available = [...campaign.reserves, ...RECOVERY_RESERVES].filter((item, index, items) => !used.has(item.id) && items.findIndex((candidate) => candidate.id === item.id) === index)
  if (blocked.race) return available.find((item) => item.race?.track === blocked.race.track) || null
  return available.find((item) => item.category !== 'competicoes' && item.productIds?.length > 0) || null
}

export function recoverBlockedCampaign(campaignInput, {
  now = new Date(),
  maximumTransientAttempts = 2,
  maximumResearchAttempts = 8,
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
  if (classified.code === 'RESEARCH_INSUFFICIENT' && !REJECTED_FULL_ARTICLE.test(reason) && (blocked.attempts || 0) < maximumResearchAttempts) {
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
    if (!campaign.items.some((item) => item.id === fallback.id) && !campaign.reserves.some((item) => item.id === fallback.id)) campaign.reserves.push(fallback)
    if (campaign.reserves.length >= 5) break
  }
  return { campaign: CampaignSchema.parse(campaign), result: { status: 'replaced', itemId: blocked.id, replacementId: reserve.id, publishDate: blocked.publishDate }, exception }
}

export async function recoverBlockedCampaignFiles({ root, now = new Date(), maximumResearchAttempts = 8 } = {}) {
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
  const recovered = recoverBlockedCampaign(parsedCampaign, { now, finalizationDraftErrors, maximumResearchAttempts })
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
