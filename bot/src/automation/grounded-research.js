import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateResearch } from '../schemas/research.schema.js'
import { assertResearchGrounding, pruneUnsupportedFacts } from '../validation/research-grounding.js'
import { verifyResearchEvidence } from '../validation/source-evidence.js'

const PRODUCT_DOMAINS = ['thebikershop.com.br', 'scott-sports.com', 'syncros.com', 'bike.shimano.com', 'si.shimano.com', 'sram.com', 'rockshox.com', 'ridefox.com', 'maxxis.com', 'oggi.com.br']
const SPORT_DOMAINS = ['uci.org', 'cbc.esp.br', 'ucimtbworldseries.com', 'olympics.com']
const REGULATORY_DOMAINS = ['gov.br']
const PORTFOLIO_CATEGORY_URLS = {
  'manutencao-ajustes': 'https://thebikershop.com.br/componentes/',
  componentes: 'https://thebikershop.com.br/componentes/',
  engenharia: 'https://thebikershop.com.br/bikes/',
  review: 'https://thebikershop.com.br/bikes/',
  comparativo: 'https://thebikershop.com.br/bikes/',
  lancamentos: 'https://thebikershop.com.br/bikes/',
  competicoes: 'https://thebikershop.com.br/',
}

const CURATED_TOPIC_EVIDENCE = [
  {
    pattern: /press[aã]o|pneu|terreno|gravel|asfalto/i,
    id: 'official-tire-pressure-guidance',
    facts: {
      factors: 'A pressão deve considerar modalidade, piso seco ou molhado, peso total, largura e construção do pneu e características do aro.',
      startingPoint: 'Recomendações calculadas são ponto de partida e devem ser refinadas dentro dos limites do fabricante.',
      roughTerrain: 'Pisos irregulares e condições molhadas podem favorecer pressão menor para ampliar contato, controle e conforto, sem permitir impacto do pneu no aro ou instabilidade em curvas.',
      frontRear: 'A distribuição de carga normalmente justifica avaliar pressões diferentes nos pneus dianteiro e traseiro.',
    },
    sources: [
      { name: 'Shimano — What Tire Pressure is Right for You?', type: 'manufacturer', url: 'https://bike.shimano.com/en-NA/stories/article/what-tire-pressure-is-right-for-you.html' },
      { name: 'SRAM/Zipp — How To Calculate Tire Pressure', type: 'manufacturer', url: 'https://www.sram.com/en/zipp/learn/how-to-calculate-tire-pressure' },
      { name: 'SRAM/Zipp — Know Your Tire Pressure', type: 'manufacturer', url: 'https://www.sram.com/en/zipp/campaigns/know-your-tire-pressure' },
    ],
  },
  {
    pattern: /chuva|molhad|lama|p[oó]s[- ]?pedal|inspe[cç][aã]o/i,
    id: 'official-wet-ride-maintenance-guidance',
    facts: {
      drivetrainCleaning: 'Após uso em condições adversas, a transmissão deve ser limpa com produto biodegradável não ácido, enxaguada, seca e a corrente deve ser lubrificada com o excesso removido.',
      pressureWashing: 'Jatos de alta pressão devem ser evitados para proteger componentes, vedações e rolamentos.',
      brakeInspection: 'Antes de pedalar, confirme funcionamento dos freios, ausência de vazamento, integridade do rotor, espessura das pastilhas e ausência de ruídos anormais.',
      wetBraking: 'Em piso molhado, a distância de frenagem aumenta; reduza a velocidade e acione os freios mais cedo e de forma suave.',
      escalation: 'Danos, vazamentos, ruídos anormais ou funcionamento irregular exigem avaliação da loja ou de mecânico qualificado.',
    },
    evidenceQuotes: {
      drivetrainCleaning: 'Use only biodegradable non-acidic cleaners to clean the cassette, chainring, and chain. Rinse thoroughly with water and wipe dry.',
      pressureWashing: 'Avoid direct pressure washing to protect the components as you would with all the seals and bearings on any bike.',
      brakeInspection: 'Brake pads and rotors only take a minute to check every few rides.',
      wetBraking: 'The required braking distance will be longer during wet conditions.',
      escalation: 'If any damage is found, consult your dealer for further inspection.',
    },
    sources: [
      { name: 'SRAM — AXS Bike Care and Maintenance', type: 'manufacturer', url: 'https://www.sram.com/en/learn/axs-bike-care-and-maintenance' },
      { name: 'SRAM — Apex Maintenance', type: 'manufacturer', url: 'https://www.sram.com/en/learn/apex-d1-welcome-guide/maintenance' },
      { name: 'Shimano — Hydraulic Disc Brake User Manual', type: 'manufacturer', url: 'https://si.shimano.com/en/pdfs/um/04L0A/UM-04L0A-000-00-ENG.pdf' },
    ],
  },
]

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

