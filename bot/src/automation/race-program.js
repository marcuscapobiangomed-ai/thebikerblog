import { z } from 'zod'
import { CampaignSchema } from './campaign.js'

export const RACE_MONTHLY_TARGETS = Object.freeze({
  total: 8,
  professionalCoverage: 4,
  participantCalendar: 4,
})

const SourceSchema = z.object({
  type: z.enum(['official-calendar', 'official-event', 'regulation', 'registration', 'results', 'broadcast']),
  publisher: z.string().min(2).max(120),
  url: z.string().url().refine((value) => /^https?:\/\//.test(value), 'fonte deve usar HTTP(S)'),
  checkedAt: z.string().datetime(),
})

const RegistrationSchema = z.object({
  status: z.enum(['upcoming', 'open', 'closed', 'sold-out', 'cancelled', 'unknown', 'not-applicable']),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  url: z.string().url().optional(),
  eligibility: z.string().min(10).max(400).optional(),
})

const DeepProfileSchema = z.object({
  status: z.literal('verified'),
  checkedAt: z.string().datetime(),
  source: z.object({
    publisher: z.string().min(2).max(120),
    url: z.string().url().refine((value) => value.startsWith('https://'), 'fonte aprofundada deve usar HTTPS'),
    validationMethod: z.literal('official-event-details'),
  }),
  participation: z.object({
    status: z.enum(['team-only', 'open', 'closed', 'not-published']),
    label: z.string().min(5).max(80),
    description: z.string().min(20).max(500),
    url: z.string().url().optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).superRefine((participation, context) => {
    if (participation.status === 'open' && !participation.url) context.addIssue({ code: 'custom', path: ['url'], message: 'inscrição aberta exige URL oficial' })
    if (participation.status === 'team-only' && participation.url) context.addIssue({ code: 'custom', path: ['url'], message: 'prova por equipes não deve expor inscrição individual' })
  }),
  route: z.object({
    format: z.string().min(5).max(160),
    totalDistanceKm: z.number().positive().max(10000).optional(),
    elevationGainM: z.number().positive().max(100000).optional(),
    stageCount: z.number().int().positive().max(30).optional(),
    restDays: z.number().int().nonnegative().max(10).optional(),
    restSchedule: z.array(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      label: z.string().min(3).max(80),
      location: z.string().min(2).max(160),
    })).max(10).optional(),
    difficulty: z.object({
      label: z.string().min(3).max(100),
      basis: z.string().min(20).max(500),
      assessmentType: z.literal('editorial-from-official-route'),
    }),
    highlights: z.array(z.string().min(10).max(300)).min(1).max(8),
    stages: z.array(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      label: z.string().min(3).max(80),
      start: z.string().min(2).max(120),
      finish: z.string().min(2).max(160),
      distanceKm: z.number().positive().max(500),
      profile: z.string().min(5).max(240),
    })).min(1).max(30).optional(),
    courseOptions: z.array(z.object({
      label: z.string().min(2).max(100),
      distanceKm: z.number().positive().max(1000).optional(),
      distanceLabel: z.string().min(3).max(120).optional(),
      elevationGainM: z.number().positive().max(20000).optional(),
      elevationLabel: z.string().min(3).max(120).optional(),
      difficulty: z.string().min(3).max(120),
      terrain: z.string().min(5).max(240),
      note: z.string().min(5).max(300).optional(),
      startTime: z.string().min(3).max(80).optional(),
    }).superRefine((option, context) => {
      if (!option.distanceKm && !option.distanceLabel) context.addIssue({ code: 'custom', path: ['distanceLabel'], message: 'opção exige distância numérica ou estado oficial da distância' })
    })).min(1).max(12).optional(),
  }).superRefine((route, context) => {
    if (!route.stages && !route.courseOptions && !route.totalDistanceKm) context.addIssue({ code: 'custom', path: [], message: 'percurso exige etapas, opções ou distância total' })
    if (route.stages) {
      if (route.stages.length !== route.stageCount) context.addIssue({ code: 'custom', path: ['stageCount'], message: 'quantidade de etapas diverge da lista' })
      const total = route.stages.reduce((sum, stage) => sum + stage.distanceKm, 0)
      if (!route.totalDistanceKm || Math.abs(total - route.totalDistanceKm) > 0.1) context.addIssue({ code: 'custom', path: ['totalDistanceKm'], message: 'quilometragem total diverge da soma das etapas' })
    }
    if ((route.restSchedule?.length || 0) !== (route.restDays || 0)) context.addIssue({ code: 'custom', path: ['restDays'], message: 'quantidade de descansos diverge da programação' })
  }),
  categories: z.array(z.string().min(5).max(240)).min(1).max(12).optional(),
  logistics: z.array(z.object({
    label: z.string().min(2).max(80),
    detail: z.string().min(5).max(300),
  })).min(1).max(12).optional(),
  coverage: z.object({
    label: z.string().min(3).max(100),
    description: z.string().min(10).max(400),
  }).optional(),
})

