import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const POSTS = path.join(ROOT, '_posts')
const TARGET_TOKENS = 300
const MAX_TOKENS = 420
const args = new Set(process.argv.slice(2))
const strictLegacy = args.has('--strict-legacy')

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function parsePost(relativePath) {
  const source = read(relativePath)
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
  if (!match) throw new Error(`Front matter ausente: ${relativePath}`)
  return { data: loadYaml(match[1]) || {}, body: match[2] }
}

function clean(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}/g, '')
    .replace(/^\s*[-|>]+\s*/gm, '')
    .replace(/[*_#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function approxTokens(value) {
  const text = clean(value)
  if (!text) return 0
  // Approximation for a preflight only. Portuguese tokenization varies by model;
  // the purpose is to find isolated, oversized or underspecified passages.
  return Math.ceil(text.split(/\s+/).length * 1.25)
}

function splitSections(body) {
  const sections = []
  let heading = 'Introdução'
  let paragraphLines = []

  const flushParagraph = () => {
    const paragraph = paragraphLines.join('\n').trim()
    if (paragraph) sections[sections.length - 1].paragraphs.push(paragraph)
    paragraphLines = []
  }

  const startSection = (nextHeading) => {
    flushParagraph()
    heading = nextHeading
    sections.push({ heading, paragraphs: [] })
  }

  sections.push({ heading, paragraphs: [] })
  for (const line of String(body || '').split(/\r?\n/)) {
    const match = line.match(/^#{2,6}\s+(.+)$/)
    if (match) {
      startSection(match[1].trim())
    } else if (!line.trim()) {
      flushParagraph()
    } else {
      paragraphLines.push(line)
    }
  }
  flushParagraph()
  return sections.filter((section) => section.paragraphs.length > 0)
}

function makeChunks(body) {
  const chunks = []
  for (const section of splitSections(body)) {
    // A bibliography is a destination for verification, not a claim block.
    // It should not be scored as if it were an isolated answer passage.
    if (/^(?:fontes|fontes consultadas|refer[eê]ncias|de onde v[eê]m os dados)/iu.test(section.heading)) continue
    let current = [section.heading]
    let currentTokens = approxTokens(section.heading)
    for (const paragraph of section.paragraphs) {
      const nextTokens = approxTokens(paragraph)
      const shouldFlush = current.length > 1
        && currentTokens >= TARGET_TOKENS * 0.6
        && currentTokens + nextTokens > MAX_TOKENS
      if (shouldFlush) {
        chunks.push({ heading: section.heading, text: current.join('\n\n') })
        current = [section.heading]
        currentTokens = approxTokens(section.heading)
      }
      current.push(paragraph)
      currentTokens += nextTokens
    }
    if (current.length > 1) chunks.push({ heading: section.heading, text: current.join('\n\n') })
  }
  return chunks
}

function entityTerms(data, heading) {
  const values = [data.brand, data.product_name, data.title, heading]
    .flatMap((value) => String(value || '').split(/[|,:/()]+/))
    .map((value) => clean(value))
    .filter((value) => value.length >= 4)
  return [...new Set(values)]
}

function hasEntity(text, data, heading) {
  const lower = text.toLocaleLowerCase('pt-BR')
  return entityTerms(data, heading).some((term) => lower.includes(term.toLocaleLowerCase('pt-BR')))
}

function orphanPronouns(text, data, heading) {
  const candidates = []
  const explicitEntity = hasEntity(text, data, heading)
  const pattern = /\b(isso|isto|aquilo|eles|elas|este|esta|estes|estas|esse|essa|esses|essas|a empresa|a marca|o fabricante|o modelo)\b/giu
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, match.index - 90), match.index)
    const startsSentence = !before.trim() || /[.!?]\s*$/.test(before)
    if (startsSentence && !explicitEntity) candidates.push(match[0])
  }
  return [...new Set(candidates.map((value) => value.toLocaleLowerCase('pt-BR')))]
}

function hasQuantifiedClaim(text) {
  return /\b\d+(?:[.,]\d+)?\s*(?:mm|cm|kg|g|km\/h|km|%|v|velocidades?|pist(?:ões|oes)|modos?|anos?)\b/iu.test(text)
}

function hasEvidenceCue(text, sourceUrls) {
  const lower = text.toLocaleLowerCase('pt-BR')
  return sourceUrls.some((url) => text.includes(url))
    || /\b(?:fonte|fontes|manual|ficha|documenta(?:ção|cao)|consultad[ao]s?|registra|evidência|evidencia|segundo)\b/iu.test(lower)
}