async function loadCampaignResearchCache({ item, today, contentType, env }) {
  if (String(env.CAMPAIGN_CURATED_OFFLINE_FALLBACK || 'false').toLowerCase() === 'false') return null
  const filename = `${item.id}.json`
  const directories = [
    path.resolve(process.cwd(), 'content/research/campaign'),
    path.resolve(process.cwd(), '../content/research/campaign'),
    path.join(REPOSITORY_ROOT, 'content/research/campaign'),
  ]
  let cached = null
  for (const directory of directories) {
    try {
      cached = JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8'))
      break
    } catch {
      // O cache é opcional; a pesquisa interna continua sendo a próxima camada.
    }
  }
  if (!cached || (cached.slug && cached.slug !== item.id)) return null

  const rawSources = Array.isArray(cached.sources) ? cached.sources : []
  const sourceIdMap = new Map()
  const sources = rawSources.map((source, index) => {
    const url = String(source?.url || '').trim()
    if (!url) return null
    const originalId = String(source?.id || index + 1)
    const id = `cache-src-${index + 1}`
    sourceIdMap.set(originalId, id)
    return {
      id,
      name: String(source.name || `Fonte oficial ${index + 1}`),
      type: ['manufacturer', 'distributor', 'store', 'official-website', 'import-data'].includes(source.type)
        ? source.type
        : 'official-website',
      url,
      accessed: String(source.accessed || source.accessed_at || source.accessedAt || today),
    }
  }).filter(Boolean)
  if (sources.length === 0) return null
  const sourceIds = sources.map((source) => source.id)
  const rawFacts = Array.isArray(cached.confirmed_facts)
    ? cached.confirmed_facts
    : Object.entries(cached.confirmed_facts || {}).map(([key, value]) => ({
      fact: `${key}: ${typeof value === 'object' ? (value.statement || value.value || JSON.stringify(value)) : value}`,
      source_ids: typeof value === 'object' ? value.source_ids || value.sourceIds || [] : [],
    }))
  const confirmedFacts = rawFacts.map((entry) => {
    const fact = typeof entry === 'string'
      ? entry
      : String(entry?.fact || entry?.statement || entry?.value || '').trim()
    if (!fact) return null
    const referenced = Array.isArray(entry?.source_ids)
      ? entry.source_ids.map((id) => sourceIdMap.get(String(id)) || String(id)).filter((id) => sourceIds.includes(id))
      : []
    return {
      fact,
      source_ids: referenced.length > 0 ? [...new Set(referenced)] : sourceIds,
      ...(entry?.evidence_quote ? { evidence_quote: String(entry.evidence_quote) } : {}),
    }
  }).filter(Boolean)
  if (confirmedFacts.length === 0) return null

  const normalized = {
    ...cached,
    slug: item.id,
    title: item.title,
    content_type: contentType,
    review_method: 'desk-research',
    tested_by_thebikerblog: false,
    market: 'Brasil',
    generated_at: today,
    status: 'pesquisa_concluida',
    confirmed_facts: confirmedFacts,
    sources,
    limitations: [
      ...(Array.isArray(cached.limitations) ? cached.limitations : []),
      'Pesquisa de rede indisponível; esta execução reutilizou somente a ficha editorial oficial previamente validada.',
    ],
    grounding: {
      ...(cached.grounding || {}),
      queries: [],
      sourceCount: sources.length,
      fallback: 'campaign-research-offline-cache-v1',
      evidenceContract: 'campaign-research-cache-v1',
      verifiedAt: new Date().toISOString(),
      verificationMode: 'campaign-offline-cache',
      claimContract: 'explicit-units-v1',
    },
    ...portfolioEvidenceFor(item, today),
  }
  return assertResearchGrounding(validateResearch(normalized), { requireFactReferences: true })
}

