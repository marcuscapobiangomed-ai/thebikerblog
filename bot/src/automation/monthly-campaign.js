import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { CampaignSchema, publicCampaignSummary } from './campaign.js'
import { RACE_MONTHLY_TARGETS } from './race-program.js'

const READY_STATUSES = new Set(['researching', 'research-ready', 'drafting', 'validation', 'approved', 'scheduled'])
const CATEGORY_VALUES = new Set(['manutencao-ajustes', 'engenharia', 'review', 'comparativo', 'componentes', 'lancamentos', 'competicoes'])
const MONTHLY_PLANNER_REVISION = 3

const CONTINGENCY_TOPIC_TEMPLATES = [
  ['contingencia-addict-rc-pro-documentacao', 'Scott Addict RC Pro: quadro HMX, Dura-Ace Di2 e rodas Capital 1.0S', 'Análise da montagem 2026, das relações 52x36 e 11-34, dos rotores, do cockpit integrado, do peso e do preço no Brasil.', 'review', ['bicicleta-scott-addict-rc-pro-di2-2026-pre-venda']],
  ['contingencia-addict-rc20-documentacao', 'Scott Addict RC 20: quadro HMX, 105 Di2 e configuração de estrada', 'Análise da geometria, transmissão, rodas, pneus, peso declarado e pontos de compatibilidade relevantes para a compra.', 'review', ['bicicleta-scott-addict-rc-20-di2-2026-pre-venda-vzvx9']],
  ['contingencia-addict-50-documentacao', 'Scott Addict 50: geometria endurance, montagem e perfil de uso', 'Análise do quadro, da transmissão, das rodas, dos pneus, do peso e dos ajustes que influenciam a escolha do tamanho.', 'review', ['bicicleta-scott-addict-50-2026-pre-venda-1bxzy']],
  ['contingencia-scale-980-variantes', 'Scott Scale 980 Black e Blue: o que muda entre as duas versões', 'Comparação de quadro, suspensão, transmissão, freios, rodas, pneus, tamanhos e cores das duas configurações.', 'comparativo', ['bicicleta-scott-scale-980-black', 'bicicleta-scott-scale-980-blue']],
  ['contingencia-spark-rc-expert-documentacao', 'Scott Spark RC Expert: suspensão integrada, transmissão e montagem 2027', 'Análise do quadro, dos 120 mm de curso, do sistema de suspensão, da transmissão, dos freios, das rodas e do peso.', 'review', ['bicicleta-scott-spark-rc-expert-2027']],
  ['contingencia-spark-world-cup-documentacao', 'Scott Spark RC World Cup: quadro, suspensão e montagem 2027', 'Análise da plataforma de cross-country, dos componentes, dos ajustes, do peso e do perfil de ciclista atendido pela configuração.', 'review', ['bicicleta-scott-spark-rc-world-cup-2027']],
  ['contingencia-scale-rc-team-quadro', 'Quadro Scott Scale RC Team HMF: interfaces, padrões e compatibilidade', 'Análise das medidas, dos padrões de montagem, das interfaces e dos componentes compatíveis com o quadro.', 'review', ['quadro-scott-scale-rc-team-hmf-2026']],
  ['contingencia-inspecao-fixadores', 'Inspeção de fixadores da bicicleta: sequência, registro e sinais que exigem avaliação técnica', 'Método preventivo para organizar inspeção visual e documental sem recomendar torque genérico nem substituir o manual do fabricante.', 'manutencao-ajustes'],
  ['contingencia-freio-ruido-vibracao', 'Ruído e vibração nos freios: diagnóstico por carga, temperatura e condição do rotor', 'Roteiro de diagnóstico que separa sintomas observáveis, possíveis interfaces e verificações seguras antes de trocar componentes.', 'manutencao-ajustes'],
  ['contingencia-transmissao-desgaste', 'Desgaste da transmissão: como registrar corrente, cassete e coroas sem conclusões precipitadas', 'Método de inspeção e registro para acompanhar desgaste, evitar mistura de medições e consultar limites específicos do fabricante.', 'manutencao-ajustes'],
  ['contingencia-pressao-pneus-registro', 'Pressão dos pneus: protocolo de testes com registro de terreno, carga e comportamento', 'Procedimento comparável para ajustar uma variável por vez e separar aderência, suporte, impacto e resistência percebida.', 'engenharia'],
  ['contingencia-tubeless-selante', 'Sistema tubeless: inspeção de fita, válvula, selante e assentamento do pneu', 'Checklist técnico para localizar perda de ar e contaminação mantendo compatibilidade e limites de pressão ligados à documentação.', 'manutencao-ajustes'],
  ['contingencia-sag-suspensao', 'SAG da suspensão: como medir com repetibilidade e registrar as condições do ajuste', 'Método para reduzir variações de postura, equipamento e leitura sem apresentar um valor universal para bicicletas diferentes.', 'engenharia'],
  ['contingencia-retorno-suspensao', 'Retorno da suspensão: protocolo para comparar ajustes sem confundir velocidade e controle', 'Sequência de testes controlados com registro de cliques e sintomas, preservando as recomendações específicas de cada fabricante.', 'engenharia'],
  ['contingencia-rolamentos-interfaces', 'Rolamentos da bicicleta: diagnóstico por interface antes de concluir que existe desgaste', 'Roteiro para separar folga, contaminação, fixação e carga sem desmontagem indiscriminada ou substituição por tentativa.', 'manutencao-ajustes'],
  ['contingencia-caixa-direcao', 'Caixa de direção: inspeção de folga, pré-carga e alinhamento em etapas verificáveis', 'Método de diagnóstico para registrar sintomas e conferir a montagem respeitando o desenho e os limites específicos do conjunto.', 'manutencao-ajustes'],
  ['contingencia-movimento-central', 'Movimento central: como distinguir ruído, folga e incompatibilidade de interface', 'Guia de investigação documental e mecânica para não atribuir todo estalo ao rolamento nem misturar padrões de quadro.', 'manutencao-ajustes'],
  ['contingencia-centragem-roda', 'Centragem de roda: o que observar antes de alterar a tensão dos raios', 'Checklist de alinhamento lateral, radial e tensão relativa que delimita quando a avaliação profissional é necessária.', 'engenharia'],
  ['contingencia-tensao-raios', 'Tensão de raios: método de comparação sem publicar valores universais', 'Leitura técnica sobre equilíbrio, referência do aro e registro de medições, mantendo especificações ligadas ao fabricante.', 'engenharia'],
  ['contingencia-cubo-folga', 'Cubo e eixo: diagnóstico de folga, assentamento e pré-carga sem misturar padrões', 'Sequência para separar fixação da roda, rolamentos e interfaces antes de concluir que um componente está danificado.', 'manutencao-ajustes'],
  ['contingencia-canote-selim', 'Canote e selim: interfaces, fixação e sinais que não devem ser ignorados', 'Inspeção organizada de diâmetro, inserção, trilhos e superfícies de contato baseada na documentação de cada componente.', 'manutencao-ajustes'],
  ['contingencia-posicao-selim', 'Posição do selim: como registrar alterações sem transformar ajuste em prescrição médica', 'Método para documentar altura, recuo e inclinação com pequenas mudanças, sintomas observados e limites de orientação.', 'engenharia'],
  ['contingencia-tacos-pedais', 'Tacos e pedais: inspeção de desgaste, fixação e repetibilidade do encaixe', 'Checklist técnico para observar interfaces e simetria sem extrapolar para diagnóstico clínico ou ajuste biomecânico individual.', 'manutencao-ajustes'],
  ['contingencia-cockpit-alinhamento', 'Cockpit da bicicleta: método para conferir alinhamento, interfaces e fixação', 'Sequência de inspeção de guidão, mesa, espaçadores e comandos mantendo cada limite associado ao manual aplicável.', 'manutencao-ajustes'],
  ['contingencia-torque-documentacao', 'Torque de montagem: como localizar a especificação correta e evitar valores genéricos', 'Guia documental para identificar interface, material, condição de rosca e fonte antes de aplicar qualquer valor de aperto.', 'engenharia'],
  ['contingencia-carbono-inspecao', 'Componentes de carbono: inspeção visual, histórico de impacto e critérios de interrupção de uso', 'Roteiro conservador para registrar sinais e encaminhar avaliação adequada sem declarar integridade estrutural por fotografia.', 'manutencao-ajustes'],
  ['contingencia-pos-chuva', 'Inspeção pós-chuva: pontos de contaminação, corrosão e desgaste que merecem registro', 'Rotina técnica após uso molhado priorizando transmissão, freios, rolamentos e interfaces sem lavagem agressiva.', 'manutencao-ajustes'],
  ['contingencia-armazenamento-bike', 'Armazenamento da bicicleta: umidade, carga, bateria e inspeções periódicas', 'Checklist para reduzir degradação durante períodos sem uso respeitando orientações específicas de componentes e baterias.', 'manutencao-ajustes'],
  ['contingencia-lavagem-bike', 'Lavagem da bicicleta: sequência para remover sujeira sem deslocar contaminação', 'Método de limpeza por zonas que protege freios e rolamentos e evita apresentar um produto químico como universal.', 'manutencao-ajustes'],
  ['contingencia-lubrificacao-corrente', 'Lubrificação da corrente: preparação, aplicação e avaliação do excesso', 'Procedimento para controlar limpeza, quantidade e intervalo conforme uso, sem prometer durabilidade ou desempenho absoluto.', 'manutencao-ajustes'],
  ['contingencia-cambio-eletronico', 'Câmbio eletrônico: diagnóstico por energia, comunicação, alinhamento e sincronização', 'Roteiro de verificação que separa bateria, conexão, configuração e interferência mecânica antes de substituir peças.', 'componentes'],
  ['contingencia-cabos-mangueiras', 'Cabos e mangueiras internos: sinais de atrito, roteamento e pontos de inspeção', 'Guia técnico para documentar ruído e restrição de movimento sem prescrever desmontagem incompatível com o quadro.', 'componentes'],
  ['contingencia-carcaca-pneu', 'Carcaça do pneu: como relacionar construção, pressão e uso sem generalizar desempenho', 'Leitura técnica das variáveis documentadas e de um protocolo de comparação que mantenha terreno e carga registrados.', 'engenharia'],
  ['contingencia-largura-aro-pneu', 'Largura interna do aro e pneu: compatibilidade, forma e limites documentais', 'Guia para conferir tabelas e padrões aplicáveis sem inferir compatibilidade apenas pela medida nominal do pneu.', 'engenharia'],
  ['contingencia-stack-reach', 'Stack e reach: como comparar posições sem reduzir geometria a dois números', 'Método de leitura que combina medidas do quadro, componentes e objetivo de uso sem transformar comparação em ajuste pessoal.', 'engenharia'],
  ['contingencia-offset-garfo', 'Offset do garfo e direção: relações geométricas que exigem contexto', 'Explicação documental de medidas e relações, evitando promessas isoladas de estabilidade, agilidade ou desempenho.', 'engenharia'],
].map(([id, title, summary, category, productIds = []]) => ({ id, title, summary, category, productIds }))

