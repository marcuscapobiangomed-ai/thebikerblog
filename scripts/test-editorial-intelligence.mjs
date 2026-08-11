import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildEditorialIntelligence, intelligenceMarkdown, queryCluster, searchIntent } from './lib/editorial-intelligence.mjs';
import { cachedYoutubePayload, normalizeGoogleAdsKeywordIdeas, parseGoogleTrendsRss, periodsFor } from './run-editorial-intelligence.mjs';

const youtubeCache = await fs.mkdtemp(path.join(os.tmpdir(), 'thebiker-youtube-cache-'));
let youtubeLoads = 0;
const firstCachedPayload = await cachedYoutubePayload({
  cacheDirectory: youtubeCache,
  key: 'busca-brasil',
  loader: async () => { youtubeLoads += 1; return { items: [{ id: 'video-1' }] }; },
});
const secondCachedPayload = await cachedYoutubePayload({
  cacheDirectory: youtubeCache,
  key: 'busca-brasil',
  loader: async () => { youtubeLoads += 1; return { items: [] }; },
});
assert.equal(youtubeLoads, 1);
assert.deepEqual(secondCachedPayload, firstCachedPayload);
await fs.rm(youtubeCache, { recursive: true, force: true });

const trendsRss = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
  <item><title>bicicleta gravel brasil</title><ht:approx_traffic>2,000+</ht:approx_traffic><pubDate>Sat, 8 Aug 2026 08:40:00 -0700</pubDate><link>https://trends.google.com/trending/rss?geo=BR&amp;hl=pt-BR</link></item>
  <item><title>assunto geral</title><ht:approx_traffic>20,000+</ht:approx_traffic><pubDate>Sat, 8 Aug 2026 08:40:00 -0700</pubDate></item>
</channel></rss>`;
const parsedTrends = parseGoogleTrendsRss(trendsRss);
assert.equal(parsedTrends.length, 2);
assert.equal(parsedTrends[0].title, 'bicicleta gravel brasil');
assert.equal(parsedTrends[0].sourceUrl.includes('&hl=pt-BR'), true);

const marketDemand = normalizeGoogleAdsKeywordIdeas([
  {
    text: 'bicicleta scott',
    closeVariants: ['bike scott'],
    keywordIdeaMetrics: {
      avgMonthlySearches: '12100', competition: 'HIGH', competitionIndex: '78',
      lowTopOfPageBidMicros: '1200000', highTopOfPageBidMicros: '4500000',
      monthlySearchVolumes: [
        { year: '2026', month: 'JANUARY', monthlySearches: '8000' },
        { year: '2026', month: 'FEBRUARY', monthlySearches: '8500' },
        { year: '2026', month: 'MARCH', monthlySearches: '9000' },
        { year: '2026', month: 'APRIL', monthlySearches: '11000' },
        { year: '2026', month: 'MAY', monthlySearches: '12000' },
        { year: '2026', month: 'JUNE', monthlySearches: '13000' },
      ],
    },
  },
  { text: 'Trek promoção', keywordIdeaMetrics: { avgMonthlySearches: '50000', competition: 'HIGH' } },
]);
assert.equal(marketDemand[0].averageMonthlySearches, 12100);
assert.equal(marketDemand[0].monthlySearchVolumes[5].monthlySearches, 13000);

const context = {
  runKey: 'weekly-2026-08-08',
  cadence: 'weekly',
  generatedAt: '2026-08-08T12:00:00.000Z',
  periods: {},
};
const config = {
  searchConsoleCountry: 'bra',
  maximumSearchQueries: 1000,
  trendsMaximumSignals: 20,
  youtubeMaximumVideos: 20,
  requirePortugueseYouTube: true,
  cyclingTerms: ['ciclismo', 'bicicleta', 'mtb', 'suspensão', 'brasil'],
  blockedPromotionBrands: ['Trek'],
  portfolioBrands: ['Scott', 'Shimano'],
  minimumImpressions: 5,
  maximumBriefs: 8,
  refreshAfterDays: 90,
  youtubeSearches: Array.from({ length: 12 }, (_, index) => ({ id: `busca-${index + 1}`, regionCode: 'BR', relevanceLanguage: 'pt' })),
};

const brazilQueries = Array.from({ length: 1105 }, (_, index) => ({
  keys: [`como ajustar suspensão mtb brasil ${index + 1}`, `https://example.com/seo-${index + 1}/`, 'bra', index % 2 ? 'MOBILE' : 'DESKTOP'],
  clicks: index % 9,
  impressions: 20 + index,
  ctr: 0.03,
  position: 5 + (index % 15),
  _propertyId: 'blog',
  _propertyRole: 'editorial',
}));
const previousQueries = brazilQueries.map((row) => ({
  ...row,
  clicks: Math.max(0, row.clicks - 1),
  impressions: Math.max(5, Math.floor(row.impressions / 2)),
  position: row.position + 2,
}));
brazilQueries.push({ keys: ['consulta fora do brasil', 'https://example.com/fora/', 'usa', 'DESKTOP'], clicks: 100, impressions: 99999, ctr: 0.2, position: 1 });
brazilQueries.push({ keys: ['ajuste suspensão canibalizado', 'https://example.com/a/', 'bra', 'MOBILE'], clicks: 2, impressions: 200, ctr: 0.01, position: 8 });
brazilQueries.push({ keys: ['ajuste suspensão canibalizado', 'https://example.com/b/', 'bra', 'DESKTOP'], clicks: 1, impressions: 100, ctr: 0.01, position: 10 });
brazilQueries.push({
  keys: ['como ajustar suspensão mtb brasil 1', 'https://thebikershop.com.br/suspensoes/', 'bra', 'MOBILE'],
  clicks: 5, impressions: 5000, ctr: 0.001, position: 6,
  _propertyId: 'shop', _propertyRole: 'commercial',
});
previousQueries.push({
  keys: ['como ajustar suspensão mtb brasil 1', 'https://thebikershop.com.br/suspensoes/', 'bra', 'MOBILE'],
  clicks: 2, impressions: 2500, ctr: 0.0008, position: 8,
  _propertyId: 'shop', _propertyRole: 'commercial',
});

