import fs from 'node:fs/promises'
import path from 'node:path'
import { CampaignSchema, publicCampaignSummary } from './campaign.js'
import { markdownPublicationErrors } from '../validation/markdown-publication-gates.js'
import { classifyEditorialFailure } from '../validation/editorial-failures.js'
import { releaseAssetUse } from '../images/asset-library.js'

const TRANSIENT = /timeout|timed out|aborted|429|rate limit|temporar|econnreset|fetch failed|insufficient balance|tokens per minute|rate_limit_exceeded|quota(?: exceeded| limit)?|payment required/i
const FINALIZATION = /^Valida(?:ção|cao) final:/i
const NORMALIZABLE_PORTFOLIO_ALIAS = /promo(?:ção|cao) bloqueada[^\n]*TheBiker Shop/i
const NEAR_MISS_LENGTH = /extens(?:ão|ao) insuficiente:\s*(\d+) palavras; m(?:í|i)nimo\s*(\d+)/i
const EXHAUSTED_LEGACY_REPAIR = /Rascunho bloqueado.+\d+ reparos/i
const STRUCTURAL_REPAIR_FAILURE = /Rascunho bloqueado.+\d+ reparos[\s\S]*(?:Description precisa|M[ií]nimo de 2 se[cç][oõ]es|sections\.\d+\.heading)/i
const MISSING_DRAFT = /rascunho indisponível/i
const REJECTED_FULL_ARTICLE = /Rascunho bloqueado|Gates editoriais n[aã]o atendidos/i