const RACE_SLOT_TEMPLATES = [
  { id: 'corridas-pro-previa-principal', title: 'Prévia da principal corrida profissional da semana: percurso, favoritos e pontos técnicos', summary: 'Cobertura profissional vinculada a um evento oficial, com percurso, largadas e transmissão confirmados novamente antes da publicação.', category: 'competicoes', race: { track: 'professional-coverage', format: 'preview', eventIds: [], sourceStatus: 'pending' } },
  { id: 'corridas-pro-resumo-principal', title: 'Resumo da principal corrida profissional da semana: resultado, tática e impacto na temporada', summary: 'Análise pós-prova baseada em resultado oficial, movimentos decisivos e contexto técnico, sem transformar rumor ou impressão em fato.', category: 'competicoes', race: { track: 'professional-coverage', format: 'recap', eventIds: [], sourceStatus: 'pending' } },
  { id: 'corridas-pro-radar-semana-1', title: 'Radar profissional de ciclismo: provas, classificações e histórias técnicas da semana', summary: 'Boletim de competições profissionais com eventos e resultados rastreáveis em federações, organizadores e canais oficiais.', category: 'competicoes', race: { track: 'professional-coverage', format: 'weekly-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'corridas-pro-radar-semana-2', title: 'Segundo radar profissional do mês: calendário, resultados e decisões técnicas em destaque', summary: 'Atualização profissional sem promoção de concorrentes, usando apenas calendário, resultados e documentos oficiais verificados.', category: 'competicoes', race: { track: 'professional-coverage', format: 'weekly-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'corridas-participar-calendario-1', title: 'Calendário de provas para participar no Brasil: datas, modalidades e inscrições verificadas', summary: 'Agenda para o ciclista encontrar provas, distinguindo evento confirmado, inscrição aberta, prazo encerrado e informação ainda desconhecida.', category: 'competicoes', race: { track: 'participant-calendar', format: 'calendar-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'corridas-participar-calendario-2', title: 'Atualização do calendário brasileiro de ciclismo: novas provas, mudanças e prazos oficiais', summary: 'Segunda atualização mensal das provas participativas, com mudanças de data, cancelamentos e inscrições checados na fonte oficial.', category: 'competicoes', race: { track: 'participant-calendar', format: 'calendar-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'corridas-participar-guia-1', title: 'Guia da prova para o ciclista: percurso, categorias, inscrição e logística confirmada', summary: 'Guia de um evento brasileiro escolhido após verificação oficial, com lacunas claramente marcadas quando a organização ainda não publicou dados.', category: 'competicoes', race: { track: 'participant-calendar', format: 'event-guide', eventIds: [], sourceStatus: 'pending' } },
  { id: 'corridas-participar-guia-2', title: 'Próxima prova no radar: o que confirmar antes de pagar a inscrição e organizar a viagem', summary: 'Checklist aplicado a uma prova oficial, cobrindo regulamento, elegibilidade, inscrição, percurso, segurança e logística sem links presumidos.', category: 'competicoes', race: { track: 'participant-calendar', format: 'event-guide', eventIds: [], sourceStatus: 'pending' } },
]

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function slug(value) {
  return normalize(value).replace(/\s+/g, '-').replace(/(^-|-$)/g, '').slice(0, 72) || 'pauta-editorial'
}

function truncate(value, maximum) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maximum) return text
  const sliced = text.slice(0, maximum + 1)
  const boundary = sliced.lastIndexOf(' ')
  return sliced.slice(0, boundary >= Math.floor(maximum * 0.7) ? boundary : maximum).trim()
}

