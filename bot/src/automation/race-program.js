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
  id: z.string().regex(/^uci-\d{4}-(roa|mtb)-\d+$/),
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
    provider: z.literal('Union Cycliste Internationale'),
    officialUrl: z.string().url().refine((value) => new URL(value).hostname === 'www.uci.org', 'fonte pública deve ser oficial da UCI'),
    organizerUrl: z.string().url().optional(),
    checkedAt: z.string().datetime(),
  }),
}).superRefine((event, context) => {
  if (event.endsOn < event.startsOn) context.addIssue({ code: 'custom', path: ['endsOn'], message: 'fim não pode anteceder o início' })
  const [, startMonth, startDay] = event.startsOn.split('-')
  const [endYear, endMonth, endDay] = event.endsOn.split('-')
  if (event.displayDate.startsOn !== `${startDay}/${startMonth}`) context.addIssue({ code: 'custom', path: ['displayDate', 'startsOn'], message: 'rótulo inicial diverge da data canônica' })
  if (event.displayDate.endsOn !== `${endDay}/${endMonth}` || event.displayDate.endsOnWithYear !== `${endDay}/${endMonth}/${endYear}`) {
    context.addIssue({ code: 'custom', path: ['displayDate'], message: 'rótulo final diverge da data canônica' })
  }
  if (!event.source.officialUrl.includes(`/competition-details/${event.id.slice(4, 8)}/${event.disciplineCode}/`)) {
    context.addIssue({ code: 'custom', path: ['source', 'officialUrl'], message: 'URL oficial não corresponde ao identificador público' })
  }
})

const PublicRaceCalendarSchema = z.object({
  generatedAt: z.string().datetime(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  asOfDateDisplay: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  timezone: z.literal('America/Sao_Paulo'),
  sourceStatus: z.literal('verified'),
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
      if (urls.has(event.source.officialUrl)) context.addIssue({ code: 'custom', path: [groupName, index, 'source', 'officialUrl'], message: 'fonte pública duplicada' })
      ids.add(event.id)
      urls.add(event.source.officialUrl)
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
    track: 'professional-coverage',
    discipline,
    level: 'international',
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

export function selectRaceEventsForEditorialItem(item, programInput) {
  if (item.category !== 'competicoes' || !item.race) return []
  const program = RaceProgramSchema.parse(programInput)
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
  const raceItems = campaign.items.filter((item) => item.category === 'competicoes')
  const professional = raceItems.filter((item) => item.race.track === 'professional-coverage')
  const participant = raceItems.filter((item) => item.race.track === 'participant-calendar')
  const issues = []

  if (raceItems.length < RACE_MONTHLY_TARGETS.total) issues.push(`campanha tem ${raceItems.length}/${RACE_MONTHLY_TARGETS.total} pautas de corrida`)
  if (professional.length < RACE_MONTHLY_TARGETS.professionalCoverage) issues.push(`cobertura profissional tem ${professional.length}/${RACE_MONTHLY_TARGETS.professionalCoverage} pautas`)
  if (participant.length < RACE_MONTHLY_TARGETS.participantCalendar) issues.push(`calendário participativo tem ${participant.length}/${RACE_MONTHLY_TARGETS.participantCalendar} pautas`)

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
  if (item.category !== 'competicoes') return true
  const program = RaceProgramSchema.parse(programInput)
  if (item.race?.sourceStatus !== 'verified' || !item.race.sourceVerifiedAt || item.race.eventIds.length === 0) return false
  const verifiedAt = new Date(item.race.sourceVerifiedAt)
  const ageHours = (now.getTime() - verifiedAt.getTime()) / 3_600_000
  if (!Number.isFinite(ageHours) || ageHours < 0 || ageHours > program.policy.revalidateBeforePublicationHours) return false
  const events = new Map(program.events.map((event) => [event.id, event]))
  for (const event of publicEvents(program)) events.set(event.id, event)
  return item.race.eventIds.every((id) => events.has(id))
}
