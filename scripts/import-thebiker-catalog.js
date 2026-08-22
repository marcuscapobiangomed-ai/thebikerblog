import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

throw new Error(
  'Importador legado bloqueado: não grave produtos verificados diretamente a partir de HTML. '
    + 'Use discover:thebiker-catalog, catalog:revalidate e os gates de catálogo.',
)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const productsDir = path.join(root, '_data', 'products', 'bikes')
const imagesDir = path.join(root, 'assets', 'img', 'products', 'comparator')
const verifiedAt = new Date().toISOString().slice(0, 10)

const products = [
  ['oggi-big-wheel-7-1', 'Oggi', 'Big Wheel 7.1', 2025, 'mtb-cross-country', 'bicicleta-oggi-big-wheel-7-1'],
  ['oggi-big-wheel-7-2', 'Oggi', 'Big Wheel 7.2', 2025, 'mtb-cross-country', 'bicicleta-oggi-big-wheel-7-2'],
  ['oggi-cattura-pro-2025', 'Oggi', 'Cattura Pro', 2025, 'mtb-trail', 'bicicleta-oggi-cattura-pro-2025'],
  ['oggi-cattura-sport-2025', 'Oggi', 'Cattura Sport', 2025, 'mtb-trail', 'bicicleta-oggi-cattura-sport-2025'],
  ['oggi-big-wheel-8-0-eletrica-2025', 'Oggi', 'Big Wheel 8.0 Elétrica', 2025, 'e-mtb', 'bicicleta-eletrica-oggi-big-wheel-8-0-2025'],
  ['oggi-razzo-t-110-2025', 'Oggi', 'Razzo T 110', 2025, 'e-mtb', 'bicicleta-eletrica-oggi-razzo-t-110-2025'],
  ['oggi-razzo-t-130-2025', 'Oggi', 'Razzo T 130', 2025, 'e-mtb', 'bicicleta-eletrica-oggi-razzo-t-130-2025'],
  ['tsw-e-quest-carbon', 'TSW', 'E-Quest Carbon', 2025, 'e-mtb', 'bicicleta-eletrica-tsw-e-quest-carbon'],
  ['scott-addict-30-2026', 'Scott', 'Addict 30 2026', 2026, 'road-endurance', 'bicicleta-scott-addict-30-2026-pre-venda'],
  ['scott-addict-30-di2-2025', 'Scott', 'Addict 30 Di2', 2025, 'road-endurance', 'bicicleta-scott-addict-30-di2-2025-pre-venda'],
  ['scott-addict-50-2025', 'Scott', 'Addict 50 2025', 2025, 'road-endurance', 'bicicleta-scott-addict-50-2025-pre-venda-cinza'],
  ['scott-addict-gravel-20-2026', 'Scott', 'Addict Gravel 20', 2026, 'gravel', 'bicicleta-scott-addict-gravel-20-2026-pre-venda-146tm'],
  ['scott-addict-gravel-30-2026', 'Scott', 'Addict Gravel 30', 2026, 'gravel', 'bicicleta-scott-addict-gravel-30-2026-pre-venda'],
  ['scott-addict-gravel-40-2025', 'Scott', 'Addict Gravel 40', 2025, 'gravel', 'bicicleta-scott-addict-gravel-40-2025'],
  ['scott-addict-rc-30-di2-2026', 'Scott', 'Addict RC 30 Di2', 2026, 'road-race', 'bicicleta-scott-addict-rc-30-di2-2026'],
  ['scott-patron-eride-910-2026', 'Scott', 'Patron eRIDE 910', 2026, 'e-mtb', 'bicicleta-scott-patron-eride-910-2026'],
  ['scott-plasma-rc-pro', 'Scott', 'Plasma RC Pro', 2025, 'triathlon', 'bicicleta-scott-plasma-rc-pro'],
  ['scott-scale-910-2026', 'Scott', 'Scale 910', 2026, 'mtb-cross-country', 'bicicleta-scott-scale-910-2026-pre-venda1'],
  ['scott-scale-920-2026', 'Scott', 'Scale 920', 2026, 'mtb-cross-country', 'bicicleta-scott-scale-920-2026-white'],
  ['scott-scale-935-2026', 'Scott', 'Scale 935', 2026, 'mtb-cross-country', 'bicicleta-scott-scale-935-2026-pre-venda'],
  ['scott-scale-940-2026', 'Scott', 'Scale 940', 2026, 'mtb-cross-country', 'bicicleta-scott-scale-940-2026-black'],
  ['scott-scale-965-2025', 'Scott', 'Scale 965', 2025, 'mtb-cross-country', 'bicicleta-scott-scale-965'],
  ['scott-scale-970-2025', 'Scott', 'Scale 970', 2025, 'mtb-cross-country', 'bicicleta-scott-scale-970'],
  ['scott-scale-980', 'Scott', 'Scale 980', 2025, 'mtb-cross-country', 'bicicleta-scott-scale-980-black']
]

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'))
  return match?.[1]?.replaceAll('&amp;', '&') || null
}

