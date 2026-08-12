import assert from 'node:assert/strict'
import { eligible } from './build-public-catalog.js'

const product = {
  portfolioStatus: 'verified',
  storeProductUrl: 'https://www.thebikershop.com.br/produtos/bicicleta-teste',
  portfolioVerifiedAt: '2026-08-04'
}

assert.equal(eligible(product, new Date('2026-08-11T23:59:59Z')), true, 'deve aceitar o item durante o sétimo dia')
assert.equal(eligible(product, new Date('2026-08-12T00:00:00Z')), false, 'deve expirar o item no início do oitavo dia')
assert.equal(eligible({ ...product, portfolioStatus: 'pending' }, new Date('2026-08-05T00:00:00Z')), false)
assert.equal(eligible({ ...product, storeProductUrl: 'https://example.com/produto' }, new Date('2026-08-05T00:00:00Z')), false)

console.log('Fronteira temporal do catálogo público validada com sucesso.')
