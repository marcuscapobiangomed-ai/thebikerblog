import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(projectRoot, '_data', 'race-events.json')
const deepProfilesPath = path.join(projectRoot, '_data', 'race-deep-profiles.json')
const UCI_BASE_URL = 'https://www.uci.org'
const CALENDARIO_MTB_BASE_URL = 'https://www.calendariomtb.com.br'
const RECENT_MINIMUM = 3
const UPCOMING_MINIMUM = 10
const TODAY_MAXIMUM = 3
const BRAZIL_UPCOMING_TARGET = 6
const CALENDAR_REQUEST_CONCURRENCY = 6
const DETAIL_REQUEST_CONCURRENCY = 4
const CALENDAR_TIMEZONE = 'America/Sao_Paulo'
const BRAZIL_BIKE_NAME_PATTERN = /\b(mtb|mountain bike|bike|biker|brou|brasil ride|cimtb|ciclismo)\b/i
const DEBUG_SYNC = process.argv.includes('--debug')

function debugSync(message) {
  if (DEBUG_SYNC) process.stderr.write(`[corridas] ${message}\n`)
}

const CLASS_FILTERS = Object.freeze({
  ROA: ['1.UWT', '2.UWT', '1.WWT', '2.WWT', '1.Pro', '2.Pro'],
  MTB: ['CM', 'CDM'],
})

const CLASS_PRIORITY = Object.freeze({
  CM: 600,
  '1.UWT': 560,
  '2.UWT': 560,
  '1.WWT': 550,
  '2.WWT': 550,
  CDM: 520,
  '1.Pro': 400,
  '2.Pro': 400,
})

function cliValue(name) {
  const prefix = `--${name}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

function isoDate(value) {
  return value.toISOString().slice(0, 10)
}

function dateInTimeZone(value, timeZone = CALENDAR_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function formatBrDate(value, includeYear = false) {
  const [year, month, day] = value.split('-')
  return includeYear ? `${day}/${month}/${year}` : `${day}/${month}`
}

function addDays(date, days) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function dateFromInput(value) {
  if (!value) return dateInTimeZone(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Data inválida: ${value}`)
  const date = new Date(`${value}T12:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || isoDate(date) !== value) throw new Error(`Data inválida: ${value}`)
  return value
}

function officialUciUrl(relativeUrl) {
  const url = new URL(relativeUrl, UCI_BASE_URL)
  if (url.hostname !== 'www.uci.org') throw new Error(`Fonte fora do domínio oficial da UCI: ${url.href}`)
  return url.href
}

async function fetchText(url, { attempts = 3 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json,text/html;q=0.9',
          'user-agent': 'TheBikerBlog-RaceCalendar/1.0 (+https://thebikershop.blog/corridas/)',
        },
        signal: AbortSignal.timeout(25_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        const backoffMs = Math.min(5_000, (2 ** (attempt - 1)) * 750 + Math.floor(Math.random() * 250))
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }
  }
  throw new Error(`Falha ao consultar ${url}: ${lastError?.message || 'erro desconhecido'}`)
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

async function fetchJson(url) {
  const body = await fetchText(url)
  try {
    return JSON.parse(body)
  } catch (error) {
    throw new Error(`Resposta não JSON em ${url}: ${error.message}`)
  }
}

function parseJsonLdEvents(html, sourceUrl) {
  const events = []
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1])
      const candidates = Array.isArray(parsed) ? parsed : [parsed]
      events.push(...candidates.filter((item) => item?.['@type'] === 'Event'))
    } catch {
      // Other JSON-LD blocks on the discovery page are not part of the event contract.
    }
  }
  if (events.length !== 1) throw new Error(`Ficha brasileira sem evento JSON-LD único: ${sourceUrl}`)
  return events[0]
}

function calendarioMtbDetailLinks(html) {
  const links = new Map()
  for (const match of html.matchAll(/<a href=["'](\/evento\/[^"']+\/(\d+)\/)["'][^>]*title=["']([^"']+)["']/gi)) {
    links.set(match[2], new URL(match[1], CALENDARIO_MTB_BASE_URL).href)
  }
  return [...links.entries()].map(([sourceId, discoveryUrl]) => ({ sourceId, discoveryUrl }))
}

function calendarioMtbPageCount(html) {
  const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1]))
  return Math.min(10, Math.max(1, ...pages))
}

function parseBrazilianLocation(location) {
  const match = String(location || '').trim().match(/^(.+?)\s*\(([A-Z]{2})\)$/)
  if (!match || /^a divulgar$/i.test(match[1])) throw new Error(`Local brasileiro incompleto: ${location || 'ausente'}`)
  return { city: match[1].trim(), state: match[2] }
}

function normalizeSeriesName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b\d+[ªº]?\s*(etapa)?\b/g, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function brazilianEventFromJsonLd(data, candidate) {
  const name = String(data.name || '').trim()
  const startsOn = String(data.startDate || '').slice(0, 10)
  const endsOn = String(data.endDate || data.startDate || '').slice(0, 10)
  const country = data.location?.address?.addressCountry
  const officialUrl = data.offers?.url
  if (/trail\s*run/i.test(name) && !BRAZIL_BIKE_NAME_PATTERN.test(name.replace(/trail\s*run/ig, ''))) {
    throw new Error(`Evento exclusivamente de trail run: ${name || candidate.discoveryUrl}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn) {
    throw new Error(`Datas brasileiras inválidas: ${candidate.discoveryUrl}`)
  }
  if (country !== 'BR') throw new Error(`Evento fora do Brasil: ${candidate.discoveryUrl}`)
  if (!officialUrl || !/^https?:\/\//.test(officialUrl)) throw new Error(`Evento brasileiro sem site oficial: ${candidate.discoveryUrl}`)
  const official = new URL(officialUrl)
  if (official.hostname.endsWith('calendariomtb.com.br')) throw new Error(`Site oficial não independente: ${candidate.discoveryUrl}`)
  const { city, state } = parseBrazilianLocation(data.location?.name)
  return {
    key: `br-mtb-${candidate.sourceId}`,
    sourceId: candidate.sourceId,
    name,
    venue: `${city}/${state}`,
    countryCode: 'BRA',
    startsOn,
    endsOn,
    disciplineCode: 'MTB',
    classCode: 'BR-MTB',
    officialUrl: official.href,
    discoveryUrl: candidate.discoveryUrl,
    provider: String(data.organizer?.name || new URL(officialUrl).hostname).trim(),
    seriesKey: `${normalizeSeriesName(name)}|${startsOn}|${city.toLowerCase()}|${state}`,
  }
}