function extractJson(text) {
  const clean = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(clean) } catch {
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1))
    throw new Error('Pesquisa fundamentada não retornou JSON válido')
  }
}

function allowedSource(url, raceCoverage) {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  return [...PRODUCT_DOMAINS, ...REGULATORY_DOMAINS, ...(raceCoverage ? SPORT_DOMAINS : [])].some((domain) => host === domain || host.endsWith(`.${domain}`))
}

function compactEvidence(records) {
  return records.slice(0, 3).map((record) => ({
    id: record.id,
    name: record.name || record.title || record.productName,
    facts: Object.fromEntries(Object.entries(record.facts || {}).slice(0, 5)),
    sources: (record.sources || []).slice(0, 2).map((source) => ({ name: source.name, url: source.url })),
  }))
}

function curatedEvidence(item, today) {
  const subject = `${item.id || ''} ${item.title || ''} ${item.summary || ''}`
  return CURATED_TOPIC_EVIDENCE
    .filter((entry) => entry.pattern.test(subject))
    .map((entry) => ({
      id: entry.id,
      facts: entry.facts,
      evidenceQuotes: entry.evidenceQuotes,
      sources: entry.sources.map((source) => ({ ...source, accessedAt: today })),
    }))
}

export function portfolioEvidenceFor(item, today) {
  return {
    portfolio_evidence_url: PORTFOLIO_CATEGORY_URLS[item.category] || 'https://www.thebiker.com.br/',
    portfolio_verified_at: today,
    portfolio_evidence_scope: item.category === 'competicoes' ? 'race-coverage' : 'portfolio-category',
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function fetchGrounded(fetchImpl, url, init, env) {
  const attempts = Math.max(1, Number(env.AI_HTTP_RETRY_ATTEMPTS || 3))
  const timeoutMs = Math.max(1000, Number(env.AI_HTTP_TIMEOUT_MS || 120000))
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      const parseFailure = response.status === 400 && /output_parse_failed|parsing failed/i.test(await response.clone().text())
      if ((!RETRYABLE_STATUS.has(response.status) && !parseFailure) || attempt === attempts) return response
      const retryAfter = Number(response.headers?.get?.('retry-after'))
      await response.text()
      const retryDelay = Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, 30000)
        : response.status === 429
          ? Math.max(0, Number(env.GROQ_RETRY_AFTER_DEFAULT_MS || 15000))
          : 1000 * (2 ** (attempt - 1))
      await wait(retryDelay)
    } catch (error) {
      lastError = error
      if (attempt === attempts) throw error
      await wait(750 * (2 ** (attempt - 1)))
    }
  }
  throw lastError || new Error('Pesquisa oficial sem resposta')
}