export const RaceEventSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,99}$/),
  name: z.string().min(5).max(180),
  track: z.enum(['professional-coverage', 'participant-calendar']),
  discipline: z.enum(['road', 'mtb-xco', 'mtb-xcc', 'mtb-xcm', 'mtb-dhi', 'mtb-enduro', 'gravel', 'bmx', 'track', 'para-cycling', 'multi-discipline']),
  level: z.enum(['international', 'national', 'regional', 'open']),
  country: z.string().length(2),
  state: z.string().length(2).optional(),
  city: z.string().min(2).max(120),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventStatus: z.enum(['scheduled', 'confirmed', 'postponed', 'cancelled', 'completed']),
  registration: RegistrationSchema.optional(),
  sources: z.array(SourceSchema).min(1),
  notes: z.string().max(500).optional(),
}).superRefine((event, context) => {
  if (event.endsOn < event.startsOn) context.addIssue({ code: 'custom', path: ['endsOn'], message: 'fim não pode anteceder o início' })
  if (event.track === 'participant-calendar' && !event.registration) context.addIssue({ code: 'custom', path: ['registration'], message: 'prova participativa exige estado de inscrição, mesmo que desconhecido' })
  if (event.track === 'professional-coverage' && event.registration && event.registration.status !== 'not-applicable') context.addIssue({ code: 'custom', path: ['registration', 'status'], message: 'cobertura profissional não usa inscrição do leitor' })
  if (event.registration?.status === 'open' && !event.registration.url) context.addIssue({ code: 'custom', path: ['registration', 'url'], message: 'inscrição aberta exige URL verificada' })
})

