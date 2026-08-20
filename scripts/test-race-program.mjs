import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CampaignSchema, publicCampaignSummary, selectProductionCandidate, selectPublicationCandidate } from '../bot/src/automation/campaign.js'
import { contentTypeForCampaignItem } from '../bot/src/automation/grounded-research.js'
import {
  RaceProgramSchema,
  raceSourceIsFresh,
  selectRaceEventsForEditorialItem,
  validatePublicRaceCalendarFreshness,
  validateRaceEditorialStructure,
} from '../bot/src/automation/race-program.js'

const campaign = JSON.parse(fs.readFileSync(new URL('../bot/editorial-campaign.json', import.meta.url), 'utf8'))
const program = JSON.parse(fs.readFileSync(new URL('../_data/race-events.json', import.meta.url), 'utf8'))
const publicCalendar = JSON.parse(fs.readFileSync(new URL('../_data/editorial-calendar.json', import.meta.url), 'utf8'))
const parsed = CampaignSchema.parse(campaign)
const result = validateRaceEditorialStructure(parsed, program)
const calendarNow = new Date(new Date(program.publicCalendar.generatedAt).getTime() + 5 * 60_000)

function withBrazilianCoverage(programInput, brazilianTarget) {
  const fixture = structuredClone(programInput)
  const upcoming = fixture.publicCalendar.upcoming
  const brazilian = upcoming.filter((event) => event.countryCode === 'BRA')
  const foreignTemplate = upcoming.find((event) => event.id.startsWith('uci-'))
  assert.ok(foreignTemplate, 'fixture exige ao menos uma prova UCI futura')
  for (let index = brazilianTarget; index < brazilian.length; index += 1) {
    const removedIndex = upcoming.findIndex((event) => event.id === brazilian[index].id)
    const replacement = structuredClone(foreignTemplate)
    const originalNumericId = replacement.id.match(/(\d+)$/)[1]
    const replacementNumericId = String(Number(originalNumericId) + 1000 + index)
    replacement.id = replacement.id.replace(/\d+$/, replacementNumericId)
    replacement.name = `${replacement.name} ${index + 1}`
    replacement.source.officialUrl = replacement.source.officialUrl.replace(/\d+$/, replacementNumericId)
    delete replacement.deepProfile
    upcoming.splice(removedIndex, 1, replacement)
  }
  upcoming.sort((left, right) => left.startsOn.localeCompare(right.startsOn) || left.name.localeCompare(right.name))
  fixture.publicCalendar.sourceStatus = 'degraded'
  fixture.publicCalendar.degradation = {
    code: 'brazilian-upcoming-shortfall',
    expectedBrazilianUpcoming: 6,
    availableBrazilianUpcoming: brazilianTarget,
    safeMinimumBrazilianUpcoming: 5,
  }
  return fixture
}

assert.equal(result.total, 0, 'campanha legada deve continuar válida durante a migração')
assert.deepEqual(publicCalendar, publicCampaignSummary(parsed), 'calendário público precisa refletir a campanha canônica')

const professionalIds = program.events.filter((event) => event.track === 'professional-coverage').map((event) => event.id)
const participantIds = program.events.filter((event) => event.track === 'participant-calendar').map((event) => event.id)
const raceDefinitions = [
  { track: 'professional-coverage', format: 'preview', eventIds: [professionalIds[0]] },
  { track: 'professional-coverage', format: 'recap', eventIds: [professionalIds[1]] },
  { track: 'professional-coverage', format: 'weekly-roundup', eventIds: [professionalIds[2]] },
  { track: 'professional-coverage', format: 'weekly-roundup', eventIds: [professionalIds[0]] },
  { track: 'participant-calendar', format: 'calendar-roundup', eventIds: [participantIds[0]] },
  { track: 'participant-calendar', format: 'calendar-roundup', eventIds: [participantIds[1]] },
  { track: 'participant-calendar', format: 'event-guide', eventIds: [participantIds[2]] },
  { track: 'participant-calendar', format: 'event-guide', eventIds: [participantIds[3]] },
]
const structuredCampaign = structuredClone(parsed)
// O arquivo canônico é estado de produção e muda conforme pautas são
// consumidas. Monte uma amostra isolada em vez de depender da contagem atual
// de itens com status "planned".
const plannedItems = structuredCampaign.items.filter((item) => item.status !== 'published').slice(0, raceDefinitions.length)
assert.equal(plannedItems.length, raceDefinitions.length, 'fixture exige oito pautas ainda não publicadas')
for (const [index, item] of plannedItems.entries()) {
  item.status = 'planned'
  delete item.blockReason
  delete item.failure
  item.category = 'competicoes'
  item.freshness = 'event-driven'
  item.heroImage = { mode: 'race-context' }
  item.race = { ...raceDefinitions[index], sourceStatus: 'pending' }
}
const structured = CampaignSchema.parse(structuredCampaign)
const structuredResult = validateRaceEditorialStructure(structured, program)
assert.deepEqual(
  { total: structuredResult.total, professional: structuredResult.professional, participant: structuredResult.participant },
  { total: 8, professional: 4, participant: 4 },
)
assert.equal(contentTypeForCampaignItem(structured.items.find((item) => item.race?.format === 'preview')), 'previa-corrida')
assert.equal(contentTypeForCampaignItem(structured.items.find((item) => item.race?.format === 'calendar-roundup')), 'calendario-provas')
assert.equal(contentTypeForCampaignItem(structured.items.find((item) => item.race?.format === 'event-guide')), 'guia-prova')

