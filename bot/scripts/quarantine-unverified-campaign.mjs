import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CampaignSchema, publicCampaignSummary } from '../src/automation/campaign.js'
import { cleanupFailedFinalization } from '../src/campaign_finalize.js'
import { researchEvidenceContractErrors } from '../src/validation/research-grounding.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const campaignPath = path.join(root, 'bot/editorial-campaign.json')
const campaign = CampaignSchema.parse(JSON.parse(await fs.readFile(campaignPath, 'utf8')))
const recordedAt = process.env.QUARANTINE_RECORDED_AT || new Date().toISOString()
const quarantined = []

for (const item of campaign.items.filter((candidate) => candidate.status === 'scheduled' || candidate.failure?.stage === 'source-verification-audit')) {
  let research
  try {
    research = JSON.parse(await fs.readFile(path.join(root, 'content/research/campaign', `${item.id}.json`), 'utf8'))
  } catch {
    research = null
  }
  const errors = research ? researchEvidenceContractErrors(research) : ['pesquisa verificada indisponível']
  if (errors.length === 0) continue
  await cleanupFailedFinalization(root, item)
  item.status = 'blocked'
  item.blockReason = `[RESEARCH_INSUFFICIENT] ${errors.join('; ')}`
  item.failure = {
    code: 'RESEARCH_INSUFFICIENT',
    retryable: true,
    stage: 'source-verification-audit',
    message: errors.join('; ').slice(0, 650),
    recordedAt,
  }
  item.lastAttemptAt = recordedAt
  item.imageStatus = 'blocked'
  quarantined.push(item.id)
}

const validated = CampaignSchema.parse(campaign)
await fs.writeFile(campaignPath, `${JSON.stringify(validated, null, 2)}\n`)
await fs.writeFile(path.join(root, '_data/editorial-calendar.json'), `${JSON.stringify(publicCampaignSummary(validated), null, 2)}\n`)
console.log(JSON.stringify({ quarantined }, null, 2))