function normalizedEvidenceText(value) {
  const namedEntities = {
    aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä',
    ccedil: 'ç', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
    iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
    oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö',
    uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
    ordf: 'ª', ordm: 'º', nbsp: ' ', ndash: '-', mdash: '-', amp: '&', gt: '>', lt: '<', quot: '"',
  }
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name) => namedEntities[name.toLowerCase()] ?? entity)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\\[nrt]/g, ' ')
    .replace(/\s+/g, ' ')
}

function validateDeepProfileDefinition(profile) {
  if (!profile?.eventId || !profile?.eventName || !/^\d{4}-\d{2}-\d{2}$/.test(profile.validFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(profile.validThrough)) {
    throw new Error('Perfil aprofundado sem identidade ou vigência válida')
  }
  if (!/^https:\/\//.test(profile.source?.url || '') || !profile.source?.publisher || !Array.isArray(profile.source?.verificationTokens) || profile.source.verificationTokens.length < 3) {
    throw new Error(`Perfil aprofundado ${profile.eventId} sem fonte oficial verificável`)
  }
  const stages = profile.route?.stages
  const courseOptions = profile.route?.courseOptions
  const hasStages = Array.isArray(stages) && stages.length > 0
  const hasCourseOptions = Array.isArray(courseOptions) && courseOptions.length > 0
  const hasTotalDistance = Number.isFinite(profile.route?.totalDistanceKm) && profile.route.totalDistanceKm > 0
  if (!profile.route || (!hasStages && !hasCourseOptions && !hasTotalDistance)) {
    throw new Error(`Perfil aprofundado ${profile.eventId} com percurso incompleto`)
  }
  if (hasStages) {
    if (stages.length !== profile.route.stageCount || !hasTotalDistance) throw new Error(`Perfil aprofundado ${profile.eventId} com etapas incompletas`)
    const distanceSum = stages.reduce((total, stage) => total + Number(stage.distanceKm || 0), 0)
    if (Math.abs(distanceSum - profile.route.totalDistanceKm) > 0.1) {
      throw new Error(`Perfil aprofundado ${profile.eventId} diverge na quilometragem: ${distanceSum}/${profile.route.totalDistanceKm}`)
    }
  }
  if (hasCourseOptions && courseOptions.some((option) => !option.label || (!Number.isFinite(option.distanceKm) && !option.distanceLabel))) {
    throw new Error(`Perfil aprofundado ${profile.eventId} com opção de percurso incompleta`)
  }
  if ((profile.route.restSchedule?.length || 0) !== (profile.route.restDays || 0)) {
    throw new Error(`Perfil aprofundado ${profile.eventId} diverge nos dias de descanso`)
  }
  if (!['team-only', 'open', 'closed', 'not-published'].includes(profile.participation?.status)) {
    throw new Error(`Perfil aprofundado ${profile.eventId} com inscrição inválida`)
  }
  return profile
}

export function verifyDeepProfileEvidence(profileInput, event, html, checkedAt) {
  const profile = validateDeepProfileDefinition(profileInput)
  if (profile.eventId !== event.id || profile.eventName !== event.name || profile.validFrom !== event.startsOn || profile.validThrough !== event.endsOn) {
    throw new Error(`Perfil aprofundado divergente do calendário: ${profile.eventId}`)
  }
  const evidence = normalizedEvidenceText(html)
  const missingTokens = profile.source.verificationTokens
    .map((token) => normalizedEvidenceText(token))
    .filter((token) => !evidence.includes(token))
  if (missingTokens.length) {
    throw new Error(`Fonte aprofundada não confirma ${profile.eventId}: ${missingTokens.join(', ')}`)
  }
  return {
    status: 'verified',
    checkedAt,
    source: {
      publisher: profile.source.publisher,
      url: profile.source.url,
      validationMethod: 'official-event-details',
    },
    participation: profile.participation,
    route: profile.route,
    categories: profile.categories,
    logistics: profile.logistics,
    coverage: profile.coverage,
  }
}

async function enrichDeepProfiles(events, profileById, checkedAt) {
  return mapWithConcurrency(events, DETAIL_REQUEST_CONCURRENCY, async (event) => {
    const profile = profileById.get(event.id)
    if (!profile) return event
    const html = await fetchText(profile.source.url)
    return { ...event, deepProfile: verifyDeepProfileEvidence(profile, event, html, checkedAt) }
  })
}

function dateEvidencePatterns(isoValue) {
  const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  const [year, month, day] = isoValue.split('-')
  const numericDay = String(Number(day))
  const numericMonth = String(Number(month))
  return [
    isoValue,
    `${day}/${month}/${year}`,
    `${numericDay}/${numericMonth}/${year}`,
    `${day}/${month}/${year.slice(2)}`,
    `${numericDay} de ${months[Number(month) - 1]}`,
    `${numericDay} ${months[Number(month) - 1]}`,
  ]
}

function officialOrganizerConfirmsEvent(event, html) {
  const text = normalizedEvidenceText(html)
  if (!BRAZIL_BIKE_NAME_PATTERN.test(text)) return false
  const city = normalizeSeriesName(event.venue.split('/')[0])
  const locations = [...text.matchAll(new RegExp(city.replace(/\s+/g, '\\s+'), 'g'))].map((match) => match.index)
  if (locations.length === 0) return false
  const startPatterns = dateEvidencePatterns(event.startsOn)
  const endPatterns = dateEvidencePatterns(event.endsOn)
  const [startYear, startMonth, startDay] = event.startsOn.split('-').map(Number)
  const [endYear, endMonth, endDay] = event.endsOn.split('-').map(Number)
  for (const index of locations) {
    const window = text.slice(Math.max(0, index - 1_200), index + city.length + 1_200)
    const ranges = [...window.matchAll(/\b(\d{1,2})\s+(?:a|e|ate)\s+(\d{1,2})\s+(?:de\s+)?(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g)]
    if (ranges.length > 0 && startYear === endYear && startMonth === endMonth) {
      const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
      if (ranges.some((range) => Number(range[1]) === startDay && Number(range[2]) === endDay && months.indexOf(range[3]) + 1 === startMonth)) return true
      continue
    }
    if (startPatterns.some((pattern) => window.includes(pattern)) && endPatterns.some((pattern) => window.includes(pattern))) return true
  }
  return false
}

async function resolveOfficialEvidence(event) {
  const { officialUrl: url } = event
  const candidates = [...new Set([url, url.replace(/^http:/, 'https:')])].reverse()
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        redirect: 'follow',
        headers: { 'user-agent': 'TheBikerBlog-RaceCalendar/1.0 (+https://blog.thebiker.com.br/corridas/)' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok || !/^https?:$/.test(new URL(response.url).protocol)) continue
      const html = await response.text()
      if (officialOrganizerConfirmsEvent(event, html)) return { ...event, officialUrl: response.url }
    } catch {
      // Try the next safe protocol candidate.
    }
  }
  throw new Error(`Site oficial não confirma local e período: ${url}`)
}

