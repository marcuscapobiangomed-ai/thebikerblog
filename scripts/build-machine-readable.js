import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const catalog = JSON.parse(fs.readFileSync(path.join(root, '_data/catalog-public.json'), 'utf8'))
const audience = JSON.parse(fs.readFileSync(path.join(root, '_data/audience.json'), 'utf8'))
const knowledgeDir = path.join(root, '_data/product-knowledge/bikes')
const knowledge = new Map(fs.readdirSync(knowledgeDir).filter((name) => name.endsWith('.json')).map((name) => {
  const record = JSON.parse(fs.readFileSync(path.join(knowledgeDir, name), 'utf8'))
  return [record.id, record]
}))
const products = catalog.bikes.flatMap((item) => {
  const record = knowledge.get(item.id)
  const confirmedFacts = record ? Object.fromEntries(Object.entries(record.facts)
    .filter(([, fact]) => fact.status === 'confirmed' && fact.value != null && fact.value !== '')
    .map(([key, fact]) => [key, { value: fact.value, unit: fact.unit ?? null }])) : {}
  const sources = (record?.sources || []).filter((source) => source.type === 'manufacturer' && /^https:\/\//.test(source.url || ''))
  if (!record || !sources.length || !Object.keys(confirmedFacts).length) return []
  const { portfolioVerifiedAt, ...publicItem } = item
  return [{ ...publicItem, pageUrl: `https://blog.thebiker.com.br/bikes/${item.slug}/`, sources, confirmedFacts }]
})
const files = {
  'api/products.json': { schemaVersion: '1.0', generatedAt: catalog.verifiedAt, language: 'pt-BR', publisher: 'TheBiker Blog', total: products.length, products },
  'api/audience.json': audience,
  'api/editorial-policy.json': { schemaVersion: '2.0', updatedAt: audience.updatedAt, publisher: 'TheBiker Blog', language: 'pt-BR', commitment: ['Conteúdo técnico claro e preciso', 'Especificações baseadas em referências oficiais', 'Informações comerciais acompanhadas de data de consulta'] }
}
for (const [relative, data] of Object.entries(files)) {
  const target = path.join(root, relative)
  const output = JSON.stringify(data, null, 2) + '\n'
  if (check) {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : ''
    if (existing !== output.replace(/\r\n/g, '\n')) process.exitCode = 1
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, output)
  }
}
console.log(`${products.length} produtos publicados nos endpoints para máquinas.`)