async function internalResearch({ item, internalEvidence, today, contentType, reason, raceCoverage = false, fetchImpl = fetch, env = process.env }) {
  const curated = curatedEvidence(item, today)
  const evidence = [...internalEvidence, ...curated]
  const sourceMap = new Map()
  const confirmedFacts = []
  for (const record of evidence) {
    const sourceIds = []
    const recordSourceIds = new Map()
    for (const source of record.sources || []) {
      if (!source.url || !allowedSource(source.url, raceCoverage)) continue
      if (!sourceMap.has(source.url)) {
        sourceMap.set(source.url, {
          id: `internal-src-${sourceMap.size + 1}`,
          name: source.name,
          type: source.type || 'official-website',
          url: source.url,
          accessed: source.accessedAt || today,
        })
      }
      sourceIds.push(sourceMap.get(source.url).id)
      recordSourceIds.set(source.id, sourceMap.get(source.url).id)
    }
    for (const [field, detail] of Object.entries(record.facts || {})) {
      if (detail?.status && detail.status !== 'confirmed') continue
      const value = detail && typeof detail === 'object' && 'value' in detail ? detail.value : detail
      const unit = detail && typeof detail === 'object' ? detail.unit : null
      const factSources = Array.isArray(detail?.sourceIds)
        ? detail.sourceIds.map((id) => recordSourceIds.get(id)).filter(Boolean)
        : sourceIds
      const display = Array.isArray(value) ? value.join(', ') : String(value ?? '')
      const lookup = `${display}${unit ? ` ${unit}` : ''}`.trim()
      if (lookup && factSources.length > 0) confirmedFacts.push({
        fact: `${field}: ${lookup}`,
        ...(record.evidenceQuotes?.[field] ? { evidence_quote: record.evidenceQuotes[field] } : {}),
        evidence_lookup: lookup,
        evidence_candidate_ids: [...new Set(sourceIds)],
        source_ids: [...new Set(factSources)],
      })
    }
  }
  const sources = [...sourceMap.values()]
  if (sources.length === 0) throw new Error(`Fallback interno bloqueado: nenhuma fonte oficial permitida (${reason})`)
  const research = {
    slug: item.id,
    title: item.title,
    content_type: contentType,
    review_method: 'desk-research',
    tested_by_thebikerblog: false,
    market: 'Brasil',
    generated_at: today,
    status: 'pesquisa_concluida',
    editorialPriority: 'P1',
    confirmed_facts: confirmedFacts,
    limitations: [`Pesquisa web indisponível nesta execução (${reason}); conteúdo limitado à base interna com fontes oficiais.`],
    sources,
    grounding: { queries: [], sourceCount: sources.length, fallback: curated.length > 0 ? 'curated-official-knowledge' : 'internal-product-knowledge', claimContract: 'explicit-units-v1' },
    ...portfolioEvidenceFor(item, today),
  }
  const verified = await verifyResearchEvidence(research, {
    fetchImpl,
    allowedSource: (url) => allowedSource(url, raceCoverage),
    requireExcerpts: true,
    deriveEvidenceFromLookup: true,
    timeoutMs: Math.max(1000, Number(env.SOURCE_HTTP_TIMEOUT_MS || 30000)),
  })
  const curatedFacts = research.confirmed_facts.filter((fact) => String(fact.evidence_quote || '').trim().length >= 12)
  const activeFacts = Array.isArray(verified.confirmed_facts) ? verified.confirmed_facts : []
  const curatedFallbackEnabled = String(env.CAMPAIGN_CURATED_OFFLINE_FALLBACK || 'true').toLowerCase() !== 'false'
  if (curatedFallbackEnabled && curated.length > 0 && curatedFacts.length > 0 && activeFacts.length < curatedFacts.length) {
    const curatedSourceIds = new Set(curatedFacts.flatMap((fact) => Array.isArray(fact.source_ids) ? fact.source_ids : []))
    const curatedSources = research.sources.filter((source) => curatedSourceIds.has(source.id))
    if (curatedSources.length > 0) {
      const offline = {
        ...research,
        confirmed_facts: curatedFacts,
        sources: curatedSources,
        limitations: [
          ...(Array.isArray(research.limitations) ? research.limitations : []),
          'Trechos oficiais mantidos em cache curado; a revalidação HTTP foi indisponível nesta execução.',
        ],
        grounding: {
          ...(research.grounding || {}),
          sourceCount: curatedSources.length,
          evidenceContract: 'curated-official-excerpt-v1',
          verifiedAt: new Date().toISOString(),
          fallback: 'curated-official-offline-cache-v1',
          verificationMode: 'curated-offline-cache',
        },
      }
      return assertResearchGrounding(validateResearch(offline), { requireFactReferences: true })
    }
  }
  return assertResearchGrounding(validateResearch(verified), { requireFactReferences: true })
}