const PublicRaceEventSchema = z.object({
  id: z.string().regex(/^(uci-\d{4}-(roa|mtb)-\d+|br-mtb-\d+)$/),
  track: z.enum(['professional-coverage', 'participant-calendar']),
  name: z.string().min(5).max(180),
  disciplineCode: z.enum(['ROA', 'MTB']),
  disciplineLabel: z.enum(['Ciclismo de estrada', 'Mountain bike']),
  countryCode: z.string().length(3),
  country: z.string().min(2).max(120),
  venue: z.string().max(160),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  displayDate: z.object({
    startsOn: z.string().regex(/^\d{2}\/\d{2}$/),
    endsOn: z.string().regex(/^\d{2}\/\d{2}$/),
    endsOnWithYear: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  }),
  eventStatus: z.enum(['today', 'scheduled', 'past']),
  competitionClass: z.string().min(3).max(160),
  source: z.object({
    provider: z.string().min(2).max(120),
    officialUrl: z.string().url(),
    organizerUrl: z.string().url().optional(),
    discoveryUrl: z.string().url().optional(),
    validationMethod: z.enum(['official-calendar', 'discovery-plus-organizer', 'verified-snapshot-plus-organizer']),
    discoveryCheckedAt: z.string().datetime().optional(),
    checkedAt: z.string().datetime(),
  }),
  deepProfile: DeepProfileSchema.optional(),
}).superRefine((event, context) => {
  if (event.endsOn < event.startsOn) context.addIssue({ code: 'custom', path: ['endsOn'], message: 'fim não pode anteceder o início' })
  const [, startMonth, startDay] = event.startsOn.split('-')
  const [endYear, endMonth, endDay] = event.endsOn.split('-')
  if (event.displayDate.startsOn !== `${startDay}/${startMonth}`) context.addIssue({ code: 'custom', path: ['displayDate', 'startsOn'], message: 'rótulo inicial diverge da data canônica' })
  if (event.displayDate.endsOn !== `${endDay}/${endMonth}` || event.displayDate.endsOnWithYear !== `${endDay}/${endMonth}/${endYear}`) {
    context.addIssue({ code: 'custom', path: ['displayDate'], message: 'rótulo final diverge da data canônica' })
  }
  if (event.id.startsWith('uci-')) {
    if (event.track !== 'professional-coverage') context.addIssue({ code: 'custom', path: ['track'], message: 'prova UCI pública deve alimentar cobertura profissional' })
    if (event.source.provider !== 'Union Cycliste Internationale' || new URL(event.source.officialUrl).hostname !== 'www.uci.org' || event.source.validationMethod !== 'official-calendar') {
      context.addIssue({ code: 'custom', path: ['source'], message: 'prova UCI exige calendário oficial da UCI' })
    }
    if (!event.source.officialUrl.includes(`/competition-details/${event.id.slice(4, 8)}/${event.disciplineCode}/`)) {
      context.addIssue({ code: 'custom', path: ['source', 'officialUrl'], message: 'URL oficial não corresponde ao identificador público' })
    }
  } else {
    if (event.track !== 'participant-calendar' || event.countryCode !== 'BRA' || event.disciplineCode !== 'MTB') {
      context.addIssue({ code: 'custom', path: ['track'], message: 'prova brasileira descoberta deve ser MTB participativa no Brasil' })
    }
    if (!['discovery-plus-organizer', 'verified-snapshot-plus-organizer'].includes(event.source.validationMethod) || !event.source.discoveryUrl || new URL(event.source.discoveryUrl).hostname !== 'www.calendariomtb.com.br') {
      context.addIssue({ code: 'custom', path: ['source'], message: 'prova brasileira exige descoberta rastreável no Calendário MTB e site oficial do organizador' })
    }
    if (event.source.validationMethod === 'verified-snapshot-plus-organizer' && !event.source.discoveryCheckedAt) {
      context.addIssue({ code: 'custom', path: ['source', 'discoveryCheckedAt'], message: 'contingência exige data da última descoberta verificada' })
    }
    if (event.source.discoveryUrl === event.source.officialUrl) {
      context.addIssue({ code: 'custom', path: ['source', 'officialUrl'], message: 'descoberta e confirmação oficial precisam ser fontes independentes' })
    }
  }
  if (event.deepProfile) {
    if (event.deepProfile.checkedAt !== event.source.checkedAt) context.addIssue({ code: 'custom', path: ['deepProfile', 'checkedAt'], message: 'perfil aprofundado precisa pertencer ao snapshot atual' })
    const stageDates = (event.deepProfile.route.stages || []).map((stage) => stage.date)
    if (stageDates.some((date) => date < event.startsOn || date > event.endsOn)) context.addIssue({ code: 'custom', path: ['deepProfile', 'route', 'stages'], message: 'etapa fora do período oficial' })
    const restDates = (event.deepProfile.route.restSchedule || []).map((rest) => rest.date)
    if (restDates.some((date) => date < event.startsOn || date > event.endsOn || stageDates.includes(date))) context.addIssue({ code: 'custom', path: ['deepProfile', 'route', 'restSchedule'], message: 'descanso inválido ou sobreposto a etapa' })
  }
})

