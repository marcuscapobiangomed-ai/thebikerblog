import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CampaignSchema, publicCampaignSummary, selectProductionCandidate, selectPublicationCandidate } from '../bot/src/automation/campaign.js'
import { contentTypeForCampaignItem } from '../bot/src/automation/grounded-research.js'
import { raceSourceIsFresh, selectRaceEventsForEditorialItem, validateRaceEditorialStructure } from '../bot/src/automation/race-program.js'

const campaign = JSON.parse(fs.readFileSync(new URL('../bot/editorial-campaign.json', import.meta.url), 'utf8'))
const program = JSON.parse(fs.readFileSync(new URL('../_data/race-events.json', import.meta.url), 'utf8'))
const publicCalendar = JSON.parse(fs.readFileSync(new URL('../_data/editorial-calendar.json', import.meta.url), 'utf8'))
const parsed = CampaignSchema.parse(campaign)
const result = validateRaceEditorialStructure(parsed, program)

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
const plannedItems = structuredCampaign.items.filter((item) => item.status === 'planned').slice(0, raceDefinitions.length)
assert.equal(plannedItems.length, raceDefinitions.length, 'fixture exige oito pautas planejadas')
for (const [index, item] of plannedItems.entries()) {
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
readyRace.race.sourceVerifiedAt = '2026-08-08T15:30:00.000Z'
assert.equal(raceSourceIsFresh(readyRace, program, new Date('2026-08-08T16:00:00.000Z')), true)
assert.equal(raceSourceIsFresh(readyRace, program, new Date('2026-08-09T16:00:01.000Z')), false, 'fonte deve expirar após a janela governada')

const automaticPreview = structuredClone(structured.items.find((item) => item.race?.track === 'professional-coverage'))
automaticPreview.race.format = 'preview'
automaticPreview.race.eventIds = []
automaticPreview.publishDate = program.publicCalendar.asOfDate
const previewEvents = selectRaceEventsForEditorialItem(automaticPreview, program)
assert.equal(previewEvents.length, 1, 'prévia sem vínculo manual deve receber uma prova sincronizada')
assert.equal(previewEvents[0].eventStatus, 'scheduled')
assert.match(previewEvents[0].sources[0].url, /^https:\/\/www\.uci\.org\/competition-details\//)

const automaticRoundup = structuredClone(automaticPreview)
automaticRoundup.race.format = 'weekly-roundup'
const roundupEvents = selectRaceEventsForEditorialItem(automaticRoundup, program)
assert.equal(roundupEvents.length, 3, 'radar semanal deve receber três sinais editoriais priorizados')

const publicLinkedCampaign = structuredClone(structured)
const publicLinkedItem = publicLinkedCampaign.items.find((item) => item.race?.track === 'professional-coverage')
publicLinkedItem.race.eventIds = [previewEvents[0].id]
assert.doesNotThrow(() => validateRaceEditorialStructure(publicLinkedCampaign, program), 'pauta profissional deve aceitar evento público sincronizado')
publicLinkedItem.race.sourceStatus = 'verified'
publicLinkedItem.race.sourceVerifiedAt = '2026-08-11T16:55:00.000Z'
assert.equal(raceSourceIsFresh(publicLinkedItem, program, new Date('2026-08-11T17:00:00.000Z')), true, 'evento sincronizado deve passar pelo mesmo gate de frescor editorial')

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
