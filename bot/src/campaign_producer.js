import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { AIProvider } from './gemini.js'
import { CampaignSchema, publicCampaignSummary, selectProductionCandidate } from './automation/campaign.js'
import { GroundedResearcher } from './automation/grounded-research.js'
import { hashEditorialText } from './validation/editorial-receipt.js'
import { classifyEditorialFailure } from './validation/editorial-failures.js'
import { RaceProgramSchema, selectRaceEventsForEditorialItem, validateRaceEditorialStructure } from './automation/race-program.js'
import { linkTheBikerProducts, loadTheBikerLinkData } from './editorial/product-linker.js'
import { buildEvidenceBrief } from './editorial/evidence-brief.js'
import { assertResearchGrounding } from './validation/research-grounding.js'
import { assertArticleResearchGrounding } from './validation/article-research-grounding.js'

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

export function selectKnowledgeEvidence(records, item) {
  const text = normalize(`${item.title} ${item.summary}`)
  const explicit = records.filter((record) => item.productIds.includes(record.id))
  const mentioned = records.filter((record) => {
    const model = normalize(record.model)
    const tokens = model.split(/[^a-z0-9]+/).filter(Boolean)
    const distinctiveSuffix = tokens.slice(-2).join(' ')
    return model.length >= 5 && (text.includes(model) || (distinctiveSuffix.length >= 5 && text.includes(distinctiveSuffix)))
  })
  const selected = explicit.length > 0 ? explicit : mentioned
  return {
    records: selected.slice(0, 6),
    inferredProductIds: explicit.length === 0 ? mentioned.map((record) => record.id) : [],
  }
}

async function knowledgeEvidence(root, item) {
  const directory = path.join(root, '_data/product-knowledge/bikes')
  const files = await fs.readdir(directory)
  const records = await Promise.all(files.filter((name) => name.endsWith('.json')).map(async (name) => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))))
  const selected = selectKnowledgeEvidence(records, item)
  return {
    evidence: selected.records.map((record) => ({ id: record.id, brand: record.brand, model: record.model, modelYear: record.modelYear, facts: record.facts, sources: record.sources })),
    inferredProductIds: selected.inferredProductIds,
  }
}

async function persist(root, campaign) {
  await fs.writeFile(path.join(root, 'bot/editorial-campaign.json'), JSON.stringify(campaign, null, 2) + '\n')
  await fs.writeFile(path.join(root, '_data/editorial-calendar.json'), JSON.stringify(publicCampaignSummary(campaign), null, 2) + '\n')
}