const PublicRaceCalendarSchema = z.object({
  generatedAt: z.string().datetime(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  asOfDateDisplay: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  timezone: z.literal('America/Sao_Paulo'),
  sourceStatus: z.enum(['verified', 'degraded']),
  degradation: z.object({
    code: z.literal('brazilian-upcoming-shortfall'),
    expectedBrazilianUpcoming: z.literal(6),
    availableBrazilianUpcoming: z.literal(5),
    safeMinimumBrazilianUpcoming: z.literal(5),
  }).optional(),
  selectionPolicy: z.string().min(30).max(300),
  today: z.array(PublicRaceEventSchema).max(3),
  recent: z.array(PublicRaceEventSchema).min(3).max(12),
  upcoming: z.array(PublicRaceEventSchema).min(10).max(30),
}).superRefine((calendar, context) => {
  const [asOfYear, asOfMonth, asOfDay] = calendar.asOfDate.split('-')
  if (calendar.asOfDateDisplay !== `${asOfDay}/${asOfMonth}/${asOfYear}`) {
    context.addIssue({ code: 'custom', path: ['asOfDateDisplay'], message: 'rótulo da data de referência diverge da data canônica' })
  }
  const ids = new Set()
  const urls = new Set()
  for (const [groupName, events] of [['today', calendar.today], ['recent', calendar.recent], ['upcoming', calendar.upcoming]]) {
    for (const [index, event] of events.entries()) {
      if (ids.has(event.id)) context.addIssue({ code: 'custom', path: [groupName, index, 'id'], message: 'prova pública duplicada' })
      const evidenceUrl = event.source.discoveryUrl || event.source.officialUrl
      if (urls.has(evidenceUrl)) context.addIssue({ code: 'custom', path: [groupName, index, 'source'], message: 'registro de fonte pública duplicado' })
      ids.add(event.id)
      urls.add(evidenceUrl)
      if (event.source.checkedAt !== calendar.generatedAt) {
        context.addIssue({ code: 'custom', path: [groupName, index, 'source', 'checkedAt'], message: 'checagem da fonte precisa pertencer ao snapshot atual' })
      }
      if (groupName === 'today' && (event.eventStatus !== 'today' || event.startsOn > calendar.asOfDate || event.endsOn < calendar.asOfDate)) {
        context.addIssue({ code: 'custom', path: [groupName, index], message: 'prova de hoje precisa abranger a data de referência' })
      }
      if (groupName === 'recent' && (event.eventStatus !== 'past' || event.endsOn >= calendar.asOfDate)) {
        context.addIssue({ code: 'custom', path: [groupName, index], message: 'prova recente precisa estar encerrada antes da data de referência' })
      }
      if (groupName === 'upcoming' && (event.eventStatus !== 'scheduled' || event.startsOn <= calendar.asOfDate)) {
        context.addIssue({ code: 'custom', path: [groupName, index], message: 'próxima prova precisa começar depois da data de referência' })
      }
    }
  }
  for (let index = 1; index < calendar.recent.length; index += 1) {
    if (calendar.recent[index - 1].endsOn < calendar.recent[index].endsOn) {
      context.addIssue({ code: 'custom', path: ['recent', index], message: 'provas recentes devem estar em ordem decrescente' })
    }
  }
  for (let index = 1; index < calendar.upcoming.length; index += 1) {
    if (calendar.upcoming[index - 1].startsOn > calendar.upcoming[index].startsOn) {
      context.addIssue({ code: 'custom', path: ['upcoming', index], message: 'próximas provas devem estar em ordem cronológica' })
    }
  }
  const brazilianUpcoming = calendar.upcoming.filter((event) => event.countryCode === 'BRA').length
  if (calendar.sourceStatus === 'verified') {
    if (calendar.degradation) context.addIssue({ code: 'custom', path: ['degradation'], message: 'snapshot verificado não pode declarar degradação' })
    if (brazilianUpcoming < 6) {
      context.addIssue({ code: 'custom', path: ['upcoming'], message: `agenda verificada exige ao menos 6 provas brasileiras; recebeu ${brazilianUpcoming}` })
    }
  } else {
    if (!calendar.degradation) context.addIssue({ code: 'custom', path: ['degradation'], message: 'snapshot degradado exige estado operacional explícito' })
    if (brazilianUpcoming !== 5) {
      context.addIssue({ code: 'custom', path: ['upcoming'], message: `contingência degradada exige exatamente 5 provas brasileiras verificadas; recebeu ${brazilianUpcoming}` })
    }
    if (calendar.degradation && calendar.degradation.availableBrazilianUpcoming !== brazilianUpcoming) {
      context.addIssue({ code: 'custom', path: ['degradation', 'availableBrazilianUpcoming'], message: 'contagem degradada diverge dos eventos factuais do snapshot' })
    }
  }
})

export const RaceProgramSchema = z.object({
  version: z.literal(1),
  timezone: z.literal('America/Sao_Paulo'),
  updatedAt: z.string().datetime(),
  policy: z.object({
    officialSourcesOnly: z.literal(true),
    revalidateBeforePublicationHours: z.number().int().min(1).max(168),
    unknownRegistrationLabel: z.literal('Inscrição ainda não confirmada na fonte oficial'),
  }),
  publicCalendar: PublicRaceCalendarSchema,
  events: z.array(RaceEventSchema),
}).superRefine((program, context) => {
  const ids = new Set()
  for (const [index, event] of program.events.entries()) {
    if (ids.has(event.id)) context.addIssue({ code: 'custom', path: ['events', index, 'id'], message: 'evento duplicado' })
    ids.add(event.id)
  }
})

export function validatePublicRaceCalendarFreshness(programInput, now = new Date(), maximumAgeHours = 48) {
  const program = RaceProgramSchema.parse(programInput)
  const generatedAt = new Date(program.publicCalendar.generatedAt)
  const ageHours = (now.getTime() - generatedAt.getTime()) / 3_600_000
  if (!Number.isFinite(ageHours) || ageHours < -1 || ageHours > maximumAgeHours) {
    throw new Error(`Calendário público de corridas vencido: ${ageHours.toFixed(1)}h (máximo ${maximumAgeHours}h)`)
  }
  return {
    sourceStatus: program.publicCalendar.sourceStatus,
    degradation: program.publicCalendar.degradation,
    today: program.publicCalendar.today.length,
    recent: program.publicCalendar.recent.length,
    upcoming: program.publicCalendar.upcoming.length,
    generatedAt: program.publicCalendar.generatedAt,
  }
}

const PUBLIC_CLASS_PRIORITY = Object.freeze({
  CM: 600,
  '1.UWT': 560,
  '2.UWT': 560,
  '1.WWT': 550,
  '2.WWT': 550,
  CDM: 520,
  '1.Pro': 400,
  '2.Pro': 400,
})

function publicEvents(program) {
  return [...program.publicCalendar.today, ...program.publicCalendar.recent, ...program.publicCalendar.upcoming]
}

function publicEventPriority(event, asOfDate) {
  const classCode = event.competitionClass.split(/\s+/)[0]
  const classScore = PUBLIC_CLASS_PRIORITY[classCode] || 100
  const date = event.eventStatus === 'past' ? event.endsOn : event.startsOn
  const distanceDays = Math.abs((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${asOfDate}T12:00:00Z`)) / 86_400_000)
  const timingScore = event.eventStatus === 'today' ? 180 : Math.max(0, 120 - distanceDays * 4)
  const brazilScore = event.countryCode === 'BRA' ? 60 : 0
  return classScore + timingScore + brazilScore
}

function publicEventAsEditorialEvidence(event) {
  const discipline = event.disciplineCode === 'ROA'
    ? 'road'
    : /XCO.*XCC|XCC.*XCO|XCO.*DHI|DHI.*XCO/i.test(event.competitionClass)
      ? 'multi-discipline'
      : /XCC/i.test(event.competitionClass)
        ? 'mtb-xcc'
        : /XCO/i.test(event.competitionClass)
          ? 'mtb-xco'
          : /DHI/i.test(event.competitionClass)
            ? 'mtb-dhi'
            : 'multi-discipline'
  return {
    id: event.id,
    name: event.name,
    track: event.track,
    discipline,
    level: event.countryCode === 'BRA' ? 'national' : 'international',
    country: event.countryCode,
    city: event.venue || event.country,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    eventStatus: event.eventStatus,
    competitionClass: event.competitionClass,
    sources: [{
      type: 'official-event',
      publisher: event.source.provider,
      url: event.source.officialUrl,
      checkedAt: event.source.checkedAt,
    }],
  }
}

export function selectRaceEventsForEditorialItem(item, programInput, now = new Date()) {
  if (item.category !== 'competicoes' || !item.race) return []
  const program = RaceProgramSchema.parse(programInput)
  validatePublicRaceCalendarFreshness(program, now)
  const canonical = new Map(program.events.map((event) => [event.id, event]))
  const synchronized = new Map(publicEvents(program).map((event) => [event.id, publicEventAsEditorialEvidence(event)]))

  if (item.race.eventIds.length > 0) {
    return item.race.eventIds.map((id) => canonical.get(id) || synchronized.get(id)).filter(Boolean)
  }
  if (item.race.track !== 'professional-coverage') return []

  const calendar = program.publicCalendar
  const referenceDate = item.publishDate || calendar.asOfDate
  const initialPool = item.race.format === 'preview'
    ? calendar.upcoming
    : item.race.format === 'recap'
      ? calendar.recent
      : [...calendar.today, ...calendar.recent, ...calendar.upcoming]
  const distanceDays = (date) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${referenceDate}T12:00:00Z`)) / 86_400_000)
  const pool = initialPool.filter((event) => {
    if (event.track !== item.race.track) return false
    if (item.race.format === 'preview') {
      const distance = distanceDays(event.startsOn)
      return distance >= 0 && distance <= 21
    }
    if (item.race.format === 'recap') {
      const distance = distanceDays(event.endsOn)
      return distance <= 0 && distance >= -14
    }
    const date = event.eventStatus === 'past' ? event.endsOn : event.startsOn
    return Math.abs(distanceDays(date)) <= 7
  })
  const maximum = item.race.format === 'weekly-roundup' ? 3 : 1
  return [...pool]
    .sort((left, right) => publicEventPriority(right, referenceDate) - publicEventPriority(left, referenceDate)
      || left.startsOn.localeCompare(right.startsOn)
      || left.name.localeCompare(right.name))
    .slice(0, maximum)
    .map(publicEventAsEditorialEvidence)
}

