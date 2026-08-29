import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'
import { jaccardSimilarity, pageFingerprint, validateSeoPageMetadata } from './lib/seo-page-gate.mjs'
import { seoMetadataIssues } from '../bot/src/seo-metadata.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const warnings = []

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function frontmatter(relativePath) {
  const source = read(relativePath)
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) throw new Error(`Front matter ausente: ${relativePath}`)
  return { data: loadYaml(match[1]) || {}, body: source.slice(match[0].length) }
}

function requireFields(file, data, fields) {
  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      failures.push(`${file}: campo obrigatório ausente (${field})`)
    }
  }
}

const config = loadYaml(read('_config.yml'))
const publicCatalog = JSON.parse(read('_data/catalog-public.json'))
const verifiedProductIds = new Set((publicCatalog.bikes || []).map((product) => product.id))
const excluded = new Set(config.exclude || [])
for (const entry of ['admin', 'audit', 'content', 'data-room', 'docs', 'output', 'project', 'screenshots', 'sql']) {
  if (!excluded.has(entry)) failures.push(`_config.yml: superfície operacional não excluída (${entry})`)
}

const robots = read('robots.txt')
for (const agent of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Googlebot', 'bingbot']) {
  if (!robots.includes(`User-agent: ${agent}`)) failures.push(`robots.txt: crawler de pesquisa ausente (${agent})`)
}
for (const trainingAgent of ['GPTBot', 'ClaudeBot']) {
  if (!new RegExp(`User-agent: ${trainingAgent}\\s+Disallow: /`, 'm').test(robots)) {
    failures.push(`robots.txt: crawler de treinamento sem bloqueio explícito (${trainingAgent})`)
  }
}
if (!/Sitemap:\s*\{\{ site\.url \}\}\{\{ site\.baseurl \}\}\/sitemap\.xml/.test(robots)) {
  failures.push('robots.txt: declaração de sitemap ausente ou inesperada')
}

const llms = read('llms.txt')
for (const endpoint of ['/sitemap.xml', '/feed.xml', '/api/content-index.json', '/api/editorial-policy.json']) {
  if (!llms.includes(endpoint)) failures.push(`llms.txt: endpoint ausente (${endpoint})`)
}
if (!/for post in public_posts limit:20/.test(llms)) failures.push('llms.txt: lista recente precisa ter limite explícito')

const postFiles = fs.readdirSync(path.join(ROOT, '_posts')).filter((name) => /\.(md|html)$/.test(name))
let publishedPosts = 0
const programmaticSeoPages = []
for (const name of postFiles) {
  const file = `_posts/${name}`
  const { data, body } = frontmatter(file)
  if (data.published === false || data.status === 'draft' || data.editorial_status === 'draft') continue
  publishedPosts++
  requireFields(file, data, ['title', 'description', 'direct_answer', 'date', 'last_modified_at', 'author', 'content_type', 'review_method', 'image', 'image_alt'])
  const directAnswerLength = String(data.direct_answer || '').length
  if (directAnswerLength < 80 || directAnswerLength > 420) failures.push(`${file}: resposta direta com ${directAnswerLength} caracteres`)
  if (data.faq !== undefined) {
    if (!Array.isArray(data.faq) || data.faq.length > 5) failures.push(`${file}: FAQ precisa ser uma lista de até cinco itens`)
    for (const [index, item] of (Array.isArray(data.faq) ? data.faq : []).entries()) {
      if (!item?.question || !item?.answer) failures.push(`${file}: FAQ ${index + 1} sem pergunta ou resposta`)
    }
  }
  for (const issue of seoMetadataIssues({ title: data.title, description: data.description, directAnswer: data.direct_answer })) {
    failures.push(`${file}: ${issue}`)
  }
  if (!Array.isArray(data.sources) || data.sources.length === 0) failures.push(`${file}: nenhuma fonte estruturada`)
  for (const error of validateSeoPageMetadata(data, body)) failures.push(`${file}: ${error}`)
  for (const productId of (data.seo_page?.verified_product_ids || [])) {
    if (!verifiedProductIds.has(productId)) failures.push(`${file}: produto SEO nao verificado no catalogo publico (${productId})`)
  }
  if (data.seo_page) programmaticSeoPages.push({ file, fingerprint: pageFingerprint(body) })
}

for (let left = 0; left < programmaticSeoPages.length; left += 1) {
  for (let right = left + 1; right < programmaticSeoPages.length; right += 1) {
    const similarity = jaccardSimilarity(programmaticSeoPages[left].fingerprint, programmaticSeoPages[right].fingerprint)
    if (similarity >= 0.78) {
      failures.push(`${programmaticSeoPages[left].file} e ${programmaticSeoPages[right].file}: similaridade programatica excessiva (${(similarity * 100).toFixed(0)}%)`)
    }
  }
}

const productFiles = []
function walkProducts(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) walkProducts(absolute)
    else if (entry.name === 'index.html') productFiles.push(path.relative(ROOT, absolute).replaceAll('\\', '/'))
  }
}
walkProducts(path.join(ROOT, 'bikes'))
let publishedProducts = 0
for (const file of productFiles) {
  const { data } = frontmatter(file)
  if (data.published !== true) continue
  publishedProducts++
  requireFields(file, data, ['title', 'description', 'image', 'image_alt', 'product_id', 'brand', 'model', 'modelYear', 'category'])
}

for (const page of ['sobre/index.html', 'api/content-index.json']) {
  if (!fs.existsSync(path.join(ROOT, page))) failures.push(`página estrutural ausente (${page})`)
}
if (!read('_layouts/post.html').includes('id="fontes-do-artigo"')) failures.push('_layouts/post.html: seção visível de fontes ausente')
if (!read('_layouts/post.html').includes('{% include answer-block.html %}')) failures.push('_layouts/post.html: resposta direta visível ausente')
if (!read('_layouts/post.html').includes('{% include article-structured-data.html %}')) failures.push('_layouts/post.html: grafo JSON-LD estático ausente')
if (read('_layouts/post.html').includes('{% include faq-schema.html %}')) failures.push('_layouts/post.html: FAQ não pode depender de JavaScript no cliente')
const articleStyles = read('assets/css/style.css')
if (!/\.answer-block p:last-child\s*\{[^}]*text-align:\s*justify;/s.test(articleStyles)) {
  failures.push('assets/css/style.css: resposta direta não acompanha o alinhamento justificado do artigo')
}

console.log(`SEO auditado: ${publishedPosts} artigos e ${publishedProducts} produtos publicados.`)
for (const warning of warnings) console.warn(`AVISO: ${warning}`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`ERRO: ${failure}`)
  console.error(`Gate SEO reprovado: ${failures.length} erro(s), ${warnings.length} aviso(s).`)
  process.exit(1)
}
console.log(`Gate SEO aprovado com ${warnings.length} aviso(s) de melhoria editorial.`)