export async function runCampaignProducer({ root = defaultRoot, env = process.env, researcher = new GroundedResearcher(env), ai = new AIProvider(), now = new Date() } = {}) {
  const campaignPath = path.join(root, 'bot/editorial-campaign.json')
  const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, 'utf8')))
  const pendingValidation = campaign.items.find((candidate) => candidate.status === 'validation')
  if (pendingValidation) {
    return {
      status: 'validation',
      itemId: pendingValidation.id,
      postPath: pendingValidation.postPath,
      resumed: true,
    }
  }
  const item = selectProductionCandidate(campaign)
  if (!item) return { status: 'idle', message: 'Nenhuma pauta planejada aguardando produção' }
  if (env.AUTOMATION_DRY_RUN === 'true') return { status: 'ready', itemId: item.id }
  const today = now.toISOString().slice(0, 10)
  try {
    let raceEvents = []
    if (item.race) {
      const raceProgram = RaceProgramSchema.parse(JSON.parse(await fs.readFile(path.join(root, '_data/race-events.json'), 'utf8')))
      raceEvents = selectRaceEventsForEditorialItem(item, raceProgram)
      if (item.race.eventIds.length === 0 && raceEvents.length > 0) item.race.eventIds = raceEvents.map((event) => event.id)
      validateRaceEditorialStructure(campaign, raceProgram)
      if (raceEvents.length !== item.race.eventIds.length || raceEvents.length === 0) throw new Error('Pauta de corrida sem evento oficial completo no registro editorial')
    }
    const knowledge = await knowledgeEvidence(root, item)
    if (item.productIds.length === 0 && knowledge.inferredProductIds.length > 0) item.productIds = knowledge.inferredProductIds
    item.attempts = (item.attempts || 0) + 1
    item.lastAttemptAt = now.toISOString()
    item.status = 'researching'
    await persist(root, campaign)
    const research = await researcher.research({ item, internalEvidence: knowledge.evidence, raceEvents, today })
    assertResearchGrounding(research, { requireFactReferences: true })
    if (item.race) {
      if (!Array.isArray(research.sources) || research.sources.length === 0) throw new Error('Pesquisa de corrida sem fontes oficiais rastreáveis')
      item.race.sourceStatus = 'verified'
      item.race.sourceVerifiedAt = now.toISOString()
    }
    const researchDir = path.join(root, 'content/research/campaign')
    await fs.mkdir(researchDir, { recursive: true })
    await fs.writeFile(path.join(researchDir, `${item.id}.json`), JSON.stringify(research, null, 2) + '\n')
    item.status = 'research-ready'
    await persist(root, campaign)
    item.status = 'drafting'
    await persist(root, campaign)
    let post
    let linkedPost
    let fallbackReason
    const evidenceBriefAttempt = Number(env.EVIDENCE_BRIEF_AFTER_ATTEMPT || 4)
    const useImmediateEvidenceBrief = !item.race && Number.isFinite(evidenceBriefAttempt) && item.attempts >= evidenceBriefAttempt
    if (useImmediateEvidenceBrief) {
      post = buildEvidenceBrief({ item, research, today, env })
      fallbackReason = `Contingência factual ativada após ${item.attempts} tentativas editoriais registradas`
      linkedPost = linkTheBikerProducts(post.content, loadTheBikerLinkData(root))
      assertArticleResearchGrounding({ content: linkedPost.content, research })
    } else {
      try {
        post = await ai.processCase(item.title, research)
        if (post.pipelineMetadata?.premiumEditPending) throw new Error('Revisão premium necessária, mas DeepSeek não está disponível')
        linkedPost = linkTheBikerProducts(post.content, loadTheBikerLinkData(root))
        assertArticleResearchGrounding({ content: linkedPost.content, research })
      } catch (articleError) {
        if (item.race) throw articleError
        post = buildEvidenceBrief({ item, research, today, env })
        fallbackReason = String(articleError?.message || articleError).slice(0, 650)
        linkedPost = linkTheBikerProducts(post.content, loadTheBikerLinkData(root))
        assertArticleResearchGrounding({ content: linkedPost.content, research })
      }
    }
    const draftDir = path.join(root, '_posts/drafts')
    await fs.mkdir(draftDir, { recursive: true })
    const postPath = `_posts/drafts/${item.publishDate}-${item.id}.md`
    await fs.writeFile(path.join(root, postPath), linkedPost.content)
    item.postPath = postPath
    item.status = 'validation'
    item.aiReview = {
      score: post.pipelineMetadata?.scoreBeforePremium ?? null,
      finalScore: post.pipelineMetadata?.finalScore ?? null,
      finalBlockers: post.pipelineMetadata?.finalBlockers ?? 0,
      premiumEditUsed: post.pipelineMetadata?.premiumEditUsed === true,
      evidenceBriefUsed: post.pipelineMetadata?.evidenceBriefUsed === true,
      ...(fallbackReason ? { fallbackReason } : {}),
      providers: post.pipelineMetadata?.providers || {},
      generatedAt: now.toISOString(),
      contentHash: hashEditorialText(linkedPost.content),
      sourceHash: post.pipelineMetadata?.sourceHash,
    }
    delete item.failure
    await persist(root, campaign)
    return { status: 'validation', itemId: item.id, postPath, researchPath: `content/research/campaign/${item.id}.json`, theBikerLinks: linkedPost.links.length }
  } catch (error) {
    item.status = 'blocked'
    if (item.race) item.race.sourceStatus = 'blocked'
    item.failure = classifyEditorialFailure(error, { stage: 'production', now })
    item.blockReason = `[${item.failure.code}] ${item.failure.message}`
    await persist(root, campaign)
    throw error
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  runCampaignProducer().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
}
