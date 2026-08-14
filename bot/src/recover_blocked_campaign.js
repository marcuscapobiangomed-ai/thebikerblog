import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { recoverBlockedCampaignFiles } from './automation/recover-blocked.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const configuredResearchAttempts = Number(process.env.CAMPAIGN_RESEARCH_MAX_ATTEMPTS)
const maximumResearchAttempts = Number.isInteger(configuredResearchAttempts) && configuredResearchAttempts > 0
  ? configuredResearchAttempts
  : undefined
const result = await recoverBlockedCampaignFiles({ root, maximumResearchAttempts })
console.log(JSON.stringify(result, null, 2))