function titleCaseStart(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')
  return text ? text[0].toLocaleUpperCase('pt-BR') + text.slice(1) : ''
}

function categoryFor(value, suggested) {
  if (CATEGORY_VALUES.has(suggested)) return suggested
  const text = normalize(value)
  if (/campeonato|corrida|xco|xc[o|m]|tour|prova|competicao/.test(text)) return 'competicoes'
  if (/compar|versus|\bvs\b|diferenca/.test(text)) return 'comparativo'
  if (/review|teste|analise.*modelo|modelo.*analise/.test(text)) return 'review'
  if (/lancamento|novidade|nova linha|mercado/.test(text)) return 'lancamentos'
  if (/corrente|cassete|freio|rotor|roda|pneu|grupo|componente/.test(text)) return 'componentes'
  if (/ajuste|manutencao|diagnostico|pressao|torque|limpeza|reparo/.test(text)) return 'manutencao-ajustes'
  return 'engenharia'
}

function freshnessFor(source, category) {
  if (source === 'youtube' || category === 'competicoes') return 'event-driven'
  if (['review', 'comparativo', 'lancamentos'].includes(category)) return 'revalidate-24h'
  return 'evergreen'
}

function raceMetadataFor(value, provided) {
  if (provided?.track && provided?.format) return { ...provided, eventIds: provided.eventIds || [], sourceStatus: provided.sourceStatus || 'pending' }
  const text = normalize(value)
  const participant = /inscri|particip|calendario|proxima prova|guia da prova/.test(text)
  return participant
    ? { track: 'participant-calendar', format: 'calendar-roundup', eventIds: [], sourceStatus: 'pending' }
    : { track: 'professional-coverage', format: 'weekly-roundup', eventIds: [], sourceStatus: 'pending' }
}

