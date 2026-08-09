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

export const RaceProgramSchema = z.object({
  version: z.literal(1),
  timezone: z.literal('America/Sao_Paulo'),
  updatedAt: z.string().datetime(),
  policy: z.object({
    officialSourcesOnly: z.literal(true),
    revalidateBeforePublicationHours: z.number().int().min(1).max(168),
    unknownRegistrationLabel: z.literal('Inscrição ainda não confirmada na fonte oficial'),
  }),
  events: z.array(RaceEventSchema),
}).superRefine((program, context) => {
  const ids = new Set()
  for (const [index, event] of program.events.entries()) {
    if (ids.has(event.id)) context.addIssue({ code: 'custom', path: ['events', index, 'id'], message: 'evento duplicado' })
    ids.add(event.id)
  }
})

export function validateRaceEditorialStructure(campaignInput, programInput) {
  const campaign = CampaignSchema.parse(campaignInput)
  const program = RaceProgramSchema.parse(programInput)
  const events = new Map(program.events.map((event) => [event.id, event]))
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
  return item.race.eventIds.every((id) => events.has(id))
}
