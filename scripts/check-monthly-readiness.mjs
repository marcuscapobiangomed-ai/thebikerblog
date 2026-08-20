import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CampaignSchema } from '../bot/src/automation/campaign.js'

const RECOVERABLE_STATUSES = new Set(['planned', 'researching', 'research-ready', 'drafting', 'validation', 'approved', 'scheduled'])

function localDate(now, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function dateDistance(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
}

export function monthlyReadinessSnapshot(value, { now = new Date(), minimumRecoverable = 14, minimumHorizonDays = 14, minimumReserves = 3 } = {}) {
  const campaign = CampaignSchema.parse(value)
  const today = localDate(now, campaign.timezone)
  const recoverable = campaign.items.filter((item) => item.publishDate >= today && RECOVERABLE_STATUSES.has(item.status))
  const futureScheduled = recoverable.filter((item) => item.status === 'scheduled').length
  const lastRecoverableDate = recoverable.map((item) => item.publishDate).sort().at(-1) || null
  const horizonDays = lastRecoverableDate ? dateDistance(today, lastRecoverableDate) + 1 : 0
  const reasons = []
  if (recoverable.length < minimumRecoverable) reasons.push(`pautas recuperáveis ${recoverable.length}/${minimumRecoverable}`)
  if (horizonDays < minimumHorizonDays) reasons.push(`horizonte ${horizonDays}/${minimumHorizonDays} dias`)
  if (campaign.reserves.length < minimumReserves) reasons.push(`reservas ${campaign.reserves.length}/${minimumReserves}`)
  return {
    campaignId: campaign.id,
    today,
    recoverableCount: recoverable.length,
    futureScheduled,
    reserves: campaign.reserves.length,
    lastRecoverableDate,
    horizonDays,
    needsRenewal: reasons.length > 0,
    reasons,
  }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const campaign = JSON.parse(await fs.readFile(path.join(root, 'bot/editorial-campaign.json'), 'utf8'))
  const snapshot = monthlyReadinessSnapshot(campaign)
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `needs_renewal=${snapshot.needsRenewal}\n`)
  }
  console.log(JSON.stringify(snapshot, null, 2))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
