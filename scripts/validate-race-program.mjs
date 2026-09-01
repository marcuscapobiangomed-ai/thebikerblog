import fs from 'node:fs'
import { validatePublicRaceCalendarFreshness, validateRaceEditorialStructure } from '../bot/src/automation/race-program.js'

const campaign = JSON.parse(fs.readFileSync(new URL('../bot/editorial-campaign.json', import.meta.url), 'utf8'))
const program = JSON.parse(fs.readFileSync(new URL('../_data/race-events.json', import.meta.url), 'utf8'))
const result = validateRaceEditorialStructure(campaign, program)
const checkFreshness = process.argv.includes('--freshness')
const publicResult = checkFreshness
  ? validatePublicRaceCalendarFreshness(program)
  : {
      sourceStatus: program.publicCalendar.sourceStatus,
      today: program.publicCalendar.today.length,
      recent: program.publicCalendar.recent.length,
      upcoming: program.publicCalendar.upcoming.length,
      generatedAt: program.publicCalendar.generatedAt,
    }
const brazilianUpcoming = program.publicCalendar.upcoming.filter((event) => event.countryCode === 'BRA')
const brazilianGuides = brazilianUpcoming.filter((event) => event.deepProfile)

if (program.publicCalendar.recent.length < 3 || program.publicCalendar.upcoming.length < 10) {
  throw new Error('Cobertura pública abaixo do mínimo editorial: 3 recentes e 10 próximas')
}
if (brazilianGuides.length !== brazilianUpcoming.length) {
  throw new Error(`Cobertura brasileira incompleta: ${brazilianGuides.length}/${brazilianUpcoming.length} próximas com guia aprofundado`)
}

const validationMode = checkFreshness ? 'estrutura e freshness operacionais' : 'estrutura factual'
const degradation = publicResult.sourceStatus === 'degraded' ? ' (contingência degradada 5/6)' : ''
console.log(`Programa de corridas válido em ${validationMode}: ${result.total} pautas (${result.professional} profissionais + ${result.participant} participativas), ${result.events} eventos editoriais registrados, ${publicResult.today} em disputa hoje, ${publicResult.recent} recentes e ${publicResult.upcoming} próximas sincronizadas; ${brazilianGuides.length}/${brazilianUpcoming.length} brasileiras com guia aprofundado; estado ${publicResult.sourceStatus}${degradation}.`)