async function collectBrazilianEvents(asOfDate) {
  const firstUrl = `${CALENDARIO_MTB_BASE_URL}/evento/index.php?page=1`
  const firstHtml = await fetchText(firstUrl)
  const pageCount = calendarioMtbPageCount(firstHtml)
  const pages = [firstHtml]
  if (pageCount > 1) {
    const remaining = await mapWithConcurrency(
      Array.from({ length: pageCount - 1 }, (_, index) => `${CALENDARIO_MTB_BASE_URL}/evento/index.php?page=${index + 2}`),
      CALENDAR_REQUEST_CONCURRENCY,
      fetchText,
    )
    pages.push(...remaining)
  }
  const detailCandidates = new Map()
  for (const page of pages) for (const candidate of calendarioMtbDetailLinks(page)) detailCandidates.set(candidate.sourceId, candidate)
  const horizon = isoDate(addDays(new Date(`${asOfDate}T12:00:00.000Z`), 90))
  const parsed = await mapWithConcurrency([...detailCandidates.values()], CALENDAR_REQUEST_CONCURRENCY, async (candidate) => {
    try {
      const html = await fetchText(candidate.discoveryUrl)
      const event = brazilianEventFromJsonLd(parseJsonLdEvents(html, candidate.discoveryUrl), candidate)
      return event.endsOn >= asOfDate && event.startsOn <= horizon ? event : null
    } catch (error) {
      debugSync(`Descoberta excluída ${candidate.discoveryUrl}: ${error.message}`)
      return null
    }
  })
  const conflicts = new Map()
  for (const event of parsed.filter(Boolean)) conflicts.set(event.seriesKey, (conflicts.get(event.seriesKey) || 0) + 1)
  const clean = parsed.filter((event) => event && conflicts.get(event.seriesKey) === 1)
    .sort((left, right) => left.startsOn.localeCompare(right.startsOn) || left.name.localeCompare(right.name))
  const verified = []
  for (const event of clean) {
    try {
      const confirmed = await resolveOfficialEvidence(event)
      verified.push(confirmed)
      debugSync(`Confirmada ${confirmed.name}: ${confirmed.officialUrl}`)
    } catch (error) {
      debugSync(`Confirmação excluída ${event.name}: ${error.message}`)
      // Discovery is not enough: the organizer must confirm the same place and period.
    }
    const upcomingCount = verified.filter((item) => item.startsOn > asOfDate).length
    if (upcomingCount >= BRAZIL_UPCOMING_TARGET && event.startsOn > asOfDate) break
  }
  return verified
}

