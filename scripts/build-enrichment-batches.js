import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const source = JSON.parse(fs.readFileSync(path.join(root, 'content/product-discovery/official-enrichment-queue.json'), 'utf8'))
const size = 4
const batches = []
for (let i = 0; i < source.queue.length; i += size) {
  const items = source.queue.slice(i, i + size)
  const blocked = items.filter((item) => item.knowledgeStatus === 'blocked').length
  const limited = items.filter((item) => item.knowledgeStatus === 'ready-for-store-facts-only').length
  batches.push({ id: `thebiker-${String(i / size + 1).padStart(2, '0')}`, status: blocked > 0 ? 'partially-blocked' : (limited > 0 ? 'ready-with-limits' : 'ready'), total: items.length, ready: items.filter((item) => item.knowledgeStatus === 'ready-for-spec-extraction').length, limited, blocked, items })
}
const output = JSON.stringify({ schemaVersion: '1.0', generatedAt: source.generatedAt, batchSize: size, totalItems: source.total, totalBatches: batches.length, batches }, null, 2) + '\n'
const target = path.join(root, 'content/product-discovery/enrichment-batches.json')
if (check) {
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : ''
  if (existing !== output.replace(/\r\n/g, '\n')) process.exit(1)
} else fs.writeFileSync(target, output)
console.log(`${batches.length} lotes, ${source.total} itens, ${source.verifiedExact} oficiais, ${source.storeVerifiedLimited || 0} limitados e ${source.blocked} bloqueados.`)
