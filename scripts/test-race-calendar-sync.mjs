import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
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
  selectPublicCalendar,
  verifyDeepProfileEvidence,
} from './sync-race-calendar.mjs'

assert.equal(dateInTimeZone(new Date('2026-08-12T01:30:00.000Z')), '2026-08-11', 'início da noite no Brasil não pode avançar o calendário para o dia UTC seguinte')
assert.equal(dateInTimeZone(new Date('2026-08-12T03:30:00.000Z')), '2026-08-12', 'calendário deve avançar depois da meia-noite de São Paulo')

const payload = {
  items: [{
    items: [{
      competitionDate: '2026-08-13T00:00:00Z',
      items: [{
        name: 'Arctic Race of Norway',
        venue: '',
        country: 'NOR',
        detailsLink: { url: '/competition-details/2026/ROA/78339' },
      }],
    }, {
      competitionDate: '2026-08-14T00:00:00Z',
      items: [{
        name: 'Arctic Race of Norway',
        venue: '',
        country: 'NOR',
        detailsLink: { url: '/competition-details/2026/ROA/78339' },
      }],
    }],
  }],
}

const rows = flattenCalendarResponse(payload, 'ROA', '2.Pro')
assert.equal(rows.length, 2)
const merged = mergeCalendarRows(rows)
assert.equal(merged.length, 1)
assert.equal(merged[0].startsOn, '2026-08-13')
assert.equal(merged[0].endsOn, '2026-08-14')
assert.equal(merged[0].officialUrl, 'https://www.uci.org/competition-details/2026/ROA/78339')

const candidates = [
  ['recent-1', '2026-08-09', '2.UWT'],
  ['recent-2', '2026-08-09', '2.WWT'],
  ['recent-3', '2026-08-08', '2.Pro'],
  ['today-proseries', '2026-08-11', '2.Pro'],
  ['today-class-1', '2026-08-11', ''],
  ...Array.from({ length: 10 }, (_, index) => [`upcoming-${index + 1}`, `2026-08-${String(index + 13).padStart(2, '0')}`, index === 9 ? '2.UWT' : '1.Pro']),
].map(([name, date, classCode], index) => ({
  key: `/competition-details/2026/ROA/${70000 + index}`,
  name,
  venue: '',
  countryCode: 'BRA',
  startsOn: date,
  endsOn: date,
  disciplineCode: 'ROA',
  classCode,
  officialUrl: `https://www.uci.org/competition-details/2026/ROA/${70000 + index}`,
}))

const selected = selectPublicCalendar(candidates, '2026-08-11')
assert.equal(selected.today.length, 2)
assert.equal(selected.today[0].name, 'today-proseries', 'prova de maior classe deve aparecer primeiro no card de hoje')
assert.equal(selected.recent.length, 3)
assert.equal(selected.upcoming.length, 10)
assert.deepEqual(selected.upcoming.map((event) => event.startsOn), [...selected.upcoming.map((event) => event.startsOn)].sort())
assert.throws(() => selectPublicCalendar(candidates.slice(0, -1), '2026-08-11'), /Cobertura insuficiente/)

const props = {
  competitionDetails: {
    name: 'Arctic Race of Norway',
    country: 'Norway',
    venue: '',
    competitionClass: '2.Pro - Stages - UCI ProSeries',
    website: { url: 'https://www.arctic-race.com' },
  },
}
const encoded = JSON.stringify(props).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
const parsed = parseCompetitionDetails(`<div data-component="CompetitionDetailsModule" data-props="${encoded}"></div>`, 'https://www.uci.org/example')
assert.equal(parsed.name, 'Arctic Race of Norway')
assert.equal(parsed.organizerUrl, 'https://www.arctic-race.com')
assert.equal(decodeHtmlAttribute('&quot;UCI &amp; TheBiker&quot;'), '"UCI & TheBiker"')
assert.throws(() => flattenCalendarResponse({}, 'ROA', '2.Pro'), /Contrato UCI inválido/)
assert.throws(() => parseCompetitionDetails('<html></html>', 'https://www.uci.org/example'), /CompetitionDetailsModule/)