export function contentTypeForCampaignItem(item) {
  if (item.category === 'competicoes') return ({
    preview: 'previa-corrida',
    recap: 'resumo-corrida',
    'weekly-roundup': 'resumo-corrida',
    'calendar-roundup': 'calendario-provas',
    'event-guide': 'guia-prova',
    'registration-alert': 'guia-prova',
  }[item.race?.format] || 'previa-corrida')
  return {
    'manutencao-ajustes': 'guia-tecnico', engenharia: 'guia-tecnico', componentes: 'guia-tecnico', review: 'review',
    comparativo: 'comparativo', lancamentos: 'lancamento'
  }[item.category]
}

export class GroundedResearcher {
  constructor(env = process.env, fetchImpl = fetch, sourceFetchImpl = fetchImpl) {
    this.env = env
    this.fetch = fetchImpl
    this.sourceFetch = sourceFetchImpl
  }

  async research({ item, internalEvidence, raceEvents = [], today }) {
    const provider = this.env.RESEARCH_PROVIDER || 'groq'
    const contentType = contentTypeForCampaignItem(item)
    const raceCoverage = item.category === 'competicoes'
    const prompt = [
      'Pesquise para o blog oficial da TheBiker. Responda somente em JSON válido.',
      'Priorize documentos oficiais, manuais dos fabricantes, TheBiker Shop e, em competições, organizadores oficiais.',
      'É proibido promover produtos ou marcas concorrentes. Não invente testes, medidas, resultados ou disponibilidade.',
      'Toda afirmação técnica deve aparecer em confirmed_facts e ter suporte em uma fonte URL permitida.',
      'Para cada fato, inclua evidence_quote com um trecho literal curto (12 a 20 palavras) encontrado na URL indicada. Sem trecho literal, o fato será descartado.',
      'Alegações legais brasileiras exigem fonte primária gov.br, preferencialmente a resolução vigente do CONTRAN. Não atribua limites legais a fonte comercial ou fabricante.',
      'Qualquer número com unidade usado no artigo precisa aparecer literalmente em um confirmed_fact.',
      'Seja conciso: retorne no máximo 8 fatos confirmados, 5 fontes e 3 limitações.',
      `Título: ${item.title}`,
      `Resumo editorial: ${item.summary}`,
      `Trilha de corrida: ${item.race?.track || 'não aplicável'}`,
      `Formato de corrida: ${item.race?.format || 'não aplicável'}`,
      `Eventos pré-verificados no registro editorial: ${JSON.stringify(raceEvents)}`,
      `Data: ${today}`,
      `Evidência de portfólio TheBiker obrigatória: ${JSON.stringify(portfolioEvidenceFor(item, today))}`,
      `Conteúdo interno já validado: ${JSON.stringify(compactEvidence(internalEvidence))}`,
      'Cada fonte deve ter id único. Cada fato deve usar source_ids e referenciar somente IDs presentes em sources.',
      `Retorne: {"slug":"${item.id}","title":"${item.title}","content_type":"${contentType}","review_method":"desk-research","tested_by_thebikerblog":false,"market":"Brasil","generated_at":"${today}","status":"pesquisa_concluida","editorialPriority":"P1","confirmed_facts":[{"fact":"...","evidence_quote":"trecho literal curto da fonte","source_ids":["src-1"]}],"limitations":[],"sources":[{"id":"src-1","name":"...","type":"manufacturer|store|official-website","url":"https://...","accessed":"${today}"}]}`
    ].join('\n')
    if (provider !== 'groq') throw new Error(`Provedor de pesquisa não suportado: ${provider}`)
    const fallbackResearch = async (reason) => {
      if (!raceCoverage) {
        try {
          const cached = await loadCampaignResearchCache({ item, today, contentType, env: this.env })
          if (cached) return cached
        } catch {
          // Cache inválido: deixa a camada interna aplicar seus próprios gates.
        }
      }
      return internalResearch({ item, internalEvidence, today, contentType, reason, raceCoverage, fetchImpl: this.sourceFetch, env: this.env })
    }
    if (!this.env.GROQ_API_KEY) {
      if (!raceCoverage) return fallbackResearch('GROQ_API_KEY ausente')
      throw new Error('GROQ_API_KEY é obrigatória para pesquisa atual')
    }
    const model = this.env.GROQ_RESEARCH_MODEL || 'groq/compound-mini'
    const requestBody = model.startsWith('groq/compound')
      ? {
          model,
          messages: [{ role: 'user', content: prompt }],
          compound_custom: { tools: { enabled_tools: ['web_search', 'visit_website'] } },
        }
      : {
          model,
          messages: [{ role: 'user', content: prompt }],
          tools: [{ type: 'browser_search' }],
          tool_choice: 'required',
          reasoning_effort: 'low',
          temperature: 0,
          max_completion_tokens: 2500,
        }
    let response
    try {
      response = await fetchGrounded(this.fetch, `${(this.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }, this.env)
    } catch (error) {
      if (!raceCoverage) {
        return fallbackResearch(`Groq indisponível: ${error.name || error.message}`)
      }
      throw error
    }
    let research
    let groundingProvider = 'groq-web-search'
    let groundingModel = model
    let groundingQueries = []
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 700)
      const outputParseFailed = response.status === 400 && /output_parse_failed|parsing failed/i.test(detail)
      const contextLengthExceeded = response.status === 400 && /context_length_exceeded|reduce the length of the messages or completion/i.test(detail)
      const retryableResearchFailure = outputParseFailed || contextLengthExceeded || [403, 404, 408, 409, 425, 429, 500, 502, 503, 504].includes(response.status)
      if (!raceCoverage && retryableResearchFailure) {
        const reason = outputParseFailed
          ? 'Groq 400 output_parse_failed'
          : contextLengthExceeded
            ? 'Groq 400 context_length_exceeded'
            : `Groq ${response.status}`
        return fallbackResearch(reason)
      } else {
        throw new Error(`Groq grounded research: ${response.status} - ${detail}`)
      }
    } else {
      const payload = await response.json()
      const text = payload.choices?.[0]?.message?.content
      try {
        research = extractJson(text)
      } catch (error) {
        if (!raceCoverage) {
          return fallbackResearch(`Groq retornou JSON inválido: ${error.message}`)
        } else throw error
      }
    }
    const verifyCandidate = async (candidate, { providerName, modelName, queries }) => {
      candidate.sources = (candidate.sources || []).filter((source) => source.url && allowedSource(source.url, raceCoverage))
      candidate = pruneUnsupportedFacts(candidate)
      if (candidate.sources.length === 0) throw new Error('nenhuma fonte oficial permitida foi retornada')
      candidate.slug = item.id
      candidate.title = item.title
      candidate.content_type = contentType
      candidate.review_method = 'desk-research'
      candidate.tested_by_thebikerblog = false
      candidate.market = 'Brasil'
      candidate.generated_at = today
      candidate.status = 'pesquisa_concluida'
      candidate.editorialPriority = 'P1'
      Object.assign(candidate, portfolioEvidenceFor(item, today))
      candidate.grounding = {
        queries,
        sourceCount: candidate.sources.length,
        provider: providerName,
        model: modelName,
        claimContract: 'explicit-units-v1',
      }
      candidate = await verifyResearchEvidence(candidate, {
        fetchImpl: this.sourceFetch,
        allowedSource: (url) => allowedSource(url, raceCoverage),
        requireExcerpts: true,
        timeoutMs: Math.max(1000, Number(this.env.SOURCE_HTTP_TIMEOUT_MS || 30000)),
      })
      const validated = validateResearch(candidate)
      return assertResearchGrounding(validated, { requireFactReferences: true })
    }
    try {
      return await verifyCandidate(research, { providerName: groundingProvider, modelName: groundingModel, queries: groundingQueries })
    } catch (primaryError) {
      if (!raceCoverage) return fallbackResearch(primaryError.message)
      throw new Error(`Pesquisa bloqueada após verificação documental: ${primaryError.message}`)
    }
  }
}
