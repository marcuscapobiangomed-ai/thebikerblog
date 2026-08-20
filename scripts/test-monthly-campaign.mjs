import assert from 'node:assert/strict'
import { buildContingencyMonthlyReport, buildRollingCampaign, intelligenceSourceDigest, parseIntelligenceMarkdown, validateMonthlyCampaignPlan } from '../bot/src/automation/monthly-campaign.js'
import { monthlyReadinessSnapshot } from './check-monthly-readiness.mjs'
import campaignFixture from '../bot/editorial-campaign.json' with { type: 'json' }

const report = {
  schemaVersion: 1,
  runKey: 'monthly-2026-08-07',
  cadence: 'monthly',
  generatedAt: '2026-08-07T10:10:00.000Z',
  briefs: Array.from({ length: 12 }, (_, index) => `método técnico de ciclismo ${'x'.repeat(index + 4)}`).map((topic, index) => ({
    id: `seo-topic-${index + 1}`,
    action: 'new-content',
    topic: `Técnica avançada de ${topic}`,
    angle: `Explicar o problema técnico número ${index + 1} com método, fontes primárias, limitações e aplicação prática para ciclistas experientes.`,
    source: index % 2 ? 'youtube' : 'search-console',
  })),
  refreshQueue: [{ title: 'Artigo antigo', url: 'https://example.com/antigo/', ageDays: 200 }],
  discoverySignals: [],
  queryClusters: [{ cluster: 'suspensao', queries: 1, impressions: 120 }],
  brazilRankings: {
    youtubeDiscovery: [{ rank: 1, signalTitle: 'Sinal MTB Brasil', topic: 'Suspensão MTB', score: 98 }],
    seoMeasured: [{ rank: 1, term: 'ajuste suspensão mtb', opportunityScore: 92 }],
  },
}
const ai = {
  async generate(_system, prompt) {
    const missing = Number(prompt.match(/Crie exatamente (\d+) pautas/)?.[1] || 0)
    return JSON.stringify({
      topics: Array.from({ length: missing }, (_, index) => ({
        id: `ai-topic-${index + 1}`,
        title: `Planejamento técnico complementar ${'z'.repeat(index + 4)}`,
        summary: `Pauta técnica complementar ${index + 1} com método verificável, fontes primárias e aplicação para ciclistas experientes.`,
        category: 'engenharia',
        freshness: 'evergreen',
      })),
    })
  },
}

const markdown = `<details><summary>Payload</summary>\n\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\`\n</details>`
assert.equal(parseIntelligenceMarkdown(markdown).runKey, report.runKey)
assert.equal(intelligenceSourceDigest(report), intelligenceSourceDigest(structuredClone(report)))
assert.notEqual(intelligenceSourceDigest(report), intelligenceSourceDigest({ ...report, generatedAt: '2026-08-07T10:11:00.000Z' }))

