import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { eligible, assertSafeCatalogTransition } from './build-public-catalog.js'
import { revalidatePortfolio } from './revalidate-thebiker-catalog.js'

const product = {
  portfolioStatus: 'verified',
  storeProductUrl: 'https://www.thebikershop.com.br/produtos/bicicleta-teste',
  portfolioVerifiedAt: '2026-08-04',
  brand: 'Scott', model: 'Modelo Teste', modelYear: 2026, category: 'road-race', image: '/bike.webp',
  frame: { material: 'carbon', technology: 'HMF' },
  fork: { model: 'Fork HMF' },
  drivetrain: { brand: 'Shimano', groupset: '105', speeds: 12, shifting: 'electronic' },
  brakes: { brand: 'Shimano', model: 'BR-R7170', type: 'hydraulic-disc' },
  wheels: { brand: 'Syncros', model: 'RP2.0' },
  tires: { brand: 'Schwalbe', model: 'One' }
}

assert.equal(eligible(product, new Date('2026-08-11T23:59:59Z')), true, 'deve aceitar o item durante o sétimo dia')
assert.equal(eligible(product, new Date('2026-08-12T00:00:00Z')), false, 'deve expirar o item no início do oitavo dia')
assert.equal(eligible({ ...product, portfolioStatus: 'pending' }, new Date('2026-08-05T00:00:00Z')), false)
assert.equal(eligible({ ...product, storeProductUrl: 'https://example.com/produto' }, new Date('2026-08-05T00:00:00Z')), false)
assert.equal(eligible({ ...product, drivetrain: { ...product.drivetrain, groupset: 'pendente de confirmação' } }, new Date('2026-08-05T00:00:00Z')), false, 'placeholder operacional deve ocultar o produto')
assert.equal(eligible({ ...product, brakes: { ...product.brakes, model: null } }, new Date('2026-08-05T00:00:00Z')), false, 'ficha técnica incompleta deve ficar fora da superfície pública')
assert.throws(() => assertSafeCatalogTransition({ totalBikes: 29 }, { totalBikes: 0 }), /transição de 29 produtos para zero/)
assert.doesNotThrow(() => assertSafeCatalogTransition({ totalBikes: 29 }, { totalBikes: 0 }, { allowEmpty: true }))

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'thebiker-catalog-revalidation-'))
try {
  const productsDir = path.join(root, '_data/products/bikes')
  await fs.mkdir(productsDir, { recursive: true })
  for (const [name, slug] of [['one', 'produto-um'], ['two', 'produto-dois']]) {
    await fs.writeFile(path.join(productsDir, `${name}.json`), JSON.stringify({
      id: name, portfolioStatus: 'verified', portfolioVerifiedAt: '2026-08-01', updatedAt: '2026-08-01',
      storeProductUrl: `https://thebikershop.com.br/produtos/${slug}/`,
    }))
  }
  const result = await revalidatePortfolio({ rootDir: root, now: new Date('2026-08-13T12:00:00Z'), fetchImpl: async (url) => ({ ok: true, status: 200, url }) })
  assert.equal(result.validated, 2)
  const renewed = JSON.parse(await fs.readFile(path.join(productsDir, 'one.json'), 'utf8'))
  assert.equal(renewed.portfolioVerifiedAt, '2026-08-13')
  await assert.rejects(() => revalidatePortfolio({ rootDir: root, fetchImpl: async (url) => ({ ok: url.includes('produto-um'), status: 503, url }) }), /mínimo 80%/)
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('Fronteira temporal do catálogo público validada com sucesso.')
