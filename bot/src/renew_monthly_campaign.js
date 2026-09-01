import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AIProvider } from './gemini.js'
import { buildContingencyMonthlyReport, parseIntelligenceMarkdown, renewCampaignFiles } from './automation/monthly-campaign.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function issueBody() {
  const reportFlag = process.argv.indexOf('--report')
  if (reportFlag >= 0 && process.argv[reportFlag + 1]) return fs.readFile(path.resolve(process.argv[reportFlag + 1]), 'utf8')
  if (!process.env.GITHUB_EVENT_PATH) throw new Error('Use --report <arquivo.md> ou execute a partir de um evento issues do GitHub')
  const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
  if (!/^\[INTEL(?:-BR)?\] monthly-/.test(String(event.issue?.title || ''))) throw new Error('Evento não contém uma issue mensal de inteligência')
  return event.issue?.body || ''
}

const report = process.argv.includes('--contingency')
  ? buildContingencyMonthlyReport()
  : parseIntelligenceMarkdown(await issueBody())
const result = await renewCampaignFiles({ root, report, ai: new AIProvider(), dryRun: process.argv.includes('--dry-run') })
const candidateFlag = process.argv.find((value) => value.startsWith('--candidate-output='))
if (candidateFlag && result.campaign) {
  await fs.writeFile(path.resolve(candidateFlag.slice('--candidate-output='.length)), JSON.stringify(result.campaign, null, 2) + '\n')
}
if (process.env.GITHUB_OUTPUT) {
  const outputs = {
    status: result.status,
    run_key: result.runKey,
    campaign_id: result.campaignId || result.campaign?.id || '',
    starts_on: result.startsOn || result.campaign?.startsOn || '',
  }
  await fs.appendFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''))
}
console.log(JSON.stringify(result, null, 2))
