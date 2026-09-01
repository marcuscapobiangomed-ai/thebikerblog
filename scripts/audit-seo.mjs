import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'

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
const excluded = new Set(config.exclude || [])
for (const entry of ['admin', 'audit', 'content', 'data-room', 'docs', 'output', 'project', 'screenshots', 'sql']) {
  if (!excluded.has(entry)) failures.push(`_config.yml: superfície operacional não excluída (${entry})`)
}
if (!excluded.has('automation')) failures.push('_config.yml: superfície operacional não excluída (automation)')
if (fs.existsSync(path.join(ROOT, 'sobre.md'))) failures.push('sobre.md: rota /sobre/ duplicada com sobre/index.html')

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
  if (String(data.title || '').length > 70) warnings.push(`${file}: título longo (${String(data.title).length} caracteres)`)
  const descriptionLength = String(data.description || '').length
  if (descriptionLength < 90 || descriptionLength > 170) warnings.push(`${file}: descrição com ${descriptionLength} caracteres`)
  if (new Date(data.last_modified_at) < new Date(data.date)) failures.push(`${file}: última modificação anterior à publicação`)
  if (/\b(o|a|de|do|da|e)$/i.test(String(data.direct_answer || '').trim())) failures.push(`${file}: resposta direta aparenta estar truncada`)
  if (!Array.isArray(data.sources) || data.sources.length === 0) failures.push(`${file}: nenhuma fonte estruturada`)
  if (data.ai_assisted === true && String(data.ai_reviewed_by || "").trim() !== "TheBiker AI Editorial Gate") {
    warnings.push(`${file}: ai_reviewed_by ausente ou incompatível com o gate automatizado`)
  }
  if (!/(?:href=["']|\]\()\/(?!\/)/i.test(body)) {
    warnings.push(`${file}: nenhum link interno contextual detectado no corpo editorial`)
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
if (!read('_includes/head.html').includes('{% if page.layout == "post" %}')) failures.push('_includes/head.html: posts devem evitar o JSON-LD duplicado do jekyll-seo-tag')
if (read('_layouts/post.html').includes('{% include faq-schema.html %}')) failures.push('_layouts/post.html: FAQ não pode depender de JavaScript no cliente')
const articleStyles = read('assets/css/style.css')
if (!/\.answer-block p:last-child\s*\{[^}]*text-align:\s*justify;/s.test(articleStyles)) {
  failures.push('assets/css/style.css: resposta direta não acompanha o alinhamento justificado do artigo')
}
const productSchema = read('_includes/schema-product.html')
if (productSchema.includes('"offers"')) failures.push('_includes/schema-product.html: oferta não pode ser publicada enquanto o comércio visível está desativado')
if (!read('_layouts/product/bike.html').includes('{% include product-faq.html product=product_record %}')) failures.push('_layouts/product/bike.html: FAQ estruturada sem equivalente visível')
for (const utilityPage of ['search.html', 'newsletter.html', '404.html', 'legal/contributor-agreement.md', 'legal/data-processing-agreement.md', 'legal/partner-agreement.md']) {
  const { data } = frontmatter(utilityPage)
  if (data.sitemap !== false || !String(data.robots || '').startsWith('noindex')) failures.push(`${utilityPage}: página utilitária deve ficar fora do índice`)
}

console.log(`SEO auditado: ${publishedPosts} artigos e ${publishedProducts} produtos publicados.`)
for (const warning of warnings) console.warn(`AVISO: ${warning}`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`ERRO: ${failure}`)
  console.error(`Gate SEO reprovado: ${failures.length} erro(s), ${warnings.length} aviso(s).`)
  process.exit(1)
}
console.log(`Gate SEO aprovado com ${warnings.length} aviso(s) de melhoria editorial.`)
