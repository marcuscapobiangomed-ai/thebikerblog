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
const products = catalog.bikes.map((item) => {
  const record = knowledge.get(item.id)
  return { ...item, pageUrl: `https://blog.thebiker.com.br/bikes/${item.slug}/`, sources: record?.sources || [{ name: 'TheBiker Shop', type: 'store', url: item.storeProductUrl, accessedAt: item.portfolioVerifiedAt }], confirmedFacts: record ? Object.fromEntries(Object.entries(record.facts).filter(([, fact]) => fact.status === 'confirmed')) : {}, dataNotice: 'Preço e disponibilidade são observações datadas; revalidar na loja.' }
})
const files = {
  'api/products.json': { schemaVersion: '1.0', generatedAt: catalog.verifiedAt, language: 'pt-BR', publisher: 'TheBiker Insights', total: products.length, products },
  'api/audience.json': audience,
  'api/editorial-policy.json': { schemaVersion: '1.1', updatedAt: audience.updatedAt, publisher: 'TheBiker Insights', language: 'pt-BR', audience: audience.positioning, audiencePolicy: 'https://blog.thebiker.com.br/api/audience.json', sourcePriority: ['Fabricante oficial', 'TheBiker Shop'], rules: ['Não inferir especificações ausentes', 'Distinguir confirmado, aproximado, pendente e bloqueado', 'Revalidar preço e disponibilidade', 'Não publicar marcas concorrentes'] }
}
for (const [relative, data] of Object.entries(files)) {
  const target = path.join(root, relative)
  const output = JSON.stringify(data, null, 2) + '\n'
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) process.exitCode = 1
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, output)
  }
}
console.log(`${products.length} produtos publicados nos endpoints para máquinas.`)
