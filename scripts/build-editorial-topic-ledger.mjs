import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { buildEditorialTopicLedger } from '../bot/src/automation/topic-ledger.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '_data/editorial-topic-ledger.json')
const check = process.argv.includes('--check')
const ledger = await buildEditorialTopicLedger({ root })
const content = `${JSON.stringify(ledger, null, 2)}\n`

if (check) {
  const current = await fs.readFile(target, 'utf8').catch((error) => error?.code === 'ENOENT' ? '' : Promise.reject(error))
  if (current !== content) throw new Error('Registro histórico de pautas está desatualizado; execute npm run build:topic-ledger')
} else {
  await fs.writeFile(target, content)
}

console.log(JSON.stringify({ items: ledger.items.length, cooldownDays: ledger.cooldownDays, check }, null, 2))