function flattenCalendarResponse(payload, disciplineCode, classCode) {
  if (!Array.isArray(payload?.items)) throw new Error(`Contrato UCI inválido para ${disciplineCode}/${classCode}: items ausente`)
  const rows = []
  for (const month of payload.items) {
    if (!Array.isArray(month?.items)) throw new Error(`Contrato UCI inválido para ${disciplineCode}/${classCode}: mês sem items`)
    for (const day of month.items) {
      const date = String(day?.competitionDate || '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(day?.items)) {
        throw new Error(`Contrato UCI inválido para ${disciplineCode}/${classCode}: dia incompleto`)
      }
      for (const item of day.items) {
        const relativeUrl = item?.detailsLink?.url
        if (!item?.name || !relativeUrl || !item?.country) {
          throw new Error(`Contrato UCI inválido para ${disciplineCode}/${classCode}: prova incompleta`)
        }
        rows.push({
          key: relativeUrl,
          name: item.name,
          venue: item.venue || '',
          countryCode: item.country,
          date,
          disciplineCode,
          classCode,
          officialUrl: officialUciUrl(relativeUrl),
        })
      }
    }
  }
  return rows
}

function mergeCalendarRows(rows) {
  const merged = new Map()
  for (const row of rows) {
    const existing = merged.get(row.key)
    if (!existing) {
      merged.set(row.key, { ...row, startsOn: row.date, endsOn: row.date })
      continue
    }
    if (row.date < existing.startsOn) existing.startsOn = row.date
    if (row.date > existing.endsOn) existing.endsOn = row.date
    if ((CLASS_PRIORITY[row.classCode] || 0) > (CLASS_PRIORITY[existing.classCode] || 0)) existing.classCode = row.classCode
  }
  return [...merged.values()]
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function parseCompetitionDetails(html, sourceUrl) {
  const match = html.match(/data-component="CompetitionDetailsModule" data-props="([^"]+)"/)
  if (!match) throw new Error(`Ficha oficial sem CompetitionDetailsModule: ${sourceUrl}`)
  let props
  try {
    props = JSON.parse(decodeHtmlAttribute(match[1]))
  } catch (error) {
    throw new Error(`Ficha oficial com JSON inválido em ${sourceUrl}: ${error.message}`)
  }
  const details = props?.competitionDetails
  if (!details?.name || !details?.country || !details?.competitionClass) {
    throw new Error(`Ficha oficial incompleta em ${sourceUrl}`)
  }
  const organizerUrl = details.website?.url
  return {
    name: details.name,
    country: details.country,
    venue: details.venue || '',
    competitionClass: details.competitionClass,
    organizerUrl: organizerUrl && /^https?:\/\//.test(organizerUrl) ? organizerUrl : undefined,
  }
}