function textContent(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ').normalize('NFC')
}

function technicalFacts(text) {
  const lower = text.toLowerCase()
  const material = /quadro[^.]{0,180}\bcarbono\b/i.test(text) ? 'carbon'
    : /quadro[^.]{0,180}\balum[ií]nio\b/i.test(text) ? 'aluminum' : 'não informado'
  const groups = ['Dura-Ace Di2', 'Ultegra Di2', '105 Di2', 'Shimano 105', 'GRX Di2', 'Shimano GRX',
    'XX SL Eagle AXS', 'X0 Eagle AXS', 'GX Eagle AXS', 'S1000 Eagle AXS', 'Eagle 70',
    'Deore XT', 'Shimano Deore', 'NX Eagle', 'SX Eagle', 'SRAM Apex', 'SRAM Rival']
  const groupset = groups.find((value) => lower.includes(value.toLowerCase())) || 'não informado'
  const speedsMatch = text.match(/(?:transmiss[aã]o|grupo|c[aâ]mbio)[^.]{0,150}?\b(1[012]|[789])\s*(?:velocidades|v\b)/i)
  const shifting = /\bAXS\b/i.test(text) ? 'wireless' : /\bDi2\b/i.test(text) ? 'electronic'
    : groupset !== 'não informado' ? 'mechanical' : 'não informado'
  const brakeType = /freios?[^.]{0,120}(?:hidr[aá]ulic|hydraulic)/i.test(text) ? 'hydraulic-disc' : 'não informado'
  return { material, groupset, speeds: speedsMatch ? Number(speedsMatch[1]) : null, shifting, brakeType }
}

fs.mkdirSync(productsDir, { recursive: true })
fs.mkdirSync(imagesDir, { recursive: true })

for (const [idBase, brand, model, modelYear, category, storeSlug] of products) {
  const storeProductUrl = `https://thebikershop.com.br/produtos/${storeSlug}/`
  const response = await fetch(storeProductUrl)
  if (!response.ok) throw new Error(`${response.status} ao consultar ${storeProductUrl}`)
  const html = await response.text()
  const title = meta(html, 'og:title')
  const price = Number(meta(html, 'nuvemshop:price'))
  const remoteImage = meta(html, 'og:image:secure_url') || meta(html, 'og:image')
  if (!title || !Number.isFinite(price) || price <= 0 || !remoteImage) throw new Error(`Metadados oficiais incompletos: ${storeProductUrl}`)
  const facts = technicalFacts(textContent(html))
  const id = `${idBase}-thebiker-br`
  const imageName = `${idBase}.webp`
  const imageResponse = await fetch(remoteImage.replace(/^http:/, 'https:'))
  if (!imageResponse.ok) throw new Error(`Imagem indisponível para ${storeProductUrl}`)
  fs.writeFileSync(path.join(imagesDir, imageName), Buffer.from(await imageResponse.arrayBuffer()))
  const record = {
    id, type: 'bike', status: /pré venda/i.test(title) ? 'pre-release' : 'active', brand, model, modelYear,
    market: 'BR', category, officialUrl: storeProductUrl, storeProductUrl,
    image: `/assets/img/products/comparator/${imageName}`,
    portfolioStatus: 'verified', portfolioVerifiedAt: verifiedAt, theBikerPrice: price,
    frame: { material: facts.material }, fork: { material: 'não informado' },
    drivetrain: { brand: 'não informado', groupset: facts.groupset, speeds: facts.speeds, shifting: facts.shifting },
    brakes: { type: facts.brakeType }, wheels: { material: 'não informado' }, tires: {},
    testedByTheBikerBlog: false, createdAt: verifiedAt, updatedAt: verifiedAt, reviewStatus: 'verified',
    sourceId: `thebiker-${idBase}`
  }
  fs.writeFileSync(path.join(productsDir, `${id}.json`), `${JSON.stringify(record, null, 2)}\n`)
  console.log(`✓ ${brand} ${model} — R$ ${price.toLocaleString('pt-BR')}`)
}

console.log(`\n${products.length} registros importados de páginas oficiais da TheBiker.`)
