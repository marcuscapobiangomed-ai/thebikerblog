import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateMonthlyCampaignPlan } from './monthly-campaign.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const fileFlag = process.argv.find((value) => value.startsWith('--file='))
const campaignPath = fileFlag ? path.resolve(fileFlag.slice('--file='.length)) : path.join(root, 'bot/editorial-campaign.json')
const campaign = JSON.parse(await fs.readFile(campaignPath, 'utf8'))
console.log(JSON.stringify(validateMonthlyCampaignPlan(campaign), null, 2))