function eventId(event) {
  const match = event.officialUrl.match(/\/competition-details\/(\d{4})\/(ROA|MTB)\/(\d+)/)
  if (!match) throw new Error(`URL oficial sem identificador de competição: ${event.officialUrl}`)
  return `uci-${match[1]}-${match[2].toLowerCase()}-${match[3]}`
}

function mapPublicEvent(event, details, status, checkedAt) {
  if (event.classCode && !details.competitionClass.startsWith(event.classCode)) {
    throw new Error(`Classe divergente em ${event.officialUrl}: filtro ${event.classCode}, ficha ${details.competitionClass}`)
  }
  return {
    id: eventId(event),
    track: 'professional-coverage',
    name: details.name,
    disciplineCode: event.disciplineCode,
    disciplineLabel: event.disciplineCode === 'ROA' ? 'Ciclismo de estrada' : 'Mountain bike',
    countryCode: event.countryCode,
    country: details.country,
    venue: details.venue || event.venue || '',
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    displayDate: {
      startsOn: formatBrDate(event.startsOn),
      endsOn: formatBrDate(event.endsOn),
      endsOnWithYear: formatBrDate(event.endsOn, true),
    },
    eventStatus: status,
    competitionClass: details.competitionClass,
    source: {
      provider: 'Union Cycliste Internationale',
      officialUrl: event.officialUrl,
      validationMethod: 'official-calendar',
      ...(details.organizerUrl ? { organizerUrl: details.organizerUrl } : {}),
      checkedAt,
    },
  }
}

function mapBrazilianPublicEvent(event, status, checkedAt) {
  return {
    id: event.key,
    track: 'participant-calendar',
    name: event.name,
    disciplineCode: 'MTB',
    disciplineLabel: 'Mountain bike',
    countryCode: 'BRA',
    country: 'Brasil',
    venue: event.venue,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    displayDate: {
      startsOn: formatBrDate(event.startsOn),
      endsOn: formatBrDate(event.endsOn),
      endsOnWithYear: formatBrDate(event.endsOn, true),
    },
    eventStatus: status,
    competitionClass: 'MTB brasileira · prova participativa',
    source: {
      provider: event.provider,
      officialUrl: event.officialUrl,
      discoveryUrl: event.discoveryUrl,
      validationMethod: 'discovery-plus-organizer',
      checkedAt,
    },
  }
}

function sameRace(left, right) {
  return left.startsOn === right.startsOn && normalizeSeriesName(left.name) === normalizeSeriesName(right.name)
}

function mergeBrazilPriority(uciEvents, brazilEvents, limit) {
  const selected = [...brazilEvents]
  for (const event of uciEvents) {
    if (selected.length >= limit) break
    if (!selected.some((candidate) => sameRace(candidate, event))) selected.push(event)
  }
  return selected
    .sort((left, right) => left.startsOn.localeCompare(right.startsOn) || left.name.localeCompare(right.name))
    .slice(0, limit)
}

