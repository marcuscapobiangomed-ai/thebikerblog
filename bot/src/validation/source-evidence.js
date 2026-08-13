import { PDFParse } from 'pdf-parse'

const MAX_REDIRECTS = 5
const MAX_SOURCE_BYTES = 12 * 1024 * 1024

function normalized(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function sourceReferences(fact) {
  return [...new Set([
    fact?.source_id,
    fact?.sourceId,
    fact?.source,
    ...(Array.isArray(fact?.source_ids) ? fact.source_ids : []),
    ...(Array.isArray(fact?.sourceIds) ? fact.sourceIds : []),
  ].map((value) => String(value || '').trim()).filter(Boolean))]
}

async function responseBytes(response) {
  const length = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(length) && length > MAX_SOURCE_BYTES) throw new Error(`fonte excede ${MAX_SOURCE_BYTES} bytes`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_SOURCE_BYTES) throw new Error(`fonte excede ${MAX_SOURCE_BYTES} bytes`)
  return buffer
}

async function readableText(response) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase()
  const bytes = await responseBytes(response)
  const isPdf = contentType.includes('application/pdf') || bytes.subarray(0, 5).toString() === '%PDF-'
  if (!isPdf) {
    if (contentType && !contentType.includes('text/') && !contentType.includes('html') && !contentType.includes('json')) {
      throw new Error(`tipo de conteudo nao verificavel: ${contentType}`)
    }
    return bytes.toString('utf8')
  }
  const parser = new PDFParse({ data: bytes })
  try {
    return (await parser.getText()).text
  } finally {
    await parser.destroy()
  }
}

async function retrieveSource(fetchImpl, initialUrl, { allowedSource, timeoutMs }) {
  let current = new URL(initialUrl)
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (current.protocol !== 'https:' || !allowedSource(current.href)) throw new Error(`destino nao permitido: ${current.href}`)
    const response = await fetchImpl(current.href, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8',
        'User-Agent': 'TheBikerBlog-SourceVerifier/1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.('location')
      if (!location) throw new Error('redirecionamento sem destino')
      current = new URL(location, current)
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status || 'desconhecido'}`)
    const finalUrl = new URL(response.url || current.href)
    if (finalUrl.protocol !== 'https:' || !allowedSource(finalUrl.href)) throw new Error(`destino final nao permitido: ${finalUrl.href}`)
    return { finalUrl: finalUrl.href, text: await readableText(response) }
  }
  throw new Error(`mais de ${MAX_REDIRECTS} redirecionamentos`)
}

export async function verifyResearchEvidence(research, {
  fetchImpl = fetch,
  allowedSource,
  requireExcerpts = true,
  timeoutMs = 30000,
} = {}) {
  if (typeof allowedSource !== 'function') throw new Error('allowedSource e obrigatorio')
  const verified = new Map()
  const rejected = []
  for (const source of research.sources || []) {
    try {
      const result = await retrieveSource(fetchImpl, source.url, { allowedSource, timeoutMs })
      const value = { source: { ...source, url: result.finalUrl }, text: normalized(result.text) }
      verified.set(String(source.id || source.name), value)
      if (source.name) verified.set(String(source.name), value)
    } catch (error) {
      rejected.push(`${source.id || source.name}: ${error.message}`)
    }
  }

  const retainedFacts = []
  let unsupportedFacts = 0
  for (const fact of research.confirmed_facts || []) {
    const references = sourceReferences(fact)
    const evidence = normalized(fact?.evidence_quote)
    const supported = references.length > 0 && references.every((reference) => {
      const source = verified.get(reference)
      return source && (!requireExcerpts || (evidence.length >= 12 && source.text.includes(evidence)))
    })
    if (supported) retainedFacts.push(fact)
    else unsupportedFacts += 1
  }

  const referenced = new Set(retainedFacts.flatMap(sourceReferences))
  const sources = [...new Map(
    [...verified.entries()].filter(([reference]) => referenced.has(reference)).map(([, value]) => [value.source.id || value.source.name, value.source]),
  ).values()]
  return {
    ...research,
    sources,
    confirmed_facts: retainedFacts,
    limitations: [
      ...(Array.isArray(research.limitations) ? research.limitations : []),
      ...(rejected.length > 0 ? [`Fontes rejeitadas pela verificacao ativa: ${rejected.join('; ')}`] : []),
      ...(unsupportedFacts > 0 ? [`${unsupportedFacts} fato(s) removido(s) por falta de trecho verificavel na fonte recuperada.`] : []),
    ],
    grounding: {
      ...(research.grounding || {}),
      sourceCount: sources.length,
      evidenceContract: requireExcerpts ? 'retrieved-excerpt-v1' : 'retrieved-source-v1',
      verifiedAt: new Date().toISOString(),
    },
  }
}
