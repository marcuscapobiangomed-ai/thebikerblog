import assert from 'node:assert/strict'
import {
  dateInTimeZone,
  decodeHtmlAttribute,
  flattenCalendarResponse,
  mergeCalendarRows,
  parseCompetitionDetails,
  selectPublicCalendar,
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

console.log('Sincronização pública de corridas validada com seleção cronológica e fail-closed.')
