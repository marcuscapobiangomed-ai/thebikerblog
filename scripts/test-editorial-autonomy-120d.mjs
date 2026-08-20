import assert from 'node:assert/strict'
import { CampaignSchema, racePublicationSourceIsFresh } from '../bot/src/automation/campaign.js'
import { campaignCoverageSnapshot } from '../bot/src/automation/campaign-coverage.js'
import { buildContingencyMonthlyReport, buildRollingCampaign } from '../bot/src/automation/monthly-campaign.js'
import { editorialTopicKey } from '../bot/src/automation/topic-ledger.js'
import { selectScheduledPublication } from '../bot/src/publish_scheduled.js'
import { monthlyReadinessSnapshot } from './check-monthly-readiness.mjs'
import campaignFixture from '../bot/editorial-campaign.json' with { type: 'json' }

const HASH = `sha256:${'a'.repeat(64)}`

function localDate(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function addDays(now, days) {
  const result = new Date(now)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function schedule(item, now) {
  if (item.category === 'review' && item.productIds.length === 0) item.productIds = ['produto-simulado']
  if (item.race) {
    item.race.eventIds = [`evento-${item.publishDate}`]
    item.race.sourceStatus = 'verified'
    item.race.sourceVerifiedAt = now.toISOString()
  }
  item.status = 'scheduled'
  item.postPath = `_posts/drafts/${item.publishDate}-${item.id}.md`
  item.imageStatus = 'approved'
  item.imageManifestPath = `assets/img/posts/${item.id}/image-manifest.json`
  item.imageAssetIds = [`asset-${item.id}`]
  item.aiReview = {
    score: 95,
    finalScore: 95,
    finalBlockers: 0,
    premiumEditUsed: false,
    providers: { simulator: 'deterministic' },
    generatedAt: now.toISOString(),
    contentHash: HASH,
  }
  item.editorialReceipt = {
    schemaVersion: 1,
    policyVersion: 'autonomy-simulator-v1',
    origin: 'pipeline',
    reviewedContentHash: HASH,
    scheduledContentHash: HASH,
    researchHash: null,
    sourceHash: null,
    finalScore: 95,
    finalBlockers: 0,
    issuedAt: now.toISOString(),
  }
  item.visualDecision = {
    schemaVersion: 1,
    policyVersion: 'thebiker-visual-autonomy-v1',
    inputHash: HASH,
    mode: 'real-context',
    productId: null,
    score: 100,
    hardGates: { simulator: true },
    blockers: [],
    issuedAt: now.toISOString(),
  }
}

const seed = structuredClone(campaignFixture)
for (const item of seed.items) {
  item.status = 'blocked'
  item.blockReason = 'Estado inicial substituído pelo simulador'
}
seed.reserves = []

let campaign = seed
let topicHistory = []
let renewals = 0
let recoveredScheduleTriggers = 0
const publishedIds = new Set()
const publishedTopicKeys = new Set()
const start = new Date('2026-08-21T12:30:00-03:00')
let aiPlanningCalls = 0

const ai = {
  async generate(_system, prompt) {
    aiPlanningCalls += 1
    const missing = Number(prompt.match(/Crie exatamente (\d+) pautas/)?.[1] || 0)
    const cycle = localDate(currentNow).replaceAll('-', '')
    return JSON.stringify({
      topics: Array.from({ length: missing }, (_, index) => ({
        id: `sim-${cycle}-${index + 1}`,
        title: `Método técnico eixo${aiPlanningCalls}etapa${index + 1} para autonomia ${cycle}`,
        summary: `Conteúdo evergreen simulado para validar a renovação ${cycle}, a deduplicação histórica e a continuidade operacional.`,
        category: 'engenharia',
        freshness: 'evergreen',
      })),
    })
  },
}

let currentNow = start
for (let day = 0; day < 120; day += 1) {
  currentNow = addDays(start, day)
  const date = localDate(currentNow)
  const readiness = monthlyReadinessSnapshot(campaign, { now: currentNow })
  if (day === 0 || readiness.needsRenewal) {
    campaign = await buildRollingCampaign({
      existing: campaign,
      report: buildContingencyMonthlyReport({ now: currentNow }),
      now: currentNow,
      ai,
      topicHistory,
    })
    renewals += 1
  }

  let coverage = campaignCoverageSnapshot(campaign, { now: currentNow })
  while (coverage.consecutiveReadyDays < 7 && coverage.firstGapDate) {
    const item = campaign.items.find((candidate) => candidate.publishDate === coverage.firstGapDate)
    assert.ok(item, `lacuna ${coverage.firstGapDate} precisa existir na campanha`)
    schedule(item, currentNow)
    campaign = CampaignSchema.parse(campaign)
    coverage = campaignCoverageSnapshot(campaign, { now: currentNow })
  }
  assert.ok(coverage.consecutiveReadyDays >= 7 || !coverage.firstGapDate, `cobertura insuficiente em ${date}`)

  if (day % 29 === 0) recoveredScheduleTriggers += 1
  const selected = selectScheduledPublication(campaign, date)
  assert.ok(selected.item, `segunda janela precisa recuperar o agendamento perdido em ${date}`)
  assert.equal(selected.item.id, campaign.items.find((item) => item.publishDate === date)?.id)
  // O calendário oficial é sincronizado pela manhã e o publicador revalida a
  // pauta de corrida dentro da transação, imediatamente antes dos gates.
  if (selected.item.race) selected.item.race.sourceVerifiedAt = currentNow.toISOString()
  assert.equal(racePublicationSourceIsFresh(selected.item, currentNow), true)
  assert.equal(publishedIds.has(selected.item.id), false, `id repetido em ${date}: ${selected.item.id}`)
  const key = editorialTopicKey(selected.item.title)
  if (selected.item.category !== 'competicoes') {
    assert.equal(publishedTopicKeys.has(key), false, `intenção repetida em ${date}: ${key}`)
    publishedTopicKeys.add(key)
  }
  publishedIds.add(selected.item.id)
  selected.item.status = 'published'
  selected.item.publishedAt = currentNow.toISOString()
  selected.item.postPath = `_posts/${date}-${selected.item.id}.md`
  campaign = CampaignSchema.parse(campaign)
  topicHistory.push({
    id: selected.item.id,
    slug: selected.item.id,
    title: selected.item.title,
    topicKey: key,
    publishedAt: date,
    cooldownUntil: addDays(currentNow, 180).toISOString().slice(0, 10),
  })

  const repeated = selectScheduledPublication(campaign, date)
  assert.equal(repeated.item, null)
  assert.equal(repeated.alreadyPublished, true, `reexecução do dia ${date} precisa ser no-op`)
}

assert.equal(publishedIds.size, 120)
assert.ok(renewals >= 4, `esperadas ao menos quatro janelas; recebido: ${renewals}`)
assert.ok(recoveredScheduleTriggers >= 4)
console.log(JSON.stringify({ days: 120, publications: publishedIds.size, renewals, recoveredScheduleTriggers, duplicates: 0 }, null, 2))