const videos = [
  ...Array.from({ length: 25 }, (_, index) => ({
    id: `br-${index + 1}`,
    snippet: { title: `Como ajustar bicicleta MTB Brasil ${index + 1}`, description: 'Ciclismo técnico brasileiro', publishedAt: '2026-08-01T00:00:00Z', channelTitle: `Canal técnico ${index + 1}` },
    statistics: { viewCount: String(900000 - index * 10000), likeCount: '5000', commentCount: '300' },
    contentDetails: { duration: index % 2 ? 'PT8M20S' : 'PT45S' },
    _intelligence: { markets: ['BR'], languages: ['pt'], searches: [`busca-${(index % 12) + 1}`, 'ciclismo-tecnico'] },
  })),
  { id: 'motorized', snippet: { title: 'SurRon MTB dirt bike Brasil', description: 'motocross', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '9000000' } },
  { id: 'celebrity', snippet: { title: 'Neymar no futebol e bicicleta Brasil', description: 'viral funny', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '8000000' } },
  { id: 'foreign', snippet: { title: 'What cycling training is actually doing', description: 'Como ajustar bicicleta Brasil', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '8500000' } },
  { id: 'competitor', snippet: { title: 'Trek lançamento MTB Brasil', description: 'ciclismo', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '7000000' }, contentDetails: { duration: 'PT10M' }, _intelligence: { markets: ['BR'], languages: ['pt'], searches: ['mountain-bike'] } },
];

const report = buildEditorialIntelligence({
  context,
  config,
  gscCurrent: brazilQueries,
  gscPrevious: previousQueries,
  videos,
  googleTrends: parsedTrends,
  googleTrendsStatus: { status: 'available', error: null },
  marketDemand,
  marketDemandStatus: { status: 'available', error: null },
  publicShopSeo: {
    status: 'available',
    siteAudit: { status: 'available', error: null, signal: { source: 'public-site-audit', evidenceClass: 'public_measurement', targetUrl: 'https://thebikershop.com.br/', httpStatus: 200, robotsStatus: 200, sitemapStatus: 200, checks: { title: true, metaDescription: true, canonical: true, h1: true, structuredData: true, noindex: false } } },
    pageSpeed: { status: 'available', error: null, signal: { source: 'pagespeed-insights', evidenceClass: 'public_measurement', targetUrl: 'https://thebikershop.com.br/', scores: { performance: 72, seo: 96, accessibility: 88 } } },
  },
  youtubeStatus: { status: 'available', error: null },
  searchConsoleDiagnostics: {
    current: {
      brazil: { clicks: 4, impressions: 140, ctr: 4 / 140, position: 8.4 },
      global: { clicks: 6, impressions: 220, ctr: 6 / 220, position: 9.1 },
    },
    previous: {
      brazil: { clicks: 2, impressions: 70, ctr: 2 / 70, position: 10.4 },
      global: { clicks: 3, impressions: 110, ctr: 3 / 110, position: 11.1 },
    },
  },
  articles: [{ title: 'Ajuste de suspensão MTB', tags: ['suspensão'], url: 'https://example.com/ajuste/', dateModified: '2026-01-01T00:00:00Z' }],
});

