import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(projectRoot, '_data', 'race-events.json')
const UCI_BASE_URL = 'https://www.uci.org'
const RECENT_MINIMUM = 3
const UPCOMING_MINIMUM = 10
const TODAY_MAXIMUM = 3
const CALENDAR_REQUEST_CONCURRENCY = 6
const DETAIL_REQUEST_CONCURRENCY = 4
const CALENDAR_TIMEZONE = 'America/Sao_Paulo'

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
      ...(details.organizerUrl ? { organizerUrl: details.organizerUrl } : {}),
      checkedAt,
    },
  }
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
  const candidates = await collectOfficialEvents(asOfDate)
  const selection = selectPublicCalendar(candidates, asOfDate)
  const today = await enrichSelection(selection.today, 'today', checkedAt)
  const recent = await enrichSelection(selection.recent, 'past', checkedAt)
  const upcoming = await enrichSelection(selection.upcoming, 'scheduled', checkedAt)
  const next = {
    ...existing,
    updatedAt: checkedAt,
    publicCalendar: {
      generatedAt: checkedAt,
      asOfDate,
      asOfDateDisplay: formatBrDate(asOfDate, true),
      timezone: CALENDAR_TIMEZONE,
      sourceStatus: 'verified',
      selectionPolicy: 'Agenda UCI de estrada e MTB: provas em disputa na data, entradas recentes e próximas provas de maior classe.',
      today,
      recent,
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
  process.stdout.write(`Calendário UCI sincronizado: ${today.length} em disputa hoje + ${recent.length} recentes + ${upcoming.length} próximas (${asOfDate}).\n`)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main().catch((error) => {
  console.error(`Sincronização de corridas bloqueada: ${error.message}`)
  process.exitCode = 1
})

export {
  CLASS_FILTERS,
  dateInTimeZone,
  decodeHtmlAttribute,
  flattenCalendarResponse,
  mergeCalendarRows,
  parseCompetitionDetails,
}
