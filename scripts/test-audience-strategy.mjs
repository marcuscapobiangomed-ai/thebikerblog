import assert from 'node:assert/strict'
import fs from 'node:fs'

const audience = JSON.parse(fs.readFileSync(new URL('../_data/audience.json', import.meta.url), 'utf8'))
const policy = JSON.parse(fs.readFileSync(new URL('../api/audience.json', import.meta.url), 'utf8'))
const editorialPolicy = JSON.parse(fs.readFileSync(new URL('../api/editorial-policy.json', import.meta.url), 'utf8'))
const products = JSON.parse(fs.readFileSync(new URL('../api/products.json', import.meta.url), 'utf8'))
const llms = fs.readFileSync(new URL('../llms.txt', import.meta.url), 'utf8')
const contentIndex = fs.readFileSync(new URL('../api/content-index.json', import.meta.url), 'utf8')

assert.equal(audience.schemaVersion, '1.0')
assert.deepEqual(policy, audience, 'api/audience.json precisa refletir a fonte canônica')
assert.equal(new Set(audience.segments.map((segment) => segment.id)).size, audience.segments.length)
assert.ok(audience.segments.some((segment) => segment.priority === 'primary'))
assert.ok(audience.intentTaxonomy.includes(audience.defaults.audienceIntent))
assert.ok(audience.experienceLevelTaxonomy.includes(audience.defaults.experienceLevelTarget))
assert.equal(audience.privacy.inferOccupation, false)
assert.equal(audience.privacy.inferPersonalExperienceLevel, false)
assert.equal(editorialPolicy.schemaVersion, '2.0')
assert.ok(Array.isArray(editorialPolicy.commitment) && editorialPolicy.commitment.length >= 3)
for (const privateKey of ['rules', 'sourcePriority', 'audiencePolicy']) {
  assert.equal(privateKey in editorialPolicy, false, `política pública não deve expor ${privateKey}`)
}
const internalVocabulary = /rascunh|bloquead|pendente|n[aã]o confirmad|diverg|inconsist|quarentena/iu
assert.doesNotMatch(llms, internalVocabulary, 'llms.txt não deve expor estados editoriais internos')
assert.doesNotMatch(JSON.stringify(editorialPolicy), internalVocabulary, 'política pública não deve expor estados internos')
assert.doesNotMatch(contentIndex, /reviewMethod|testedByTheBiker|audiencePolicy/, 'índice público não deve expor metadados de processo')
assert.equal(products.total, products.products.length)
assert.ok(products.products.length > 0, 'endpoint deve preservar ao menos um produto completamente verificável')
for (const product of products.products) {
  assert.ok(product.sources.every((source) => source.type === 'manufacturer'), `${product.id}: somente fontes oficiais podem ser exportadas`)
  assert.ok(Object.keys(product.confirmedFacts).length > 0, `${product.id}: fatos confirmados ausentes`)
  assert.equal('portfolioVerifiedAt' in product, false, `${product.id}: metadado operacional exposto`)
  assert.doesNotMatch(JSON.stringify(product), /n[aã]o informado|n[aã]o confirmad|pendente|bloquead/iu, `${product.id}: qualificador interno exposto`)
}

console.log('Estratégia de público, privacidade e endpoint público validados.')
