import { CampaignSchema } from './campaign.js'

const READY_STATUSES = new Set(['scheduled'])

export function campaignLocalDate(now, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function campaignCoverageSnapshot(value, { now = new Date(), requiredDate = null } = {}) {
  const campaign = CampaignSchema.parse(value)
  const today = campaignLocalDate(now, campaign.timezone)
  const futureItems = campaign.items.filter((item) => item.publishDate >= today)
  const todayAlreadyPublished = futureItems[0]?.publishDate === today && futureItems[0]?.status === 'published'
  const coverageItems = todayAlreadyPublished ? futureItems.slice(1) : futureItems
  const futureScheduled = futureItems.filter((item) => item.status === 'scheduled')
  let consecutiveReadyDays = 0
  for (const item of coverageItems) {
    if (!READY_STATUSES.has(item.status)) break
    consecutiveReadyDays += 1
  }
  const firstGap = coverageItems[consecutiveReadyDays] || null
  const required = requiredDate
    ? campaign.items.find((item) => item.publishDate === requiredDate) || null
    : null
  return {
    today,
    coverageStartsOn: coverageItems[0]?.publishDate || null,
    consecutiveReadyDays,
    firstGapDate: firstGap?.publishDate || null,
    firstGapStatus: firstGap?.status || null,
    firstGapItemId: firstGap?.id || null,
    futureScheduled: futureScheduled.length,
    scheduledIds: futureScheduled.map((item) => item.id),
    requiredDate,
    requiredStatus: required?.status || null,
    requiredReady: !requiredDate || ['scheduled', 'published'].includes(required?.status),
  }
}
