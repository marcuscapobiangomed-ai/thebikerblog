import fs from 'node:fs'
import { validatePublicRaceCalendarFreshness, validateRaceEditorialStructure } from '../bot/src/automation/race-program.js'

const campaign = JSON.parse(fs.readFileSync(new URL('../bot/editorial-campaign.json', import.meta.url), 'utf8'))
const program = JSON.parse(fs.readFileSync(new URL('../_data/race-events.json', import.meta.url), 'utf8'))
const result = validateRaceEditorialStructure(campaign, program)
const publicResult = validatePublicRaceCalendarFreshness(program)
const brazilianUpcoming = program.publicCalendar.upcoming.filter((event) => event.countryCode === 'BRA')
const brazilianGuides = brazilianUpcoming.filter((event) => event.deepProfile)

if (program.publicCalendar.recent.length < 3 || program.publicCalendar.upcoming.length < 10) {
  throw new Error('Cobertura pública abaixo do mínimo editorial: 3 recentes e 10 próximas')
}
if (brazilianUpcoming.length < 6 || brazilianGuides.length !== brazilianUpcoming.length) {
  throw new Error(`Cobertura brasileira incompleta: ${brazilianGuides.length}/${brazilianUpcoming.length} próximas com guia aprofundado`)
}

console.log(`Programa de corridas válido: ${result.total} pautas (${result.professional} profissionais + ${result.participant} participativas), ${result.events} eventos editoriais registrados, ${publicResult.today} em disputa hoje, ${publicResult.recent} recentes e ${publicResult.upcoming} próximas sincronizadas; ${brazilianGuides.length}/${brazilianUpcoming.length} brasileiras com guia aprofundado.`)
