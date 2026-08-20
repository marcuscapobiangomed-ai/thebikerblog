import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

export const TOPIC_COOLDOWN_DAYS = 180

const STOP_WORDS = new Set([
  'a', 'as', 'ao', 'aos', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos',
  'por', 'que', 'sem', 'um', 'uma', 'vs',
])

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function editorialTopicKey(value) {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !/^20\d{2}$/.test(token))
    .slice(0, 8)
    .join('-')
}

function isoDate(value, fallback) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] || fallback
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => error?.code === 'ENOENT' ? [] : Promise.reject(error))
  const files = []
  for (const entry of entries) {
    if (entry.name === 'drafts') continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await markdownFiles(target))
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target)
  }
  return files
}

function postIdentifier(file) {
  return path.basename(file, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

export async function buildEditorialTopicLedger({ root, now = new Date(), cooldownDays = TOPIC_COOLDOWN_DAYS } = {}) {
  const postsRoot = path.join(root, '_posts')
  const files = await markdownFiles(postsRoot)
  const items = []
  for (const file of files) {
    const parsed = matter(await fs.readFile(file, 'utf8'))
    const historicalPublication = parsed.data.published === true || parsed.data.editorial_status === 'published'
    if (!historicalPublication) continue
    const relativePath = path.relative(root, file).replace(/\\/g, '/')
    const fallbackDate = path.basename(file).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || now.toISOString().slice(0, 10)
    const publishedAt = isoDate(parsed.data.date, fallbackDate)
    const id = postIdentifier(file)
    const slug = normalize(parsed.data.slug || id).replace(/\s+/g, '-')
    const title = String(parsed.data.title || slug).trim()
    const productIds = [
      ...(Array.isArray(parsed.data.product_ids) ? parsed.data.product_ids : []),
      ...(parsed.data.image_subject_id ? [parsed.data.image_subject_id] : []),
    ].map(String)
    items.push({
      id,
      slug,
      topicKey: editorialTopicKey(title),
      title,
      canonicalUrl: String(parsed.data.permalink || `/${slug}/`),
      publishedAt,
      cooldownUntil: addDays(publishedAt, cooldownDays),
      category: String(parsed.data.category || parsed.data.content_type || ''),
      productIds: [...new Set(productIds)],
      postPath: relativePath,
    })
  }
  items.sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.id.localeCompare(right.id))
  return {
    schemaVersion: 1,
    generatedAt: items.length > 0 ? `${items.at(-1).publishedAt}T12:00:00.000Z` : null,
    cooldownDays,
    items,
  }
}

export function topicHistoryBlocksCandidate(candidate, historyItems = [], { onDate } = {}) {
  const exactPublication = historyItems.some((entry) => entry.id === candidate.id || entry.slug === candidate.id)
  if (exactPublication) return true
  if (candidate.category === 'competicoes') return false
  const key = editorialTopicKey(candidate.title)
  return historyItems.some((entry) => {
    return Boolean(key && entry.topicKey === key && (!onDate || entry.cooldownUntil >= onDate))
  })
}

export async function writeEditorialTopicLedger({ root, now = new Date() } = {}) {
  const ledger = await buildEditorialTopicLedger({ root, now })
  const target = path.join(root, '_data/editorial-topic-ledger.json')
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, `${JSON.stringify(ledger, null, 2)}\n`)
  return ledger
}