function assertSorted(events, field, direction = 'asc') {
  for (let index = 1; index < events.length; index += 1) {
    const comparison = events[index - 1][field].localeCompare(events[index][field])
    if ((direction === 'asc' && comparison > 0) || (direction === 'desc' && comparison < 0)) {
      throw new Error(`Seleção não ordenada por ${field} (${direction})`)
    }
  }
}

export function selectPublicCalendar(events, asOfDate) {
  const recentThreshold = isoDate(addDays(new Date(`${asOfDate}T12:00:00.000Z`), -30))
  const upcomingThreshold = isoDate(addDays(new Date(`${asOfDate}T12:00:00.000Z`), 90))
  const recent = events
    .filter((event) => CLASS_PRIORITY[event.classCode] && event.endsOn < asOfDate && event.endsOn >= recentThreshold)
    .sort((left, right) => right.endsOn.localeCompare(left.endsOn)
      || (CLASS_PRIORITY[right.classCode] || 0) - (CLASS_PRIORITY[left.classCode] || 0)
      || left.name.localeCompare(right.name))
    .slice(0, RECENT_MINIMUM)
  const upcoming = events
    .filter((event) => CLASS_PRIORITY[event.classCode] && event.startsOn > asOfDate && event.startsOn <= upcomingThreshold)
    .sort((left, right) => left.startsOn.localeCompare(right.startsOn)
      || (CLASS_PRIORITY[right.classCode] || 0) - (CLASS_PRIORITY[left.classCode] || 0)
      || left.name.localeCompare(right.name))
    .slice(0, UPCOMING_MINIMUM)
  const today = events
    .filter((event) => event.startsOn <= asOfDate && event.endsOn >= asOfDate)
    .sort((left, right) => (CLASS_PRIORITY[right.classCode] || 0) - (CLASS_PRIORITY[left.classCode] || 0)
      || right.startsOn.localeCompare(left.startsOn)
      || left.name.localeCompare(right.name))
    .slice(0, TODAY_MAXIMUM)

  if (recent.length < RECENT_MINIMUM || upcoming.length < UPCOMING_MINIMUM) {
    throw new Error(`Cobertura insuficiente: ${recent.length}/${RECENT_MINIMUM} recentes e ${upcoming.length}/${UPCOMING_MINIMUM} próximas`)
  }
  assertSorted(recent, 'endsOn', 'desc')
  assertSorted(upcoming, 'startsOn', 'asc')
  return { today, recent, upcoming }
}

async function enrichSelection(selection, status, checkedAt) {
  return mapWithConcurrency(selection, DETAIL_REQUEST_CONCURRENCY, async (event) => {
    const details = parseCompetitionDetails(await fetchText(event.officialUrl), event.officialUrl)
    return mapPublicEvent(event, details, status, checkedAt)
  })
}

async function collectOfficialEvents(asOfDate) {
  const currentYear = Number(asOfDate.slice(0, 4))
  const yearEndpointPairs = [
    [currentYear - 1, 'past'],
    [currentYear, 'past'],
    [currentYear, 'upcoming'],
    [currentYear + 1, 'upcoming'],
  ]
  const requests = []
  for (const [disciplineCode, classCodes] of Object.entries(CLASS_FILTERS)) {
    for (const classCode of classCodes) {
      for (const [year, endpoint] of yearEndpointPairs) {
        const query = new URLSearchParams({ discipline: disciplineCode, raceClass: classCode, year: String(year) })
        const url = `${UCI_BASE_URL}/api/calendar/${endpoint}?${query}`
        requests.push({ url, disciplineCode, classCode })
      }
    }
  }
  for (const disciplineCode of Object.keys(CLASS_FILTERS)) {
    for (const endpoint of ['past', 'upcoming']) {
      const query = new URLSearchParams({ discipline: disciplineCode, year: String(currentYear) })
      const url = `${UCI_BASE_URL}/api/calendar/${endpoint}?${query}`
      requests.push({ url, disciplineCode, classCode: '' })
    }
  }
  const rows = await mapWithConcurrency(requests, CALENDAR_REQUEST_CONCURRENCY, async (request) => {
    const payload = await fetchJson(request.url)
    return flattenCalendarResponse(payload, request.disciplineCode, request.classCode)
  })
  return mergeCalendarRows(rows.flat())
}

