import fs from 'node:fs'
import { validatePublicRaceCalendarFreshness, validateRaceEditorialStructure } from '../bot/src/automation/race-program.js'

const campaign = JSON.parse(fs.readFileSync(new URL('../bot/editorial-campaign.json', import.meta.url), 'utf8'))
const program = JSON.parse(fs.readFileSync(new URL('../_data/race-events.json', import.meta.url), 'utf8'))
const result = validateRaceEditorialStructure(campaign, program)
const publicResult = validatePublicRaceCalendarFreshness(program)

console.log(`Programa de corridas válido: ${result.total} pautas (${result.professional} profissionais + ${result.participant} participativas), ${result.events} eventos editoriais registrados, ${publicResult.today} em disputa hoje, ${publicResult.recent} recentes e ${publicResult.upcoming} próximas sincronizadas.`)
