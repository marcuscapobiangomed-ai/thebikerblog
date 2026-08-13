import { z } from 'zod'

const HeroImageSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('exact-product'), productId: z.string().min(3) }),
  z.object({
    mode: z.literal('real-context'),
    productId: z.string().min(3),
    relationship: z.enum(['component-example', 'category-example', 'platform-example', 'maintenance-example']),
    rationale: z.string().min(30).max(300),
  }),
  z.object({ mode: z.literal('conceptual') }),
  z.object({ mode: z.literal('race-context') }),
])
const HashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const RaceEditorialSchema = z.object({
  track: z.enum(['professional-coverage', 'participant-calendar']),
  format: z.enum(['preview', 'recap', 'weekly-roundup', 'calendar-roundup', 'event-guide', 'registration-alert']),
  eventIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{2,99}$/)).default([]),
  sourceStatus: z.enum(['pending', 'verified', 'stale', 'blocked']).default('pending'),
  sourceVerifiedAt: z.string().datetime().optional(),
})

const CampaignItemSchema = z.object({
  day: z.number().int().min(1).max(30),
  publishDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  title: z.string().min(20).max(140),
  summary: z.string().min(40).max(260),
  category: z.enum(['manutencao-ajustes', 'engenharia', 'review', 'comparativo', 'componentes', 'lancamentos', 'competicoes']),
  race: RaceEditorialSchema.optional(),
  freshness: z.enum(['evergreen', 'revalidate-24h', 'event-driven']),
  status: z.enum(['planned', 'researching', 'research-ready', 'drafting', 'validation', 'approved', 'scheduled', 'published', 'blocked', 'replaced']),
  productIds: z.array(z.string()).default([]),
  heroImage: HeroImageSchema.default({ mode: 'conceptual' }),
  postPath: z.string().regex(/^_posts\/(?:drafts\/)?[^/]+\.md$/).optional(),
  imageManifestPath: z.string().regex(/^assets\/img\/posts\/.+\/image-manifest\.json$/).optional(),
  imageStatus: z.enum(['missing', 'candidate', 'approved', 'blocked']).optional(),
  imageAssetIds: z.array(z.string()).default([]),
  imageValidatedAt: z.string().datetime().optional(),
  publishedAt: z.string().datetime().optional(),
  blockReason: z.string().optional(),
  failure: z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    retryable: z.boolean(),
    stage: z.string().min(1),
    message: z.string().min(1).max(650),
    recordedAt: z.string().datetime(),
  }).optional(),
  attempts: z.number().int().min(0).default(0),
  lastAttemptAt: z.string().datetime().optional(),
  aiReview: z.object({
    score: z.number().nullable(),
    finalScore: z.number().nullable().default(null),
    finalBlockers: z.number().int().min(0).default(0),
    premiumEditUsed: z.boolean(),
    providers: z.record(z.string(), z.string()),
    generatedAt: z.string().datetime(),
    contentHash: HashSchema.optional(),
    sourceHash: z.string().min(8).optional(),
  }).optional(),
  editorialReceipt: z.object({
    schemaVersion: z.literal(1),
    policyVersion: z.string().min(1),
    origin: z.enum(['pipeline', 'buffer-audit', 'legacy-backfill', 'deterministic-transform']),
    reviewedContentHash: HashSchema,
    scheduledContentHash: HashSchema,
    publishedContentHash: HashSchema.optional(),
    researchHash: HashSchema.nullable(),
    sourceHash: z.string().nullable(),
    finalScore: z.number().min(0).max(100),
    finalBlockers: z.number().int().min(0),
    issuedAt: z.string().datetime(),
  }).optional(),
  visualDecision: z.object({
    schemaVersion: z.literal(1),
    policyVersion: z.literal('thebiker-visual-autonomy-v1'),
    inputHash: HashSchema,
    mode: z.enum(['exact-product', 'real-context', 'race-context']),
    productId: z.string().min(3).nullable(),
    score: z.number().int().min(0).max(100),
    hardGates: z.record(z.string(), z.boolean()),
    blockers: z.array(z.string()),
    issuedAt: z.string().datetime(),
  }).optional(),
})

export function campaignItemInvariantErrors(item) {
  const errors = []
  const reviewed = ['validation', 'approved', 'scheduled'].includes(item.status)
  if (reviewed && !item.postPath) errors.push({ path: ['postPath'], message: `${item.status} exige postPath` })
  if (reviewed && !item.aiReview?.contentHash) errors.push({ path: ['aiReview', 'contentHash'], message: `${item.status} exige revisão com hash do conteúdo` })
  if (item.status === 'scheduled') {
    if ((item.aiReview?.finalScore ?? 0) < 90 || (item.aiReview?.finalBlockers ?? 1) !== 0) {
      errors.push({ path: ['aiReview'], message: 'scheduled exige nota final >= 90 e zero bloqueadores' })
    }
    if (!item.editorialReceipt) errors.push({ path: ['editorialReceipt'], message: 'scheduled exige recibo editorial' })
    if (!item.visualDecision || item.visualDecision.blockers.length > 0) errors.push({ path: ['visualDecision'], message: 'scheduled exige decisão visual sem bloqueadores' })
    if (item.imageStatus !== 'approved' || !item.imageManifestPath || item.imageAssetIds.length === 0) {
      errors.push({ path: ['imageStatus'], message: 'scheduled exige imagem, manifesto e ativo aprovados' })
    }
  }
  if (item.status === 'published' && !item.postPath) errors.push({ path: ['postPath'], message: 'published exige postPath' })
  if (item.status === 'published' && !item.publishedAt) errors.push({ path: ['publishedAt'], message: 'published exige publishedAt' })
  if (item.status === 'blocked' && !item.blockReason && !item.failure) errors.push({ path: ['blockReason'], message: 'blocked exige motivo ou falha tipada' })
  return errors
}

const ReserveSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  category: CampaignItemSchema.shape.category,
  race: RaceEditorialSchema.optional(),
})

export const CampaignSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  timezone: z.literal('America/Sao_Paulo'),
  publishLocalTime: z.literal('12:00'),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minimumApprovedBuffer: z.number().int().min(3).max(14),
  items: z.array(CampaignItemSchema).length(30),
  reserves: z.array(ReserveSchema).min(3),
}).superRefine((campaign, context) => {
  const ids = new Set()
  for (const [index, item] of campaign.items.entries()) {
    for (const error of campaignItemInvariantErrors(item)) {
      context.addIssue({ code: 'custom', path: ['items', index, ...error.path], message: error.message })
    }
    if (ids.has(item.id)) context.addIssue({ code: 'custom', path: ['items', index, 'id'], message: 'id duplicado' })
    ids.add(item.id)
    if (item.day !== index + 1) context.addIssue({ code: 'custom', path: ['items', index, 'day'], message: 'dias precisam ser sequenciais' })
    const expected = new Date(`${campaign.startsOn}T12:00:00-03:00`)
    expected.setDate(expected.getDate() + index)
    const expectedDate = new Intl.DateTimeFormat('en-CA', { timeZone: campaign.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(expected)
    if (item.publishDate !== expectedDate) context.addIssue({ code: 'custom', path: ['items', index, 'publishDate'], message: `data esperada: ${expectedDate}` })
    if (item.category === "review" && ["validation", "approved", "scheduled", "published"].includes(item.status) && item.productIds.length === 0) {
      context.addIssue({ code: 'custom', path: ['items', index, 'productIds'], message: 'review validado exige ao menos um produto rastreável' })
    }
    if (['exact-product', 'real-context'].includes(item.heroImage.mode) && !item.productIds.includes(item.heroImage.productId)) {
      context.addIssue({ code: 'custom', path: ['items', index, 'heroImage', 'productId'], message: 'produto da capa precisa estar declarado em productIds' })
    }
    if (item.heroImage.mode === 'race-context' && item.category !== 'competicoes') {
      context.addIssue({ code: 'custom', path: ['items', index, 'heroImage', 'mode'], message: 'race-context é exclusivo de conteúdo de competições' })
    }
    if (item.category !== 'competicoes' && item.race) {
      context.addIssue({ code: 'custom', path: ['items', index, 'race'], message: 'metadados de corrida só podem existir na categoria competições' })
    }
    if (item.race?.track === 'professional-coverage' && !['preview', 'recap', 'weekly-roundup'].includes(item.race.format)) {
      context.addIssue({ code: 'custom', path: ['items', index, 'race', 'format'], message: 'formato incompatível com cobertura profissional' })
    }
    if (item.race?.track === 'participant-calendar' && !['calendar-roundup', 'event-guide', 'registration-alert'].includes(item.race.format)) {
      context.addIssue({ code: 'custom', path: ['items', index, 'race', 'format'], message: 'formato incompatível com calendário participativo' })
    }
    if (item.race && ['research-ready', 'drafting', 'validation', 'approved', 'scheduled', 'published'].includes(item.status)) {
      if (item.race.sourceStatus !== 'verified') context.addIssue({ code: 'custom', path: ['items', index, 'race', 'sourceStatus'], message: 'pauta de corrida pronta para produção exige fontes verificadas' })
      if (item.race.eventIds.length === 0) context.addIssue({ code: 'custom', path: ['items', index, 'race', 'eventIds'], message: 'pauta de corrida pronta para produção exige ao menos um evento oficial' })
      if (!item.race.sourceVerifiedAt) context.addIssue({ code: 'custom', path: ['items', index, 'race', 'sourceVerifiedAt'], message: 'pauta de corrida pronta para produção exige data de verificação' })
    }
  }
})

export function selectProductionCandidate(campaign) {
  return campaign.items.find((item) => item.status === 'planned') || null
}

export function racePublicationSourceIsFresh(item, now = new Date(), maximumAgeHours = 24) {
  if (!item.race) return true
  if (item.race?.sourceStatus !== 'verified' || !item.race.sourceVerifiedAt || item.race.eventIds.length === 0) return false
  const verifiedAt = new Date(item.race.sourceVerifiedAt)
  const ageHours = (now.getTime() - verifiedAt.getTime()) / 3_600_000
  return Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= maximumAgeHours
}

export function selectPublicationCandidate(campaign, localDate, now = new Date(), raceMaxAgeHours = 24) {
  const item = campaign.items.find((candidate) => candidate.publishDate === localDate && candidate.status === 'scheduled') || null
  return item && racePublicationSourceIsFresh(item, now, raceMaxAgeHours) ? item : null
}

export function publicCampaignSummary(campaign) {
  return {
    campaignId: campaign.id,
    timezone: campaign.timezone,
    publishLocalTime: campaign.publishLocalTime,
    items: campaign.items.map(({ day, publishDate, title, summary, category, status, race }) => ({ day, publishDate, title, summary, category, status, ...(race ? { race: { track: race.track, format: race.format } } : {}) })),
  }
}