function localDate(now, timezone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function addDays(date, amount, timezone = 'America/Sao_Paulo') {
  const value = new Date(`${date}T12:00:00-03:00`)
  value.setUTCDate(value.getUTCDate() + amount)
  return localDate(value, timezone)
}

function candidateFromBrief(brief) {
  const rawTitle = titleCaseStart(brief.topic)
  const title = truncate(rawTitle.length >= 20 ? rawTitle : `Guia técnico TheBiker: ${rawTitle}`, 140)
  const category = categoryFor(`${brief.topic} ${brief.angle || ''}`, brief.category)
  const evidence = brief.evidence ? ` Sinal observado: ${brief.evidence}.` : ''
  const summary = truncate(`${brief.angle || 'Análise técnica orientada ao ciclista intermediário e avançado, com método, fontes e limitações declarados.'}${evidence}`, 260)
  const candidate = {
    id: slug(brief.id || title),
    title,
    summary: summary.length >= 40 ? summary : `${summary} Conteúdo técnico com fontes primárias verificadas.`.slice(0, 260),
    category,
    freshness: freshnessFor(brief.source, category),
    status: 'planned',
    productIds: [],
    imageAssetIds: [],
    attempts: 0,
  }
  if (category === 'competicoes') candidate.race = raceMetadataFor(`${brief.topic} ${brief.angle || ''}`, brief.race)
  return candidate
}

function candidateFromReserve(reserve) {
  const category = categoryFor(`${reserve.title} ${reserve.summary}`, reserve.category)
  const candidate = {
    id: slug(reserve.id || reserve.title),
    title: truncate(titleCaseStart(reserve.title), 140),
    summary: truncate(reserve.summary, 260),
    category,
    freshness: freshnessFor('reserve', category),
    status: 'planned',
    productIds: Array.isArray(reserve.productIds) ? reserve.productIds : [],
    imageAssetIds: [],
    attempts: 0,
  }
  if (category === 'competicoes') candidate.race = raceMetadataFor(`${reserve.title} ${reserve.summary}`, reserve.race)
  return candidate
}

function raceSlotsFor(retained) {
  const counts = { 'professional-coverage': 0, 'participant-calendar': 0 }
  for (const item of retained.values()) if (item.category === 'competicoes' && item.race) counts[item.race.track] += 1
  const needs = {
    'professional-coverage': Math.max(0, RACE_MONTHLY_TARGETS.professionalCoverage - counts['professional-coverage']),
    'participant-calendar': Math.max(0, RACE_MONTHLY_TARGETS.participantCalendar - counts['participant-calendar']),
  }
  return RACE_SLOT_TEMPLATES
    .filter((slot) => needs[slot.race.track]-- > 0)
    .map(candidateFromReserve)
}

function distributeRaceSlots(candidates, raceSlots, primaryLength) {
  const regular = candidates.filter((candidate) => candidate.category !== 'competicoes')
  const extraRace = candidates.filter((candidate) => candidate.category === 'competicoes')
  const races = [...raceSlots, ...extraRace]
  if (races.length === 0) return regular
  if (races.length > primaryLength) throw new Error(`Há ${races.length} pautas de corrida para apenas ${primaryLength} posições abertas`)
  const primaryRegularCount = Math.max(0, primaryLength - races.length)
  const primaryRegular = regular.slice(0, primaryRegularCount)
  const reserveRegular = regular.slice(primaryRegularCount)
  const total = primaryRegular.length + races.length
  const result = []
  let regularIndex = 0
  let raceIndex = 0
  for (let position = 0; position < total; position += 1) {
    const racesExpected = Math.floor(((position + 1) * races.length) / total)
    if (raceIndex < racesExpected && raceIndex < races.length) result.push(races[raceIndex++])
    else if (regularIndex < primaryRegular.length) result.push(primaryRegular[regularIndex++])
    else result.push(races[raceIndex++])
  }
  return [...result, ...reserveRegular]
}

function candidateTitleKey(value) {
  const title = typeof value === 'string' ? value : value?.title
  return normalize(title || '').split(' ').filter((token) => token.length >= 4).slice(0, 7).join(' ')
}

function uniqueCandidates(candidates, occupied = [], occupiedIds = []) {
  const seen = new Set(occupied.map(candidateTitleKey).filter(Boolean))
  const seenIds = new Set(occupiedIds)
  return candidates.filter((candidate) => {
    const key = candidateTitleKey(candidate)
    if (!key || seen.has(key) || seenIds.has(candidate.id)) return false
    seen.add(key)
    seenIds.add(candidate.id)
    return true
  })
}

function validateAiTopics(value) {
  const topics = Array.isArray(value?.topics) ? value.topics : []
  return topics.map((topic) => candidateFromBrief({
    id: topic.id,
    topic: topic.title,
    angle: topic.summary,
    category: topic.category,
    source: topic.freshness === 'event-driven' ? 'youtube' : 'editorial-planner',
  })).filter((topic) => topic.title.length >= 20 && topic.summary.length >= 40)
}

async function expandWithAi({ missing, report, occupiedTitles, ai }) {
  if (missing <= 0) return []
  if (!ai?.generate) throw new Error(`Inteligência mensal insuficiente: faltam ${missing} pautas e nenhum planejador de IA está disponível`)
  const response = await ai.generate(
    'Você planeja o blog oficial TheBiker para ciclistas intermediários e avançados. Não promova concorrentes, não invente testes, preços, estoque ou especificações. Retorne somente JSON válido.',
    `Crie exatamente ${missing} pautas editoriais novas e não sobrepostas para ciclistas brasileiros intermediários e avançados. Use consultas SEO medidas no Brasil, clusters, pautas derivadas e sinais do YouTube Brasil apenas como inteligência, nunca como prova factual. Priorize intenção de busca, desempenho observado, lacunas do acervo e inventário TheBiker; não repita palavras-chave e não crie páginas que canibalizem a mesma intenção. Evite estes títulos já usados: ${JSON.stringify(occupiedTitles)}. Inteligência: ${JSON.stringify({ brazilRankings: { seoMeasured: report.brazilRankings?.seoMeasured?.slice(0, 100) || [], youtubeDiscovery: report.brazilRankings?.youtubeDiscovery || [] }, queryClusters: report.queryClusters || [], briefs: report.briefs, discoverySignals: report.discoverySignals?.slice(0, 20) || [] })}. Formato: {"topics":[{"id":"slug","title":"20 a 140 caracteres","summary":"40 a 260 caracteres","category":"manutencao-ajustes|engenharia|review|comparativo|componentes|lancamentos|competicoes","freshness":"evergreen|revalidate-24h|event-driven"}]}`,
    {
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 7000,
      model: process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-v4-flash',
      step: 'monthly-campaign-planning',
    },
  )
  let parsed
  try {
    parsed = JSON.parse(String(response).replace(/^```json\s*|\s*```$/g, ''))
  } catch (error) {
    throw new Error(`Planejador mensal retornou JSON inválido: ${error.message}`)
  }
  const candidates = validateAiTopics(parsed)
  if (candidates.length < missing) throw new Error(`Planejador mensal retornou ${candidates.length}/${missing} pautas válidas`)
  return candidates.slice(0, missing)
}

export function parseIntelligenceMarkdown(markdown) {
  const blocks = [...String(markdown || '').matchAll(/```json\s*([\s\S]*?)```/g)]
  if (blocks.length === 0) throw new Error('Issue de inteligência sem payload JSON estruturado')
  const report = JSON.parse(blocks.at(-1)[1])
  if (report.cadence !== 'monthly') throw new Error(`Renovação exige inteligência mensal; recebido: ${report.cadence || 'não informado'}`)
  if (!report.runKey || !Array.isArray(report.briefs)) throw new Error('Payload mensal incompleto')
  return report
}

export function intelligenceSourceDigest(report) {
  return crypto.createHash('sha256').update(JSON.stringify({ plannerRevision: MONTHLY_PLANNER_REVISION, report })).digest('hex')
}

export function buildContingencyMonthlyReport({ now = new Date() } = {}) {
  const generatedAt = now.toISOString()
  const date = generatedAt.slice(0, 10)
  return {
    schemaVersion: 1,
    runKey: `monthly-contingency-${date}`,
    cadence: 'monthly',
    generatedAt,
    briefs: [],
    refreshQueue: [],
    discoverySignals: [],
    queryClusters: [],
    brazilRankings: { youtubeDiscovery: [], seoMeasured: [] },
    sourceStatus: 'degraded',
  }
}

export function validateMonthlyCampaignPlan(value) {
  const campaign = CampaignSchema.parse(value)
  const unusable = campaign.items.filter((item) => ['blocked', 'replaced'].includes(item.status))
  if (unusable.length > 0) throw new Error(`Plano mensal contém ${unusable.length} pauta(s) inutilizável(is)`)
  if (campaign.reserves.length < 3) throw new Error(`Plano mensal exige pelo menos 3 reservas; recebido: ${campaign.reserves.length}`)
  const races = campaign.items.filter((item) => item.race)
  const professional = races.filter((item) => item.race.track === 'professional-coverage')
  const participant = races.filter((item) => item.race.track === 'participant-calendar')
  if (races.length < RACE_MONTHLY_TARGETS.total || professional.length < RACE_MONTHLY_TARGETS.professionalCoverage || participant.length < RACE_MONTHLY_TARGETS.participantCalendar) {
    throw new Error(`Plano mensal sem mix mínimo de corridas: ${races.length}/${RACE_MONTHLY_TARGETS.total}`)
  }
  return {
    campaignId: campaign.id,
    startsOn: campaign.startsOn,
    items: campaign.items.length,
    planned: campaign.items.filter((item) => item.status === 'planned').length,
    retainedReady: campaign.items.filter((item) => READY_STATUSES.has(item.status)).length,
    reserves: campaign.reserves.length,
    races: { total: races.length, professional: professional.length, participant: participant.length },
  }
}

export async function buildRollingCampaign({ existing, report, now = new Date(), ai } = {}) {
  const current = CampaignSchema.parse(existing)
  if (report.cadence !== 'monthly') throw new Error('Somente relatórios mensais podem renovar a campanha')
  let startsOn = localDate(now, current.timezone)
  const todayItem = current.items.find((item) => item.publishDate === startsOn)
  if (todayItem?.status === 'published') startsOn = addDays(startsOn, 1, current.timezone)
  const dates = Array.from({ length: 30 }, (_, index) => addDays(startsOn, index, current.timezone))
  const byDate = new Map(current.items.map((item) => [item.publishDate, item]))
  const retained = new Map()
  for (const date of dates) {
    const item = byDate.get(date)
    if (!item || !READY_STATUSES.has(item.status)) continue
    retained.set(date, structuredClone(item))
  }
  const occupiedTitles = [...retained.values()].map((item) => normalize(item.title))
  const occupiedIds = [...retained.values()].map((item) => item.id)
  const fresh = (report.briefs || []).filter((brief) => brief.action === 'new-content').map(candidateFromBrief)
  const raceSlots = raceSlotsFor(retained)
  const contingency = CONTINGENCY_TOPIC_TEMPLATES.map(candidateFromReserve)
  let candidates = uniqueCandidates([
    ...contingency.slice(0, 7),
    ...fresh,
    ...contingency.slice(7),
  ], occupiedTitles, occupiedIds)
  const openDates = dates.filter((date) => !retained.has(date)).length
  const missingBeforeAi = openDates + 3 - candidates.length - raceSlots.length
  if (missingBeforeAi > 0) {
    const aiCandidates = await expandWithAi({ missing: missingBeforeAi, report, occupiedTitles: [...occupiedTitles, ...candidates.map((item) => item.title)], ai })
    candidates = uniqueCandidates([...candidates, ...aiCandidates], occupiedTitles, occupiedIds)
  }
  candidates = distributeRaceSlots(candidates, raceSlots, openDates)
  const items = dates.map((publishDate, index) => {
    const item = retained.get(publishDate) || candidates.shift()
    if (!item) throw new Error(`Não foi possível preencher a campanha: data sem pauta ${publishDate}`)
    return { ...item, day: index + 1, publishDate }
  })
  const usedIds = new Set(items.map((item) => item.id))
  const raceItems = items.filter((item) => item.category === 'competicoes')
  const professionalRaceItems = raceItems.filter((item) => item.race?.track === 'professional-coverage')
  const participantRaceItems = raceItems.filter((item) => item.race?.track === 'participant-calendar')
  if (raceItems.length < RACE_MONTHLY_TARGETS.total || professionalRaceItems.length < RACE_MONTHLY_TARGETS.professionalCoverage || participantRaceItems.length < RACE_MONTHLY_TARGETS.participantCalendar) {
    throw new Error(`Mix de corridas insuficiente: total ${raceItems.length}/${RACE_MONTHLY_TARGETS.total}, profissional ${professionalRaceItems.length}/${RACE_MONTHLY_TARGETS.professionalCoverage}, participativo ${participantRaceItems.length}/${RACE_MONTHLY_TARGETS.participantCalendar}`)
  }
  const reservePool = uniqueCandidates([
    ...candidates,
    ...fresh,
  ], items.map((item) => normalize(item.title)), items.map((item) => item.id)).filter((item) => !usedIds.has(item.id))
  if (reservePool.length < 3) {
    const defaults = [
      { id: 'reserva-diagnostico-ruidos-bike', title: 'Diagnóstico de ruídos na bicicleta: método por carga, frequência e interface', summary: 'Protocolo técnico para isolar ruídos de transmissão, cockpit, rodas e quadro sem substituir componentes por tentativa e erro.', category: 'manutencao-ajustes' },
      { id: 'reserva-pressao-pneus-terreno', title: 'Pressão de pneus por terreno: como testar sem transformar sensação em dado', summary: 'Método de campo para ajustar pressão, registrar comportamento e separar aderência, suporte lateral, impacto e resistência ao rolamento.', category: 'engenharia' },
      { id: 'reserva-inspecao-pos-chuva', title: 'Inspeção pós-chuva: os pontos que concentram contaminação, corrosão e desgaste', summary: 'Rotina técnica depois de treinos molhados, priorizando rolamentos, transmissão, freios, suspensão e interfaces do quadro.', category: 'manutencao-ajustes' },
    ].map(candidateFromReserve)
    reservePool.push(...defaults.filter((item) => !usedIds.has(item.id) && !reservePool.some((reserve) => reserve.id === item.id)))
  }
  const campaign = CampaignSchema.parse({
    version: 1,
    id: `thebiker-rolling-${startsOn}`,
    timezone: current.timezone,
    publishLocalTime: current.publishLocalTime,
    startsOn,
    minimumApprovedBuffer: current.minimumApprovedBuffer,
    items,
    reserves: reservePool.slice(0, Math.max(3, Math.min(12, reservePool.length))).map(({ id, title, summary, category, race }) => ({ id, title, summary, category, ...(race ? { race } : {}) })),
  })
  validateMonthlyCampaignPlan(campaign)
  return campaign
}

export async function renewCampaignFiles({ root, report, now = new Date(), ai, dryRun = false } = {}) {
  const campaignPath = path.join(root, 'bot/editorial-campaign.json')
  const statePath = path.join(root, 'bot/operational-state/monthly-renewal.json')
  const existing = JSON.parse(await fs.readFile(campaignPath, 'utf8'))
  const previousState = await fs.readFile(statePath, 'utf8').then(JSON.parse).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error))
  const sourceDigest = intelligenceSourceDigest(report)
  if (previousState?.lastRunKey === report.runKey && previousState?.sourceDigest === sourceDigest) return { status: 'unchanged', runKey: report.runKey, campaignId: previousState.campaignId }
  const campaign = await buildRollingCampaign({ existing, report, now, ai })
  if (dryRun) return { status: 'dry-run', runKey: report.runKey, campaign }
  const archiveDirectory = path.join(root, 'bot/operational-state/campaign-archive')
  await fs.mkdir(archiveDirectory, { recursive: true })
  await fs.writeFile(path.join(archiveDirectory, `${existing.id}-${report.runKey}.json`), JSON.stringify(existing, null, 2) + '\n')
  await fs.writeFile(campaignPath, JSON.stringify(campaign, null, 2) + '\n')
  await fs.writeFile(path.join(root, '_data/editorial-calendar.json'), JSON.stringify(publicCampaignSummary(campaign), null, 2) + '\n')
  await fs.writeFile(path.join(root, '_data/editorial-refresh-queue.json'), JSON.stringify({ schemaVersion: 1, runKey: report.runKey, generatedAt: report.generatedAt, items: report.refreshQueue || [] }, null, 2) + '\n')
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, JSON.stringify({ schemaVersion: 2, lastRunKey: report.runKey, sourceDigest, campaignId: campaign.id, renewedAt: now.toISOString() }, null, 2) + '\n')
  return { status: 'renewed', runKey: report.runKey, campaignId: campaign.id, startsOn: campaign.startsOn, retained: campaign.items.filter((item) => READY_STATUSES.has(item.status)).length, planned: campaign.items.filter((item) => item.status === 'planned').length }
}