const firstRace = structured.items.find((item) => item.race)
assert.equal(raceSourceIsFresh(firstRace, program, new Date('2026-08-08T16:00:00.000Z')), false, 'pauta pendente não pode ser tratada como pronta')

const readyRace = structuredClone(firstRace)
readyRace.race.sourceStatus = 'verified'
readyRace.race.sourceVerifiedAt = new Date(calendarNow.getTime() - 30 * 60_000).toISOString()
assert.equal(raceSourceIsFresh(readyRace, program, calendarNow), true)
assert.equal(raceSourceIsFresh(readyRace, program, new Date(calendarNow.getTime() + 25 * 3_600_000)), false, 'fonte deve expirar após a janela governada')

const automaticPreview = structuredClone(structured.items.find((item) => item.race?.track === 'professional-coverage'))
automaticPreview.race.format = 'preview'
automaticPreview.race.eventIds = []
automaticPreview.publishDate = program.publicCalendar.asOfDate
const previewEvents = selectRaceEventsForEditorialItem(automaticPreview, program, calendarNow)
assert.equal(previewEvents.length, 1, 'prévia sem vínculo manual deve receber uma prova sincronizada')
assert.equal(previewEvents[0].eventStatus, 'scheduled')
assert.match(previewEvents[0].sources[0].url, /^https:\/\/www\.uci\.org\/competition-details\//)

const automaticRoundup = structuredClone(automaticPreview)
automaticRoundup.race.format = 'weekly-roundup'
const roundupEvents = selectRaceEventsForEditorialItem(automaticRoundup, program, calendarNow)
assert.equal(roundupEvents.length, 3, 'radar semanal deve receber três sinais editoriais priorizados')

const publicLinkedCampaign = structuredClone(structured)
const publicLinkedItem = publicLinkedCampaign.items.find((item) => item.race?.track === 'professional-coverage')
publicLinkedItem.race.eventIds = [previewEvents[0].id]
assert.doesNotThrow(() => validateRaceEditorialStructure(publicLinkedCampaign, program), 'pauta profissional deve aceitar evento público sincronizado')
publicLinkedItem.race.sourceStatus = 'verified'
publicLinkedItem.race.sourceVerifiedAt = new Date(calendarNow.getTime() - 5 * 60_000).toISOString()
assert.equal(raceSourceIsFresh(publicLinkedItem, program, calendarNow), true, 'evento sincronizado deve passar pelo mesmo gate de frescor editorial')

const degradedProgram = withBrazilianCoverage(program, 5)
assert.equal(RaceProgramSchema.parse(degradedProgram).publicCalendar.sourceStatus, 'degraded', '5/6 deve ser estado degradado explícito e factual')
assert.equal(validatePublicRaceCalendarFreshness(degradedProgram, calendarNow).sourceStatus, 'degraded', 'freshness deve aceitar contingência recente sem promovê-la a verificada')
assert.doesNotThrow(() => selectRaceEventsForEditorialItem(automaticPreview, degradedProgram, calendarNow), 'pauta pode usar somente eventos ainda verificados do snapshot degradado recente')

const belowSafeMinimum = withBrazilianCoverage(program, 4)
assert.throws(() => RaceProgramSchema.parse(belowSafeMinimum), /contingência degradada exige exatamente 5|availableBrazilianUpcoming/, 'abaixo de 5/6 deve permanecer fail-closed')

const staleNow = new Date(new Date(program.publicCalendar.generatedAt).getTime() + 49 * 3_600_000)
assert.throws(() => validatePublicRaceCalendarFreshness(program, staleNow), /Calendário público de corridas vencido/, 'freshness operacional deve falhar separadamente')
assert.throws(() => selectRaceEventsForEditorialItem(automaticPreview, program, staleNow), /Calendário público de corridas vencido/, 'pauta de corrida deve bloquear snapshot vencido')
const ordinaryItem = structured.items.find((item) => item.category !== 'competicoes')
assert.deepEqual(selectRaceEventsForEditorialItem(ordinaryItem, program, staleNow), [], 'artigo comum não pode ser bloqueado pela freshness de corridas')

const productionFixture = structuredClone(structured)
for (const item of productionFixture.items) if (item.status === 'planned' && item.category !== 'competicoes') item.status = 'blocked'
assert.equal(selectProductionCandidate(productionFixture)?.category, 'competicoes', 'automação deve pesquisar a próxima pauta de corrida')

const publicationFixture = structuredClone(structured)
const publishable = publicationFixture.items.find((item) => item.race)
publishable.status = 'scheduled'
assert.equal(selectPublicationCandidate(publicationFixture, publishable.publishDate, new Date('2026-08-08T16:00:00.000Z')), null, 'corrida pendente nunca pode ser publicada')
publishable.race.sourceStatus = 'verified'
publishable.race.sourceVerifiedAt = '2026-08-08T15:30:00.000Z'
assert.equal(selectPublicationCandidate(publicationFixture, publishable.publishDate, new Date('2026-08-08T16:00:00.000Z'))?.id, publishable.id)
assert.equal(selectPublicationCandidate(publicationFixture, publishable.publishDate, new Date('2026-08-09T16:00:01.000Z')), null, 'fonte vencida deve bloquear publicação')

const malformed = structuredClone(structured)
malformed.items.find((item) => item.race).race.eventIds = ['evento-inexistente']
assert.throws(() => validateRaceEditorialStructure(malformed, program), /evento inexistente/)

console.log('Estrutura editorial de corridas validada com fail-closed de fontes.')