export function validateRaceEditorialStructure(campaignInput, programInput) {
  const campaign = CampaignSchema.parse(campaignInput)
  const program = RaceProgramSchema.parse(programInput)
  const events = new Map(program.events.map((event) => [event.id, event]))
  for (const event of publicEvents(program)) events.set(event.id, { ...event, track: 'professional-coverage' })
  const raceItems = campaign.items.filter((item) => item.category === 'competicoes' && item.race)
  const professional = raceItems.filter((item) => item.race.track === 'professional-coverage')
  const participant = raceItems.filter((item) => item.race.track === 'participant-calendar')
  const issues = []

  // Campanhas anteriores à implantação podem conter conteúdo genérico de
  // competições. Assim que uma campanha adota metadados de corrida, o alvo
  // mensal completo passa a ser obrigatório.
  if (raceItems.length > 0) {
    if (raceItems.length < RACE_MONTHLY_TARGETS.total) issues.push(`campanha tem ${raceItems.length}/${RACE_MONTHLY_TARGETS.total} pautas de corrida`)
    if (professional.length < RACE_MONTHLY_TARGETS.professionalCoverage) issues.push(`cobertura profissional tem ${professional.length}/${RACE_MONTHLY_TARGETS.professionalCoverage} pautas`)
    if (participant.length < RACE_MONTHLY_TARGETS.participantCalendar) issues.push(`calendário participativo tem ${participant.length}/${RACE_MONTHLY_TARGETS.participantCalendar} pautas`)
  }

  for (const item of raceItems) {
    for (const eventId of item.race.eventIds) {
      const event = events.get(eventId)
      if (!event) issues.push(`${item.id}: evento inexistente ${eventId}`)
      else if (event.track !== item.race.track) issues.push(`${item.id}: evento ${eventId} pertence à outra trilha`)
    }
    if (item.race.format === 'registration-alert') {
      const referenced = item.race.eventIds.map((id) => events.get(id)).filter(Boolean)
      if (!referenced.some((event) => event.registration?.status === 'open' && event.registration.url)) issues.push(`${item.id}: alerta de inscrição exige evento com inscrição aberta e URL oficial`)
    }
  }
  if (issues.length) throw new Error(`Programa de corridas inválido:\n- ${issues.join('\n- ')}`)
  return { total: raceItems.length, professional: professional.length, participant: participant.length, events: program.events.length }
}