const activeToday = structuredClone(campaignFixture)
const scheduledIndex = activeToday.items.findLastIndex((item) => item.status === 'published')
assert.ok(scheduledIndex >= 0 && scheduledIndex + 1 < activeToday.items.length, 'fixture precisa de um item publicado seguido por outro item')
activeToday.items[scheduledIndex].status = 'scheduled'
delete activeToday.items[scheduledIndex].publishedAt
const fixtureStart = activeToday.items[scheduledIndex].publishDate
const fixtureNextDay = activeToday.items[scheduledIndex + 1].publishDate
const blockedTomorrow = activeToday.items.find((item) => item.publishDate === fixtureNextDay)
blockedTomorrow.status = 'blocked'
blockedTomorrow.blockReason = 'Falha permanente usada pelo teste de renovação'
const scheduledFixtureId = activeToday.items.find((item) => item.publishDate === fixtureStart).id
const plannedFixtureId = activeToday.items.find((item) => item.publishDate === fixtureNextDay).id
const staleReserveId = activeToday.reserves[0].id
const renewed = await buildRollingCampaign({ existing: activeToday, report, now: new Date(`${fixtureStart}T12:00:00-03:00`), ai })
assert.equal(renewed.items.length, 30)
assert.equal(renewed.startsOn, fixtureStart)
assert.deepEqual(renewed.items.map((item) => item.day), Array.from({ length: 30 }, (_, index) => index + 1))
assert.equal(new Set(renewed.items.map((item) => item.publishDate)).size, 30)
assert.equal(renewed.items.some((item) => item.status === 'blocked'), false)
assert.ok(renewed.items.some((item) => item.id === scheduledFixtureId), 'conteúdo já agendado deve ser preservado')
assert.equal(renewed.items.some((item) => item.id === plannedFixtureId), false, 'pauta ainda planejada deve ser substituída pela inteligência atual')
assert.equal(renewed.items.some((item) => item.id === staleReserveId), false, 'reserva do ciclo anterior não deve contaminar o novo mês')
assert.equal(renewed.reserves.some((item) => item.id === staleReserveId), false, 'buffer renovado deve vir apenas da inteligência atual')
assert.ok(renewed.items.some((item) => item.id === 'seo-topic-1'), 'inteligência nova deve preencher lacunas')
assert.ok(renewed.reserves.length >= 3)
assert.equal(renewed.items.filter((item) => item.race).length, 8, 'campanha deve reservar oito pautas estruturadas para corridas')
assert.equal(renewed.items.filter((item) => item.race?.track === 'professional-coverage').length, 4)
assert.equal(renewed.items.filter((item) => item.race?.track === 'participant-calendar').length, 4)
assert.ok(renewed.items.filter((item) => item.race).every((item) => item.race.sourceStatus === 'pending'), 'pauta mensal não pode presumir fonte já verificada')
assert.deepEqual(validateMonthlyCampaignPlan(renewed).races, { total: 8, professional: 4, participant: 4 })

const publishedToday = structuredClone(campaignFixture)
const publishedFixture = publishedToday.items.find((item) => item.publishDate === fixtureStart)
publishedFixture.status = 'published'
publishedFixture.publishedAt = `${fixtureStart}T15:00:00.000Z`
const shifted = await buildRollingCampaign({ existing: publishedToday, report, now: new Date(`${fixtureStart}T18:00:00-03:00`), ai })
assert.equal(shifted.startsOn, fixtureNextDay)

const depleted = structuredClone(activeToday)
for (const item of depleted.items) {
  item.status = 'blocked'
  item.blockReason = 'Pauta indisponível do ciclo anterior'
}
depleted.reserves = []
const depletedSnapshot = monthlyReadinessSnapshot(depleted, { now: new Date(`${fixtureStart}T12:00:00-03:00`) })
assert.equal(depletedSnapshot.needsRenewal, true)
assert.equal(depletedSnapshot.recoverableCount, 0)
const contingencyReport = buildContingencyMonthlyReport({ now: new Date(`${fixtureStart}T12:00:00-03:00`) })
assert.equal(contingencyReport.sourceStatus, 'degraded')
assert.match(contingencyReport.runKey, /^monthly-contingency-/)
const contingencyCampaign = await buildRollingCampaign({
  existing: depleted,
  report: contingencyReport,
  now: new Date(`${fixtureStart}T12:00:00-03:00`),
  ai: { generate: async () => { throw new Error('contingência local não deveria depender de IA') } },
})
const contingencyPlan = validateMonthlyCampaignPlan(contingencyCampaign)
assert.equal(contingencyPlan.items, 30)
assert.ok(contingencyPlan.reserves >= 3)
assert.equal(contingencyCampaign.items.some((item) => ['blocked', 'replaced'].includes(item.status)), false)
assert.equal(monthlyReadinessSnapshot(contingencyCampaign, { now: new Date(`${fixtureStart}T12:00:00-03:00`) }).needsRenewal, false)
console.log('Renovação mensal de 30 dias validada com sucesso.')