assert.equal(report.schemaVersion, 6);
assert.equal(report.scope.label.includes('Brasil'), true);
assert.equal(report.brazilRankings.youtubeDiscovery.length, 20);
assert.ok(report.brazilRankings.seoMeasured.length > 1000);
assert.equal(report.brazilRankings.seoByProperty.blog.length, 1000);
assert.ok(report.brazilRankings.seoMeasured.every((item) => item.source === 'search-console'));
assert.ok(report.brazilRankings.seoMeasured.every((item) => item.countries.every((country) => country === 'bra')));
assert.ok(report.brazilRankings.youtubeDiscovery.every((item) => !['motorized', 'celebrity'].some((id) => item.sourceUrl.endsWith(id))));
assert.ok(report.brazilRankings.youtubeDiscovery.every((item) => !item.sourceUrl.endsWith('foreign')));
assert.ok(report.briefs.every((brief) => !/^Trek lançamento/.test(brief.topic)));
assert.equal(report.governance.youtubeDoesNotFillMeasuredSeo, true);
assert.equal(report.governance.brazilClaimRequiresCountryFilter, true);
assert.equal(report.metrics.youtubeSearchesConfigured, 12);
assert.equal(report.youtubeStatus.status, 'available');
assert.equal(report.metrics.googleTrendsSourceItems, 2);
assert.equal(report.metrics.googleTrendsNicheSignals, 1);
assert.equal(report.metrics.publicShopSeoAvailable, true);
assert.deepEqual(Object.keys(report.brazilRankings.seoByProperty), ['blog', 'shop']);
assert.equal(report.crossDomainOpportunities.length, 1);
assert.deepEqual(report.crossDomainOpportunities[0].propertyIds, ['blog', 'shop']);
assert.equal(report.brazilRankings.googleTrendsDiscovery[0].signalTitle, 'bicicleta gravel brasil');
assert.equal(report.brazilRankings.googleMarketDemand.length, 1);
assert.equal(report.brazilRankings.googleMarketDemand[0].term, 'bicicleta scott');
assert.equal(report.brazilRankings.googleMarketDemand[0].averageMonthlySearches, 12100);
assert.equal(report.brazilRankings.googleMarketDemand[0].portfolioRelevance, 'seed_or_brand_match');
assert.ok(report.brazilRankings.googleMarketDemand[0].trend > 0);
assert.equal(report.metrics.googleMarketDemandKeywords, 1);
assert.equal(report.governance.keywordPlannerIsMarketDemandNotOwnedVisibility, true);
assert.equal(report.searchConsoleDiagnostics.interpretation, 'brazil_query_rows_available');
assert.equal(report.governance.googleTrendsDoesNotFillMeasuredSeo, true);
assert.ok(report.queryClusters.some((cluster) => cluster.cluster === 'suspensao'));
assert.equal(queryCluster('qual pressão do pneu tubeless'), 'pneus-tubeless');
assert.equal(searchIntent('onde comprar bicicleta gravel'), 'commercial');
assert.match(intelligenceMarkdown(report), /20 sinais de YouTube Brasil/);
assert.match(intelligenceMarkdown(report), /até \*\*1\.000 consultas por propriedade\*\*/);
assert.match(intelligenceMarkdown(report), /Payload compacto para o planejador mensal/);
assert.match(intelligenceMarkdown(report), /Diagnóstico do Search Console/);
assert.match(intelligenceMarkdown(report), /Google Trends Brasil/);
assert.match(intelligenceMarkdown(report), /Demanda total no Google Brasil/);
assert.match(intelligenceMarkdown(report), /12\.100/);
assert.match(intelligenceMarkdown(report), /Oportunidades cruzadas/);
assert.match(intelligenceMarkdown(report), /Diagnóstico público gratuito da TheBikerShop/);
assert.match(intelligenceMarkdown(report), /public_measurement/);
assert.ok(
  intelligenceMarkdown(report).length < 65_000,
  `GitHub issue body exceeded safe size: ${intelligenceMarkdown(report).length}`,
);

const emptySeo = buildEditorialIntelligence({ context, config, videos: videos.slice(0, 2) });
assert.equal(emptySeo.brazilRankings.seoMeasured.length, 0);
assert.equal(emptySeo.brazilRankings.youtubeDiscovery.length, 2);
assert.match(intelligenceMarkdown(emptySeo), /Dados SEO medidos ainda insuficientes/);
assert.equal(emptySeo.searchConsoleDiagnostics.interpretation, 'no_finalized_global_impressions');
assert.equal(emptySeo.governance.planningStatus, 'actionable');
const noSignals = buildEditorialIntelligence({ context, config });
assert.equal(noSignals.governance.planningStatus, 'insufficient_signals');
assert.match(intelligenceMarkdown(noSignals), /not_configured/);

assert.deepEqual(periodsFor({ cadence: 'weekly', generatedAt: '2026-08-07T12:00:00.000Z' }), {
  lookbackDays: 7,
  dataDelayDays: 3,
  current: { startDate: '2026-07-29', endDate: '2026-08-04' },
  previous: { startDate: '2026-07-22', endDate: '2026-07-28' },
});

console.log('Motor de inteligência editorial Brasil validado com sucesso.');