function hasInternalLink(raw) {
  return /(?:href=["']\/(?!\/)|\]\(\/(?!\/))/i.test(raw)
}

function analyzeChunk(chunk, data, sourceUrls) {
  const text = clean(chunk.text)
  const tokens = approxTokens(text)
  const orphans = orphanPronouns(text, data, chunk.heading)
  const startsWeakly = /^(?:isso|isto|aquilo|eles|elas|este|esta|esse|essa|al[eé]m disso|nesse caso|como vimos|por isso)\b/iu.test(text.replace(/^\s*/, ''))
  const standalone = !startsWeakly && tokens >= 45
  const quantifiedClaim = hasQuantifiedClaim(text)
  const evidenceInChunk = !quantifiedClaim || hasEvidenceCue(chunk.text, sourceUrls)
  const entityPresent = hasEntity(text, data, chunk.heading)
  const score = (standalone ? 0 : 2)
    + orphans.length * 2
    + (entityPresent ? 0 : 1)
    + (evidenceInChunk ? 0 : 2)
    + (tokens > MAX_TOKENS ? 1 : 0)
  return {
    heading: chunk.heading,
    approxTokens: tokens,
    staysAlone: standalone ? 'sim' : 'não',
    orphanPronouns: orphans,
    entityPresent,
    quantifiedClaim,
    evidenceInChunk,
    citableAsIs: score === 0,
    score,
    preview: text.slice(0, 180),
  }
}

function postFiles() {
  const requested = [...args].find((value) => value.startsWith('--file='))?.slice(7)
  if (requested) return [requested.startsWith('_posts/') ? requested : `_posts/${requested}`]
  return fs.readdirSync(POSTS)
    .filter((name) => /\.(md|html)$/.test(name))
    .map((name) => `_posts/${name}`)
}

const rows = []
for (const relativePath of postFiles()) {
  const { data, body } = parsePost(relativePath)
  if (!args.has('--all') && (data.published === false || data.status === 'draft' || data.editorial_status === 'draft')) continue
  const sourceUrls = (Array.isArray(data.sources) ? data.sources : [])
    .map((source) => String(source?.url || '').trim())
    .filter(Boolean)
  const chunks = makeChunks(body).map((chunk) => analyzeChunk(chunk, data, sourceUrls))
  const weak = chunks.filter((chunk) => !chunk.citableAsIs).sort((a, b) => b.score - a.score || b.approxTokens - a.approxTokens)
  const legacy = (data.editorial_format || 'full-article-v1') !== 'full-article-v2'
  const actionableWeak = legacy && !strictLegacy ? [] : weak
  rows.push({
    file: relativePath,
    editorialFormat: data.editorial_format || 'legacy',
    legacy,
    chunks: chunks.length,
    citableChunks: legacy && !strictLegacy ? null : chunks.filter((chunk) => chunk.citableAsIs).length,
    weakChunks: actionableWeak.length,
    legacyCandidates: legacy ? weak.length : 0,
    internalLinks: hasInternalLink(body),
    topWeakChunks: actionableWeak.slice(0, 3),
  })
}

if (args.has('--json')) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log(`Preflight de citabilidade: ${rows.length} artigo(s)`)
  for (const row of rows) {
    if (row.legacy && !strictLegacy) {
      console.log(`\n${row.file} [legacy] — ${row.chunks} blocos; ${row.legacyCandidates} candidato(s) à migração v2 (informativo)`)
      continue
    }
    console.log(`\n${row.file} [${row.editorialFormat}] — ${row.citableChunks}/${row.chunks} blocos citáveis; ${row.weakChunks} para corrigir automaticamente`)
    for (const chunk of row.topWeakChunks) {
      const reasons = [
        chunk.staysAlone === 'não' ? 'dependência de contexto' : '',
        chunk.orphanPronouns.length ? `referências órfãs: ${chunk.orphanPronouns.join(', ')}` : '',
        !chunk.entityPresent ? 'entidade implícita' : '',
        !chunk.evidenceInChunk ? 'afirmação quantificada sem evidência local' : '',
        chunk.approxTokens > MAX_TOKENS ? 'bloco grande' : '',
      ].filter(Boolean).join('; ')
      console.log(`  - ${chunk.heading} (~${chunk.approxTokens} tokens): ${reasons || 'revisão'} — ${chunk.preview}`)
    }
  }
}