export function raceSourceIsFresh(item, programInput, now = new Date()) {
  if (item.category !== 'competicoes' || !item.race) return true
  const program = RaceProgramSchema.parse(programInput)
  try {
    validatePublicRaceCalendarFreshness(program, now)
  } catch {
    return false
  }
  if (item.race?.sourceStatus !== 'verified' || !item.race.sourceVerifiedAt || item.race.eventIds.length === 0) return false
  const verifiedAt = new Date(item.race.sourceVerifiedAt)
  const ageHours = (now.getTime() - verifiedAt.getTime()) / 3_600_000
  if (!Number.isFinite(ageHours) || ageHours < 0 || ageHours > program.policy.revalidateBeforePublicationHours) return false
  const events = new Map(program.events.map((event) => [event.id, event]))
  for (const event of publicEvents(program)) events.set(event.id, event)
  return item.race.eventIds.every((id) => events.has(id))
}

export function revalidateRaceSource(item, programInput, now = new Date()) {
  if (item.category !== 'competicoes' || !item.race) return item
  const refreshed = structuredClone(item)
  refreshed.race.sourceStatus = 'verified'
  refreshed.race.sourceVerifiedAt = now.toISOString()
  if (!raceSourceIsFresh(refreshed, programInput, now)) {
    throw new Error(`Pauta de corrida ${item.id} não pôde ser revalidada no calendário oficial atualizado`)
  }
  return refreshed
}