async function main() {
  const asOfDate = dateFromInput(cliValue('today'))
  const checkedAt = new Date().toISOString()
  const existing = JSON.parse(await fs.readFile(outputPath, 'utf8'))
  const deepProfileDocument = JSON.parse(await fs.readFile(deepProfilesPath, 'utf8'))
  if (deepProfileDocument.version !== 1 || !Array.isArray(deepProfileDocument.profiles)) throw new Error('Catálogo de perfis aprofundados inválido')
  const deepProfiles = new Map()
  for (const profile of deepProfileDocument.profiles) {
    validateDeepProfileDefinition(profile)
    if (deepProfiles.has(profile.eventId)) throw new Error(`Perfil aprofundado duplicado: ${profile.eventId}`)
    deepProfiles.set(profile.eventId, profile)
  }
  const [candidates, brazilianCandidates] = await Promise.all([
    collectOfficialEvents(asOfDate),
    collectBrazilianEvents(asOfDate),
  ])
  const selection = selectPublicCalendar(candidates, asOfDate)
  const brazilToday = brazilianCandidates
    .filter((event) => event.startsOn <= asOfDate && event.endsOn >= asOfDate)
    .slice(0, TODAY_MAXIMUM)
    .map((event) => mapBrazilianPublicEvent(event, 'today', checkedAt))
  const brazilUpcoming = brazilianCandidates
    .filter((event) => event.startsOn > asOfDate)
    .slice(0, BRAZIL_UPCOMING_TARGET)
    .map((event) => mapBrazilianPublicEvent(event, 'scheduled', checkedAt))
  if (brazilUpcoming.length < BRAZIL_UPCOMING_TARGET) {
    throw new Error(`Cobertura brasileira insuficiente: ${brazilUpcoming.length}/${BRAZIL_UPCOMING_TARGET} próximas com organizador validado`)
  }
  const uciToday = await enrichSelection(selection.today, 'today', checkedAt)
  const recent = await enrichSelection(selection.recent, 'past', checkedAt)
  const uciUpcoming = await enrichSelection(selection.upcoming, 'scheduled', checkedAt)
  const selectedToday = mergeBrazilPriority(uciToday, brazilToday, TODAY_MAXIMUM)
  const selectedUpcoming = mergeBrazilPriority(uciUpcoming, brazilUpcoming, UPCOMING_MINIMUM)
  const [today, recentWithProfiles, upcoming] = await Promise.all([
    enrichDeepProfiles(selectedToday, deepProfiles, checkedAt),
    enrichDeepProfiles(recent, deepProfiles, checkedAt),
    enrichDeepProfiles(selectedUpcoming, deepProfiles, checkedAt),
  ])
  const next = {
    ...existing,
    updatedAt: checkedAt,
    publicCalendar: {
      generatedAt: checkedAt,
      asOfDate,
      asOfDateDisplay: formatBrDate(asOfDate, true),
      timezone: CALENDAR_TIMEZONE,
      sourceStatus: 'verified',
      selectionPolicy: 'Agenda combinada: próximas provas mantêm maioria brasileira, validada por descoberta e confirmação do organizador; UCI completa a cobertura mundial. Recentes permanecem na fonte oficial UCI.',
      today,
      recent: recentWithProfiles,
      upcoming,
    },
  }
  const serialized = `${JSON.stringify(next, null, 2)}\n`
  if (process.argv.includes('--stdout')) {
    process.stdout.write(serialized)
    return
  }
  const temporaryPath = `${outputPath}.${process.pid}.tmp`
  try {
    await fs.writeFile(temporaryPath, serialized, 'utf8')
    await fs.rename(temporaryPath, outputPath)
  } finally {
    await fs.rm(temporaryPath, { force: true })
  }
  process.stdout.write(`Calendário sincronizado: ${today.length} em disputa hoje + ${recent.length} recentes + ${upcoming.length} próximas, com ${upcoming.filter((event) => event.countryCode === 'BRA').length} brasileiras (${asOfDate}).\n`)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main().catch((error) => {
  console.error(`Sincronização de corridas bloqueada: ${error.message}`)
  process.exitCode = 1
})

export {
  CLASS_FILTERS,
  brazilianEventFromJsonLd,
  calendarioMtbDetailLinks,
  calendarioMtbPageCount,
  dateInTimeZone,
  decodeHtmlAttribute,
  flattenCalendarResponse,
  mergeCalendarRows,
  mergeBrazilPriority,
  officialOrganizerConfirmsEvent,
  parseCompetitionDetails,
  parseJsonLdEvents,
}