const MISCLASSIFIED_RESEARCH_FALLBACK = /fallback interno bloqueado|nenhuma fonte oficial permitida/i
// Retrying a duplicate, unavailable, or undersized visual cannot change the
// outcome. Add alternate real products before finalization is attempted again.
const IMAGE_ALTERNATIVE_REQUIRED = /imagem duplicada|HTTP \d{3}|insuficiente|Galeria oficial sem imagem/i

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
  { id: 'reserva-scale-940-980-comparativo', title: 'Scott Scale 940 e 980: diferenças verificáveis de quadro, suspensão e componentes', summary: 'Comparação limitada às especificações atualmente recuperáveis nas páginas oficiais e no catálogo TheBiker.', category: 'comparativo', productIds: ['bicicleta-scott-scale-940-black', 'bicicleta-scott-scale-980-black'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-scale-940-black' } },
  { id: 'reserva-addict-50-rc20-comparativo', title: 'Scott Addict 50 vs. Addict RC 20: geometria, carbono e montagem', summary: 'Comparação de posição, materiais, transmissão, rodas, pneus, peso e perfil de uso dos dois modelos de estrada.', category: 'comparativo', productIds: ['bicicleta-scott-addict-50-2026-pre-venda-1bxzy', 'bicicleta-scott-addict-rc-20-di2-2026-pre-venda-vzvx9'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-addict-50-2026-pre-venda-1bxzy' } },
  { id: 'reserva-spark-rc-expert-ficha', title: 'Scott Spark RC Expert 2027: suspensão integrada e montagem completa', summary: 'Análise do quadro, dos 120 mm de curso, da transmissão, dos freios, das rodas, dos pneus e do peso declarado.', category: 'review', productIds: ['bicicleta-scott-spark-rc-expert-2027'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-spark-rc-expert-2027' } },
  { id: 'reserva-scale-940-ficha', title: 'Scott Scale 940: quadro, suspensão e transmissão em detalhe', summary: 'Análise da montagem, dos padrões de compatibilidade, dos tamanhos, do peso e do perfil de uso da hardtail.', category: 'review', productIds: ['bicicleta-scott-scale-940-black'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-scale-940-black' } },
  { id: 'reserva-spark-rc-world-cup-ficha', title: 'Scott Spark RC World Cup 2027: quadro, suspensão e componentes', summary: 'Análise da plataforma de cross-country, da transmissão, dos freios, das rodas, dos pneus e do peso declarado.', category: 'review', productIds: ['bicicleta-scott-spark-rc-world-cup-20271'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-spark-rc-world-cup-20271' } },
  // Cache-backed maintenance reserve. The live campaign reserve predates the
  // product-id requirement, so this copy carries executable visual context.
  { id: 'reserva-diagnostico-ruidos-bike', title: 'Diagnostico de ruidos na bicicleta: metodo por carga, frequencia e interface', summary: 'Protocolo tecnico para isolar ruidos de transmissao, cockpit, rodas e quadro sem substituir componentes por tentativa e erro.', category: 'manutencao-ajustes', productIds: ['bicicleta-scott-scale-940-black'], heroImage: { mode: 'real-context', productId: 'bicicleta-scott-scale-940-black', relationship: 'category-example', rationale: 'Fotografia real do catalogo usada somente como contexto visual para o diagnostico tecnico da bicicleta.' } },
  // Product-backed reserves remain publishable when both research providers
  // are rate-limited: the producer can use verified catalog evidence and the
  // official image failover already covered by the visual gate.
  { id: 'reserva-scale-940-checklist-oficial', title: 'Scott Scale 940: quadro, suspensão e montagem completa', summary: 'Análise da transmissão, dos freios, das rodas, dos pneus, dos tamanhos e do peso da configuração.', category: 'review', productIds: ['bicicleta-scott-scale-940-black'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-scale-940-black' } },
  { id: 'reserva-addict-rc-pro-ficha-oficial', title: 'Scott Addict RC Pro: quadro HMX, Dura-Ace Di2 e rodas de 40 mm', summary: 'Análise da montagem 2026, do peso declarado, dos limites do sistema, dos tamanhos e do preço no Brasil.', category: 'review', productIds: ['bicicleta-scott-addict-rc-pro-di2-2026-pre-venda'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-addict-rc-pro-di2-2026-pre-venda' } },
  { id: 'reserva-addict-rc20-ficha-oficial', title: 'Scott Addict RC 20: quadro HMX, 105 Di2 e configuração de estrada', summary: 'Análise da transmissão, das rodas, dos pneus, dos freios, do peso declarado e dos tamanhos disponíveis.', category: 'review', productIds: ['bicicleta-scott-addict-rc-20-di2-2026-pre-venda-vzvx9'], heroImage: { mode: 'exact-product', productId: 'bicicleta-scott-addict-rc-20-di2-2026-pre-venda-vzvx9' } },
]

const AUTONOMOUS_RESERVE_TEMPLATES = [
  { id: 'reserva-autonoma-inspecao-transmissao', title: 'Inspecao documental da transmissao: sinais, limites e sequencia segura', summary: 'Roteiro tecnico de inspecao baseado em fontes rastreaveis, com limites explicitos para evitar diagnostico por tentativa e erro.', category: 'manutencao-ajustes', productIds: ['corrente-sram-nx-eagle'], heroImage: { mode: 'exact-product', productId: 'corrente-sram-nx-eagle' } },
  { id: 'reserva-autonoma-ficha-componentes', title: 'Ficha documental de componentes: como conferir dados antes da manutencao', summary: 'Guia de conferencia de componentes e fontes oficiais antes de afirmar compatibilidade, medida ou procedimento.', category: 'componentes', productIds: ['corrente-sram-nx-eagle'], heroImage: { mode: 'exact-product', productId: 'corrente-sram-nx-eagle' } },
  { id: 'reserva-autonoma-cuidados-pos-uso', title: 'Cuidados documentais depois do uso: limpeza, secagem e inspecao', summary: 'Procedimento de manutencao baseado em orientacao rastreavel, com separacao clara entre fato confirmado e limite de analise.', category: 'manutencao-ajustes', productIds: ['corrente-sram-nx-eagle'], heroImage: { mode: 'exact-product', productId: 'corrente-sram-nx-eagle' } },
]

function ensureReserveFloor(input, minimum = 3) {
  const campaign = structuredClone(input)
  campaign.reserves = Array.isArray(campaign.reserves) ? campaign.reserves : []
  const usedIds = new Set(campaign.items.map((item) => item.id))
  const knownIds = new Set(campaign.reserves.map((reserve) => reserve.id))
  const candidates = [...RECOVERY_RESERVES, ...AUTONOMOUS_RESERVE_TEMPLATES]
  for (const candidate of candidates) {
    if (campaign.reserves.length >= minimum) break
    if (usedIds.has(candidate.id) || knownIds.has(candidate.id)) continue
    campaign.reserves.push(structuredClone(candidate))
    knownIds.add(candidate.id)
  }
  return campaign
}

function localDate(now, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function reserveToItem(reserve, blocked) {
  const visual = realContextPolicy(reserve)
  const productIds = [...new Set(reserve.productIds?.length ? reserve.productIds : visual ? [visual.productId] : [])]
  const heroImage = reserve.heroImage || visual?.heroImage || (productIds[0]
    ? { mode: 'exact-product', productId: productIds[0] }
    : { mode: 'conceptual' })
  return {
    day: blocked.day,
    publishDate: blocked.publishDate,
    id: reserve.id,
    title: reserve.title,
    summary: reserve.summary,
    category: reserve.category,
    freshness: ['review', 'comparativo', 'lancamentos'].includes(reserve.category) ? 'revalidate-24h' : 'evergreen',
    status: 'planned',
    productIds,
    heroImage,
    imageAssetIds: [],
    attempts: 0,
  }
}

function reserveVisualProductIds(reserve) {
  const mapped = realContextPolicy(reserve)
  const visual = reserve.heroImage || mapped?.heroImage || null
  if (visual?.mode === 'exact-product') return [visual.productId]
  if (visual?.mode === 'real-context') return [...new Set([visual.productId, ...(reserve.productIds || [])])]
  return mapped?.productId ? [mapped.productId] : reserve.productIds || []
}

function nextReserve(campaign, blocked, { excludedVisualProductIds = [] } = {}) {
  const used = new Set(campaign.items.map((item) => item.id))
  const excluded = new Set(excludedVisualProductIds)
  const available = [...RECOVERY_RESERVES, ...campaign.reserves].filter((item, index, items) => {
    if (used.has(item.id) || items.findIndex((candidate) => candidate.id === item.id) !== index) return false
    const visualProductIds = reserveVisualProductIds(item)
    return excluded.size === 0 || visualProductIds.some((productId) => !excluded.has(productId))
  })
  // Legacy reserves can omit productIds while still having a safe
  // real-context mapping. Treat that mapping as executable evidence instead
  // of declaring the reserve pool empty.
  return available.find((item) => item.productIds?.length > 0 || realContextPolicy(item)?.productId) || null
}

function appendAlternativeVisualProducts(campaign, item) {
  const current = new Set(item.productIds || [])
  const candidates = [...RECOVERY_RESERVES, ...campaign.reserves]
    .flatMap((reserve) => reserve.productIds?.length
      ? reserve.productIds
      : realContextPolicy(reserve)?.productId
        ? [realContextPolicy(reserve).productId]
        : [])
  const productIds = [...new Set([...current, ...candidates])]
  if (productIds.length === current.size) return false
  item.productIds = productIds
  return true
}

export function recoverBlockedCampaign(campaignInput, {
  now = new Date(),
  maximumTransientAttempts = 2,
  maximumResearchAttempts = 8,
  finalizationDraftErrors = [],
} = {}) {
  const campaign = CampaignSchema.parse(ensureReserveFloor(campaignInput))
  const today = localDate(now, campaign.timezone)
  const blocked = campaign.items.find((item) => item.status === 'blocked' && item.publishDate >= today)
  if (!blocked) return { campaign, result: { status: 'idle' }, exception: null }
  let reason = blocked.blockReason || 'Motivo não informado'
  // Reclassify legacy records written before the fallback rule existed. A
  // stale IMAGE_NOT_PUBLISHABLE code must not suppress research recovery.
  const classified = blocked.failure?.code === 'IMAGE_NOT_PUBLISHABLE' && MISCLASSIFIED_RESEARCH_FALLBACK.test(reason)
    ? classifyEditorialFailure(reason, { stage: blocked.failure.stage || 'recovery', now })
    : blocked.failure || classifyEditorialFailure(reason, { stage: 'recovery', now })
  const visual = realContextPolicy(blocked)
  const permanentVisualFailure = FINALIZATION.test(reason)
    && classified.code === 'IMAGE_NOT_PUBLISHABLE'
    && IMAGE_ALTERNATIVE_REQUIRED.test(reason)
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
  if (FINALIZATION.test(reason)
      && blocked.aiReview?.deterministicFullArticleFallbackUsed
      && (blocked.aiReview.finalScore === null || blocked.aiReview.finalScore === undefined || (blocked.aiReview.finalBlockers || 0) > 0)
      && (blocked.attempts || 0) < maximumTransientAttempts) {
    // A pre-score deterministic draft was valid as content but could not
    // issue a receipt. Rebuild it through the producer so the new objective
    // fallback audit is persisted before finalization is attempted again.
    clearDiscardedDraftState(blocked)
    blocked.status = 'planned'
    delete blocked.blockReason
    delete blocked.failure
    return {
      campaign: CampaignSchema.parse(campaign),
      result: { status: 'retry-deterministic-fallback-review', itemId: blocked.id, attempts: blocked.attempts || 0 },
      exception: null,
    }
  }
  if (permanentVisualFailure
      && blocked.heroImage?.mode === 'real-context'
      && appendAlternativeVisualProducts(campaign, blocked)) {
    blocked.status = 'validation'
    delete blocked.blockReason
    delete blocked.failure
    return {
      campaign: CampaignSchema.parse(campaign),
      result: { status: 'retry-finalization-alternative-visual', itemId: blocked.id, productIds: blocked.productIds },
      exception: null,
    }
  }
  if (FINALIZATION.test(reason) && !permanentVisualFailure && blocked.postPath && finalizationDraftErrors.length === 0) {
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
  const exhaustedVisualProducts = permanentVisualFailure
    ? blocked.heroImage?.mode === 'exact-product'
      ? [blocked.heroImage.productId]
      : blocked.productIds || []
    : []
  const reserve = nextReserve(campaign, blocked, { excludedVisualProductIds: exhaustedVisualProducts })
  if (!reserve) return { campaign, result: { status: 'blocked', itemId: blocked.id, reason: 'Nenhuma pauta-reserva disponível' }, exception: null }
  const exception = { recordedAt: now.toISOString(), campaignId: campaign.id, replacedItem: blocked, replacement: { id: reserve.id, title: reserve.title }, reason }
  campaign.items[blocked.day - 1] = reserveToItem(reserve, blocked)
  campaign.reserves = campaign.reserves.filter((item) => item.id !== reserve.id)
  const replenished = ensureReserveFloor(campaign, 5)
  campaign.reserves = replenished.reserves
  return { campaign: CampaignSchema.parse(campaign), result: { status: 'replaced', itemId: blocked.id, replacementId: reserve.id, publishDate: blocked.publishDate }, exception }
}

export async function recoverBlockedCampaignFiles({ root, now = new Date(), maximumResearchAttempts = 8 } = {}) {
  const campaignPath = path.join(root, 'bot/editorial-campaign.json')
  const campaign = JSON.parse(await fs.readFile(campaignPath, 'utf8'))
  const normalizedCampaign = ensureReserveFloor(campaign)
  const reserveFloorChanged = normalizedCampaign.reserves.length !== (campaign.reserves || []).length
  const parsedCampaign = CampaignSchema.parse(normalizedCampaign)
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
  if (recovered.result.status === 'idle' || recovered.result.status === 'blocked') {
    if (reserveFloorChanged) {
      await fs.writeFile(campaignPath, JSON.stringify(recovered.campaign, null, 2) + '\n')
      await fs.writeFile(path.join(root, '_data/editorial-calendar.json'), JSON.stringify(publicCampaignSummary(recovered.campaign), null, 2) + '\n')
    }
    return recovered.result
  }
  await fs.writeFile(campaignPath, JSON.stringify(recovered.campaign, null, 2) + '\n')
  await fs.writeFile(path.join(root, '_data/editorial-calendar.json'), JSON.stringify(publicCampaignSummary(recovered.campaign), null, 2) + '\n')
  if (recovered.exception) {
    const ledgerPath = path.join(root, 'bot/operational-state/editorial-exceptions.json')
    const ledger = await fs.readFile(ledgerPath, 'utf8').then(JSON.parse).catch((error) => error?.code === 'ENOENT' ? { schemaVersion: 1, items: [] } : Promise.reject(error))
    ledger.items.push(recovered.exception)
    await fs.writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n')
  }
  if (recovered.result.status === 'replaced' && blocked?.postPath) {
    const draftsRoot = path.resolve(root, '_posts/drafts') + path.sep
    const draftPath = path.resolve(root, blocked.postPath)
    if (draftPath.startsWith(draftsRoot)) {
      await fs.rm(draftPath, { force: true })
      await fs.rm(path.join(root, 'content/research/campaign', `${blocked.id}.json`), { force: true })
      await fs.rm(path.join(root, 'assets/img/posts', blocked.id), { recursive: true, force: true })
      await releaseAssetUse(root, { postId: blocked.id, position: 'hero' })
    }
  }
  return recovered.result
}
