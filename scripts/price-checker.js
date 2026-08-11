// ============================================================
// Price Checker — TheBiker Blog
// Usage: node scripts/price-checker.js
// Pré-requisito: npm install node-fetch cheerio
//
// Antes de usar:
// 1. npm install node-fetch cheerio
// 2. Preencher os seletores CSS abaixo para cada loja
// 3. Configurar GitHub Actions ou cron job
// ============================================================

const fs = require('fs')
const path = require('path')

// Simula fetch se não tiver node-fetch instalado
let fetch
try {
  fetch = require('node-fetch')
} catch {
  console.log('[AVISO] node-fetch não instalado. Usando modo simulação.')
  console.log('Execute: npm install node-fetch cheerio')
  process.exit(1)
}

const PRICES_DIR = path.join(__dirname, '..', 'data', 'prices')
const PRODUCTS_DIR = path.join(__dirname, '..', 'data', 'products', 'bikes')

// ============================================================
// CONFIGURAÇÃO — PREENCHER COM SELETORES REAIS
// ============================================================

const STORE_SCRAPERS = {
  // Exemplo para Mercado Livre
  'mercadolivre': {
    selector: '.andes-money-amount__fraction',
    priceAttr: 'text',
    urlTemplate: function(productName) {
      return `https://lista.mercadolivre.com.br/${encodeURIComponent(productName)}`
    }
  },
  // Exemplo para Amazon
  'amazon': {
    selector: '.a-price-whole',
    priceAttr: 'text',
    urlTemplate: function(productName) {
      return `https://www.amazon.com.br/s?k=${encodeURIComponent(productName)}`
    }
  },
  // Exemplo para Decathlon
  'decathlon': {
    selector: '[data-price]',
    priceAttr: 'data-price',
    urlTemplate: function(productName) {
      return `https://www.decathlon.com.br/search?q=${encodeURIComponent(productName)}`
    }
  }
}

// Mapeamento de produtos para URLs de busca
// FORMATO: { product_id: { loja: url_direta } }
// PREENCHER com URLs reais de cada produto em cada loja
const PRODUCT_URLS = {
  'specialized-tarmac-sl8-2026-br': {
    specialized: 'https://www.specialized.com/br/pt/tarmac-sl8-comp/p/',
    mercadolivre: 'https://lista.mercadolivre.com.br/specialized-tarmac-sl8'
  },
  'scott-addict-20-2026-br': {
    allsports: 'https://www.allsports.com.br/scott-addict-20',
    mercadolivre: 'https://lista.mercadolivre.com.br/scott-addict-20'
  }
  // ADICIONAR OS DEMAIS 28 PRODUTOS AQUI
}

// ============================================================
// FUNÇÕES
// ============================================================

async function fetchPrice(url, scraper) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TheBikerBlog/1.0 (price checker)' }
    })
    if (!response.ok) return null
    const html = await response.text()

    // Extrair preço (simplificado — idealmente usar cheerio)
    // Exemplo com regex: R$ 9.999,00
    const priceMatch = html.match(/R?\$?\s*([\d.]+,\d{2})/)
    if (priceMatch) {
      return parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'))
    }

    // Alternativa: buscar por padrão mais genérico
    const numMatch = html.match(/["']?price["']?\s*[:=]\s*([\d.]+)/)
    if (numMatch) {
      return parseFloat(numMatch[1])
    }

    return null
  } catch (e) {
    console.error(`  [ERRO] Falha ao buscar ${url}: ${e.message}`)
    return null
  }
}

function loadAllProducts() {
  const files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.json'))
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, f), 'utf-8'))
    return { id: data.id, brand: data.brand, model: data.model }
  })
}

function loadPriceFile(productId) {
  const filePath = path.join(PRICES_DIR, `${productId}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function savePriceFile(productId, data) {
  const filePath = path.join(PRICES_DIR, `${productId}.json`)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('=== TheBiker Blog Price Checker ===')
  console.log(`Data: ${new Date().toISOString().slice(0, 10)}`)

  const products = loadAllProducts()
  console.log(`Produtos no catálogo: ${products.length}`)

  let updated = 0
  let errors = 0

  for (const product of products) {
    const urls = PRODUCT_URLS[product.id]
    if (!urls) {
      console.log(`  [SKIP] ${product.brand} ${product.model}: sem URLs configuradas`)
      continue
    }

    console.log(`\n${product.brand} ${product.model} (${product.id})`)
    const priceData = loadPriceFile(product.id) || {
      productId: product.id,
      lastCheckedAt: null,
      observations: []
    }

    let changed = false

    for (const [store, url] of Object.entries(urls)) {
      console.log(`  → ${store}: ${url}`)
      const price = await fetchPrice(url, STORE_SCRAPERS[store])

      if (price) {
        console.log(`    Preço encontrado: R$ ${price.toFixed(2)}`)

        // Atualizar ou adicionar observation
        const existing = priceData.observations.findIndex(o => o.store.toLowerCase() === store)
        const entry = {
          store: store.charAt(0).toUpperCase() + store.slice(1),
          url: url,
          price: Math.round(price),
          checkedAt: new Date().toISOString()
        }

        if (existing >= 0) {
          const oldPrice = priceData.observations[existing].price
          const variation = Math.abs(price - oldPrice) / oldPrice
          entry.regularPrice = priceData.observations[existing].regularPrice || priceData.observations[existing].price

          if (variation > 0.3) {
            console.log(`    ⚠ Variação >30%: R$ ${oldPrice} → R$ ${Math.round(price)}. Alerta gerado.`)
            // Não atualiza automaticamente — gera alerta
            continue
          }

          priceData.observations[existing] = entry
          changed = true
        } else {
          priceData.observations.push(entry)
          changed = true
        }
      } else {
        console.log(`    Preço não encontrado`)
        errors++
      }
    }

    if (changed) {
      priceData.lastCheckedAt = new Date().toISOString()
      savePriceFile(product.id, priceData)
      updated++
      console.log(`  ✓ Salvo`)
    }
  }

  console.log(`\n=== Resumo ===`)
  console.log(`Atualizados: ${updated}/${products.length}`)
  console.log(`Erros: ${errors}`)
}

main().catch(console.error)
