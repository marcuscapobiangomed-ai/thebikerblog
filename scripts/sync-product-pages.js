import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECK_ONLY = process.argv.includes('--check')
const publicCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, '_data', 'catalog-public.json'), 'utf8'))
const publicProductIds = new Set((publicCatalog.bikes || []).map((product) => product.id))

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return entry.isFile() && entry.name === 'index.html' ? [fullPath] : []
  })
}

function setFrontmatterField(content, field, value) {
  const line = `${field}: ${JSON.stringify(value)}`
  const fieldPattern = new RegExp(`^${field}:.*$`, 'm')
  if (fieldPattern.test(content)) return content.replace(fieldPattern, line)
  return content.replace(/^(layout:.*)$/m, `$1\n${line}`)
}

function humanizeCategory(category) {
  const labels = {
    'mtb-cross-country': 'mountain bike cross-country',
    'mtb-trail': 'mountain bike trail',
    'bike-de-estrada': 'bicicleta de estrada',
    'road': 'bicicleta de estrada',
    'gravel': 'bicicleta gravel',
    'e-bike': 'bicicleta elétrica'
  }
  return labels[category] || String(category || 'bicicleta').replaceAll('-', ' ')
}

let changed = 0
for (const pagePath of walk(path.join(ROOT, 'bikes'))) {
  const original = fs.readFileSync(pagePath, 'utf8')
  const productId = original.match(/^product_id:\s*(.+)$/m)?.[1]?.trim()
  if (!productId) continue

  const productPath = path.join(ROOT, '_data', 'products', 'bikes', `${productId}.json`)
  if (!fs.existsSync(productPath)) throw new Error(`Produto não encontrado para ${path.relative(ROOT, pagePath)}: ${productId}`)

  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'))
  let updated = original
  const model = String(product.model || '').trim()
  const modelYear = String(product.modelYear || '').trim()
  const productName = `${product.brand} ${model}${model.includes(modelYear) ? '' : ` ${modelYear}`}`.trim()
  const productDescription = `${productName}: ficha técnica, componentes e dados documentais disponíveis no catálogo da TheBiker.`
  updated = setFrontmatterField(updated, 'title', productName)
  updated = setFrontmatterField(updated, 'description', productDescription)
  updated = setFrontmatterField(updated, 'image', product.image)
  updated = setFrontmatterField(updated, 'image_alt', `${productName} — ${humanizeCategory(product.category)} no catálogo verificado da TheBiker`)
  updated = setFrontmatterField(updated, 'brand', product.brand)
  updated = setFrontmatterField(updated, 'model', product.model)
  updated = setFrontmatterField(updated, 'modelYear', product.modelYear)
  updated = setFrontmatterField(updated, 'category', product.category)
  const portfolioEligible = publicProductIds.has(product.id) && product.portfolioStatus === 'verified' &&
    /^https:\/\/(www\.)?thebikershop\.com\.br\/produtos\//i.test(product.storeProductUrl || '')
  updated = setFrontmatterField(updated, 'published', portfolioEligible)

  if (updated !== original) {
    changed++
    if (!CHECK_ONLY) fs.writeFileSync(pagePath, updated)
    console.log(`${CHECK_ONLY ? 'desatualizado' : 'atualizado'}: ${path.relative(ROOT, pagePath)}`)
  }
}

if (CHECK_ONLY && changed > 0) process.exit(1)
console.log(`${changed} página(s) ${CHECK_ONLY ? 'desatualizada(s)' : 'atualizada(s)'}.`)
