import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CampaignSchema, publicCampaignSummary, selectProductionCandidate, selectPublicationCandidate } from '../bot/src/automation/campaign.js'
import { contentTypeForCampaignItem } from '../bot/src/automation/grounded-research.js'
import { raceSourceIsFresh, validateRaceEditorialStructure } from '../bot/src/automation/race-program.js'

const campaign = JSON.parse(fs.readFileSync(new URL('../bot/editorial-campaign.json', import.meta.url), 'utf8'))
const program = JSON.parse(fs.readFileSync(new URL('../_data/race-events.json', import.meta.url), 'utf8'))
const publicCalendar = JSON.parse(fs.readFileSync(new URL('../_data/editorial-calendar.json', import.meta.url), 'utf8'))
const parsed = CampaignSchema.parse(campaign)
const result = validateRaceEditorialStructure(parsed, program)

assert.equal(result.total, 8)
assert.equal(result.professional, 4)
assert.equal(result.participant, 4)
assert.deepEqual(publicCalendar, publicCampaignSummary(parsed), 'calendário público precisa refletir a campanha canônica')
assert.equal(contentTypeForCampaignItem(parsed.items.find((item) => item.race?.format === 'preview')), 'previa-corrida')
assert.equal(contentTypeForCampaignItem(parsed.items.find((item) => item.race?.format === 'calendar-roundup')), 'calendario-provas')
assert.equal(contentTypeForCampaignItem(parsed.items.find((item) => item.race?.format === 'event-guide')), 'guia-prova')

const firstRace = parsed.items.find((item) => item.category === 'competicoes')
assert.equal(raceSourceIsFresh(firstRace, program, new Date('2026-08-08T16:00:00.000Z')), false, 'pauta pendente não pode ser tratada como pronta')

const readyRace = structuredClone(firstRace)
readyRace.race.sourceStatus = 'verified'
readyRace.race.sourceVerifiedAt = '2026-08-08T15:30:00.000Z'
assert.equal(raceSourceIsFresh(readyRace, program, new Date('2026-08-08T16:00:00.000Z')), true)
assert.equal(raceSourceIsFresh(readyRace, program, new Date('2026-08-09T16:00:01.000Z')), false, 'fonte deve expirar após a janela governada')

const productionFixture = structuredClone(parsed)
for (const item of productionFixture.items) if (item.status === 'planned' && item.category !== 'competicoes') item.status = 'blocked'
assert.equal(selectProductionCandidate(productionFixture)?.category, 'competicoes', 'automação deve pesquisar a próxima pauta de corrida')

const publicationFixture = structuredClone(parsed)
const publishable = publicationFixture.items.find((item) => item.category === 'competicoes')
publishable.status = 'scheduled'
assert.equal(selectPublicationCandidate(publicationFixture, publishable.publishDate, new Date('2026-08-08T16:00:00.000Z')), null, 'corrida pendente nunca pode ser publicada')
publishable.race.sourceStatus = 'verified'
publishable.race.sourceVerifiedAt = '2026-08-08T15:30:00.000Z'
assert.equal(selectPublicationCandidate(publicationFixture, publishable.publishDate, new Date('2026-08-08T16:00:00.000Z'))?.id, publishable.id)
assert.equal(selectPublicationCandidate(publicationFixture, publishable.publishDate, new Date('2026-08-09T16:00:01.000Z')), null, 'fonte vencida deve bloquear publicação')

const malformed = structuredClone(parsed)
malformed.items.find((item) => item.category === 'competicoes').race.eventIds = ['evento-inexistente']
assert.throws(() => validateRaceEditorialStructure(malformed, program), /evento inexistente/)

console.log('Estrutura editorial de corridas validada com fail-closed de fontes.')
