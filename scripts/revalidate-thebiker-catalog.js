import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE_PRODUCT = /^https:\/\/(?:www\.)?thebikershop\.com\.br\/produtos\//i

async function mapLimit(items, limit, task) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index])
    }
  }))
  return results
}

export async function revalidatePortfolio({
  rootDir = root,
  now = new Date(),
  fetchImpl = fetch,
  minimumRetentionRatio = 0.8,
  timeoutMs = 20000,
} = {}) {
  const productsDir = path.join(rootDir, '_data', 'products', 'bikes')
  const candidates = fs.readdirSync(productsDir).filter((name) => name.endsWith('.json')).map((name) => {
    const file = path.join(productsDir, name)
    return { file, product: JSON.parse(fs.readFileSync(file, 'utf8')) }
  }).filter(({ product }) => product.portfolioStatus === 'verified' && STORE_PRODUCT.test(product.storeProductUrl || ''))

  if (candidates.length === 0) throw new Error('Nenhum produto TheBiker elegível para revalidação')
  const checked = await mapLimit(candidates, 5, async (candidate) => {
    try {
      const response = await fetchImpl(candidate.product.storeProductUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'TheBikerBlog-Catalog-Validator/1.0' },
      })
      const finalUrl = response.url || candidate.product.storeProductUrl
      return { ...candidate, valid: response.ok && /^https:\/\/(?:www\.)?thebikershop\.com\.br\//i.test(finalUrl), status: response.status }
    } catch (error) {
      return { ...candidate, valid: false, error: error.message }
    }
  })
  const valid = checked.filter((item) => item.valid)
  const ratio = valid.length / candidates.length
  if (ratio < minimumRetentionRatio) {
    throw new Error(`Revalidação recusada: ${valid.length}/${candidates.length} produtos acessíveis (${Math.round(ratio * 100)}%; mínimo ${Math.round(minimumRetentionRatio * 100)}%)`)
  }

  const verifiedAt = now.toISOString().slice(0, 10)
  for (const { file, product } of valid) {
    product.portfolioVerifiedAt = verifiedAt
    product.updatedAt = verifiedAt
    fs.writeFileSync(file, `${JSON.stringify(product, null, 2)}\n`)
  }
  return {
    total: candidates.length,
    validated: valid.length,
    failed: candidates.length - valid.length,
    failedProducts: checked.filter((item) => !item.valid).map((item) => ({ id: item.product.id, status: item.status || null, error: item.error || null })),
    verifiedAt,
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  revalidatePortfolio({
    minimumRetentionRatio: Number(process.env.MIN_CATALOG_RETENTION_RATIO || 0.8),
    timeoutMs: Number(process.env.CATALOG_REVALIDATION_TIMEOUT_MS || 20000),
  }).then((result) => {
    console.log(`Catálogo TheBiker revalidado: ${result.validated}/${result.total} produtos em ${result.verifiedAt}.`)
    for (const failed of result.failedProducts) console.warn(`AVISO: ${failed.id} não renovado (${failed.status || failed.error || 'falha desconhecida'}).`)
  })
    .catch((error) => { console.error(error.message); process.exitCode = 1 })
}