const brazilDiscoveryUrl = 'https://www.calendariomtb.com.br/evento/Desafio-Brou-Mariana-2026/10616/'
const brazilJsonLd = {
  '@type': 'Event',
  name: 'Desafio Brou Mariana 2026',
  startDate: '2026-08-16',
  endDate: '2026-08-16',
  location: { name: 'Mariana (MG)', address: { addressCountry: 'BR' } },
  offers: { url: 'https://www.brouaventuras.com.br' },
  organizer: { name: 'Brou Aventuras' },
}
const discoveryHtml = `<a href="/evento/Desafio-Brou-Mariana-2026/10616/" title="Desafio Brou Mariana 2026">Evento</a><a href="?page=2">2</a><script type="application/ld+json">${JSON.stringify(brazilJsonLd)}</script>`
assert.equal(calendarioMtbPageCount(discoveryHtml), 2)
assert.deepEqual(calendarioMtbDetailLinks(discoveryHtml), [{ sourceId: '10616', discoveryUrl: brazilDiscoveryUrl }])
assert.deepEqual(parseJsonLdEvents(discoveryHtml, brazilDiscoveryUrl), brazilJsonLd)
const brazilian = brazilianEventFromJsonLd(brazilJsonLd, { sourceId: '10616', discoveryUrl: brazilDiscoveryUrl })
assert.equal(brazilian.key, 'br-mtb-10616')
assert.equal(brazilian.venue, 'Mariana/MG')
assert.equal(officialOrganizerConfirmsEvent(brazilian, '<main>Desafio Brou MTB Mariana 2026 — Mariana — 16 de agosto</main>'), true)
assert.equal(officialOrganizerConfirmsEvent(brazilian, '<main>Desafio Brou MTB Mariana 2026 — Mariana — 15 de agosto</main>'), false)
const rangeFixture = { ...brazilian, startsOn: '2026-08-22', endsOn: '2026-08-23', venue: 'Pirenópolis/GO' }
assert.equal(officialOrganizerConfirmsEvent(rangeFixture, '<main>MTB em Pirenópolis: 22 a 23 de agosto</main>'), true)
assert.equal(officialOrganizerConfirmsEvent(rangeFixture, '<main>MTB em Pirenópolis: 21 a 23 de agosto</main>'), false, 'divergência do organizador deve bloquear a descoberta')
assert.throws(() => brazilianEventFromJsonLd({ ...brazilJsonLd, name: 'WOS Trail Run' }, { sourceId: '1', discoveryUrl: brazilDiscoveryUrl }), /exclusivamente de trail run/)
const mixedUpcoming = mergeBrazilPriority(
  [{ name: 'World race', startsOn: '2026-08-17' }],
  [{ name: brazilian.name, startsOn: brazilian.startsOn }],
  2,
)
assert.deepEqual(mixedUpcoming.map((event) => event.name), [brazilian.name, 'World race'])

const deepProfiles = JSON.parse(fs.readFileSync(new URL('../_data/race-deep-profiles.json', import.meta.url), 'utf8'))
const voltaProfile = deepProfiles.profiles.find((profile) => profile.eventId === 'uci-2026-roa-78327')
const voltaEvent = {
  id: voltaProfile.eventId,
  name: voltaProfile.eventName,
  startsOn: voltaProfile.validFrom,
  endsOn: voltaProfile.validThrough,
}
const deepEvidence = voltaProfile.source.verificationTokens.join(' | ')
const verifiedProfile = verifyDeepProfileEvidence(voltaProfile, voltaEvent, deepEvidence, '2026-08-11T20:01:29.236Z')
assert.equal(verifiedProfile.status, 'verified')
assert.equal(verifiedProfile.route.totalDistanceKm, 1388)
assert.equal(verifiedProfile.route.stages.reduce((sum, stage) => sum + stage.distanceKm, 0), 1388)
assert.deepEqual(verifiedProfile.route.restSchedule, [{ date: '2026-08-11', label: 'Dia de descanso', location: 'Santa Maria da Feira (Europarque)' }])
assert.equal(verifiedProfile.participation.status, 'team-only')
const entityEncodedEvidence = '1,388 quil&oacute;metros no total | Pr&oacute;logo - Lisboa | Lourinh&atilde; &gt; Sintra | Maia &gt; Porto | 10 quil&oacute;metros e uma inclina&ccedil;&atilde;o m&eacute;dia de 6,5%'
assert.equal(verifyDeepProfileEvidence(voltaProfile, voltaEvent, entityEncodedEvidence, '2026-08-11T20:01:29.236Z').status, 'verified')
assert.throws(() => verifyDeepProfileEvidence(voltaProfile, voltaEvent, 'página oficial sem percurso', '2026-08-11T20:01:29.236Z'), /não confirma/)

console.log('Sincronização pública de corridas validada com prioridade brasileira, seleção cronológica e fail-closed.')
