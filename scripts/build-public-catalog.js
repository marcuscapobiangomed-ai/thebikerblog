import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function eligible(product, now = new Date()) {
  if (product.portfolioStatus !== 'verified') return false
  if (!/^https:\/\/(www\.)?thebikershop\.com\.br\/produtos\//i.test(product.storeProductUrl || '')) return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(product.portfolioVerifiedAt || '')) return false
  const age = Math.floor((now - new Date(`${product.portfolioVerifiedAt}T00:00:00Z`)) / 86400000)
  return age >= 0 && age <= 7
}

export function buildPublicCatalog(rootDir = root, now = new Date()) {
  const productsDir = path.join(rootDir, '_data', 'products', 'bikes')
  const bikes = fs.readdirSync(productsDir).filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(productsDir, name), 'utf8')))
    .filter((product) => eligible(product, now))
    .map((product) => ({ id: product.id, brand: product.brand, model: product.model, year: product.modelYear,
      category: product.category, priceLowest: product.theBikerPrice || null,
      weightKg: product.declaredWeight?.approximate ? null : product.declaredWeight?.valueKg || null,
      frameMaterial: product.frame?.material || null,
      groupset: product.drivetrain?.groupset || null, speeds: product.drivetrain?.speeds || null,
      shifting: product.drivetrain?.shifting || null, brakeType: product.brakes?.type || null,
      image: product.image || null,
      slug: `${product.brand.toLowerCase()}/${product.id.replace(/-br$/, '')}`,
      storeProductUrl: product.storeProductUrl, portfolioVerifiedAt: product.portfolioVerifiedAt }))
    .sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, 'pt-BR'))

  const verifiedAt = bikes.map((bike) => bike.portfolioVerifiedAt).sort().at(-1) || null
  return { version: '2.0', verifiedAt, totalBikes: bikes.length, bikes }
}

export function run({ checkOnly = process.argv.includes('--check'), rootDir = root, now = new Date() } = {}) {
  const outputPath = path.join(rootDir, '_data', 'catalog-public.json')
  const catalog = buildPublicCatalog(rootDir, now)
  const output = `${JSON.stringify(catalog, null, 2)}\n`

  if (checkOnly) {
    const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : ''
    if (existing !== output) {
      console.error('catalog-public.json está desatualizado')
      return 1
    }
  } else {
    fs.writeFileSync(outputPath, output)
    console.log(`Catálogo público: ${catalog.totalBikes} bicicleta(s) verificadas.`)
  }
  return 0
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  process.exitCode = run()
}
