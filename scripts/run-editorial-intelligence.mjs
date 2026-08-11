#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildEditorialIntelligence, intelligenceMarkdown } from './lib/editorial-intelligence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(value, amount) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

export function periodsFor({ cadence, generatedAt }) {
  const lookbackDays = cadence === 'monthly' ? 28 : 7;
  const finalEnd = new Date(generatedAt);
  finalEnd.setUTCDate(finalEnd.getUTCDate() - 3);
  const currentEnd = isoDate(finalEnd);
  const currentStart = addUtcDays(currentEnd, -(lookbackDays - 1));
  const previousEnd = addUtcDays(currentStart, -1);
  const previousStart = addUtcDays(previousEnd, -(lookbackDays - 1));
  return {
    lookbackDays,
    dataDelayDays: 3,
    current: { startDate: currentStart, endDate: currentEnd },
    previous: { startDate: previousStart, endDate: previousEnd },
  };
}

async function responseJson(response, label) {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`${label}: HTTP ${response.status} - ${detail}`);
  }
  return response.json();
}

async function googleAccessToken(env) {
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Credenciais Google ausentes: ${missing.join(', ')}`);
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await responseJson(response, 'OAuth Google');
  if (!payload.access_token) throw new Error('OAuth Google não retornou access_token');
  return payload.access_token;
}

async function googleAdsAccessToken(env) {
  const mapped = {
    GOOGLE_CLIENT_ID: env.GOOGLE_ADS_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_ADS_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: env.GOOGLE_ADS_REFRESH_TOKEN,
  };
  try {
    return await googleAccessToken(mapped);
  } catch (error) {
    throw new Error(String(error?.message || error).replace('Credenciais Google ausentes', 'Credenciais OAuth Google Ads ausentes'));
  }
}

export function normalizeGoogleAdsKeywordIdeas(results = []) {
  return results.map((result) => {
    const metrics = result.keywordIdeaMetrics || result.keywordMetrics || {};
    return {
      term: String(result.text || '').trim(),
      closeVariants: Array.isArray(result.closeVariants) ? result.closeVariants : [],
      averageMonthlySearches: Number(metrics.avgMonthlySearches || 0),
      competition: metrics.competition || 'UNSPECIFIED',
      competitionIndex: Number(metrics.competitionIndex || 0),
      lowTopOfPageBidMicros: Number(metrics.lowTopOfPageBidMicros || 0),
      highTopOfPageBidMicros: Number(metrics.highTopOfPageBidMicros || 0),
      monthlySearchVolumes: (metrics.monthlySearchVolumes || []).map((item) => ({
        year: Number(item.year || 0),
        month: item.month || 'UNSPECIFIED',
        monthlySearches: Number(item.monthlySearches || 0),
      })),
    };
  }).filter((item) => item.term);
}

async function googleAdsMarketDemand({ env, config, shopUrl }) {
  const required = [
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_REFRESH_TOKEN',
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_CUSTOMER_ID',
  ];
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    return { status: 'not_configured', items: [], error: `Configuração Google Ads pendente: ${missing.join(', ')}` };
  }
  const accessToken = await googleAdsAccessToken(env);
  const apiVersion = String(env.GOOGLE_ADS_API_VERSION || 'v23').replace(/^v?/, 'v');
  const customerId = String(env.GOOGLE_ADS_CUSTOMER_ID).replace(/\D/g, '');
  const endpoint = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}:generateKeywordIdeas`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
  };
  if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers['login-customer-id'] = String(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID).replace(/\D/g, '');
  }
  const seedKeywords = (config.marketDemandSeedKeywords || []).map(String).filter(Boolean).slice(0, 20);
  if (seedKeywords.length === 0) throw new Error('Google Ads Keyword Planner sem palavras-chave semente');
  const seed = shopUrl
    ? { keywordAndUrlSeed: { keywords: seedKeywords, url: shopUrl } }
    : { keywordSeed: { keywords: seedKeywords } };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      language: 'languageConstants/1014',
      geoTargetConstants: ['geoTargetConstants/2076'],
      includeAdultKeywords: false,
      keywordPlanNetwork: 'GOOGLE_SEARCH',
      pageSize: Math.min(1000, Number(config.marketDemandMaximumKeywords || 100)),
      ...seed,
    }),
  });
  const payload = await responseJson(response, 'Google Ads Keyword Planner');
  return { status: 'available', items: normalizeGoogleAdsKeywordIdeas(payload.results), error: null };
}

async function searchConsoleRows({ accessToken, siteUrl, period, country = 'bra', maximumRows = 1000 }) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const rows = [];
  const pageSize = Math.min(250, maximumRows);
  while (rows.length < maximumRows) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: period.startDate,
        endDate: period.endDate,
        dimensions: ['query', 'page', 'country', 'device'],
        dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: country }] }],
        type: 'web',
        aggregationType: 'auto',
        rowLimit: pageSize,
        startRow: rows.length,
        dataState: 'final',
      }),
    });
    const page = (await responseJson(response, 'Search Console')).rows || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.slice(0, maximumRows);
}

async function searchConsoleSummary({ accessToken, siteUrl, period, country = null }) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const body = {
    startDate: period.startDate,
    endDate: period.endDate,
    type: 'web',
    aggregationType: 'auto',
    rowLimit: 1,
    dataState: 'final',
  };
  if (country) {
    body.dimensionFilterGroups = [{ filters: [{ dimension: 'country', operator: 'equals', expression: country }] }];
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await responseJson(response, `Search Console resumo ${country || 'global'}`);
  const row = payload.rows?.[0] || {};
  return {
    scope: country || 'global',
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
  };
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code.replace(/^x/i, ''), /^x/i.test(code) ? 16 : 10)))
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

export function parseGoogleTrendsRss(xml) {
  return [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const item = match[1];
    const field = (name) => decodeXml(item.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '').trim();
    return {
      title: field('title'),
      approximateTraffic: field('ht:approx_traffic'),
      publishedAt: field('pubDate'),
      sourceUrl: field('link') || 'https://trends.google.com/trending?geo=BR',
    };
  }).filter((item) => item.title);
}

async function googleTrendsBrazil({ env }) {
  const url = env.GOOGLE_TRENDS_RSS_URL || 'https://trends.google.com/trending/rss?geo=BR';
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Google Trends RSS: HTTP ${response.status}`);
  return parseGoogleTrendsRss(await response.text());
}

async function publicPageSpeedSignal(targetUrl) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', targetUrl);
  endpoint.searchParams.set('strategy', 'mobile');
  for (const category of ['performance', 'seo', 'accessibility']) endpoint.searchParams.append('category', category);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(45000) });
  const payload = await responseJson(response, 'PageSpeed público da loja');
  const categories = payload.lighthouseResult?.categories || {};
  return {
    source: 'pagespeed-insights',
    evidenceClass: 'public_measurement',
    targetUrl,
    fetchedAt: payload.analysisUTCTimestamp || new Date().toISOString(),
    strategy: 'mobile',
    scores: Object.fromEntries(Object.entries(categories).map(([id, category]) => [id, Math.round(Number(category.score || 0) * 100)])),
  };
}

async function publicSiteAudit(targetUrl) {
  const rootUrl = new URL(targetUrl);
  const [page, robots, sitemap] = await Promise.all([
    fetch(rootUrl, { redirect: 'follow', signal: AbortSignal.timeout(20000) }),
    fetch(new URL('/robots.txt', rootUrl), { redirect: 'follow', signal: AbortSignal.timeout(20000) }),
    fetch(new URL('/sitemap.xml', rootUrl), { redirect: 'follow', signal: AbortSignal.timeout(20000) }),
  ]);
  const html = await page.text();
  const match = (pattern) => pattern.test(html);
  return {
    source: 'public-site-audit',
    evidenceClass: 'public_measurement',
    targetUrl: page.url || targetUrl,
    fetchedAt: new Date().toISOString(),
    httpStatus: page.status,
    robotsStatus: robots.status,
    sitemapStatus: sitemap.status,
    checks: {
      title: match(/<title[^>]*>\s*[^<]+<\/title>/i),
      metaDescription: match(/<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i) || match(/<meta[^>]+content=["'][^"']+["'][^>]+name=["']description["']/i),
      canonical: match(/<link[^>]+rel=["']canonical["'][^>]+href=/i) || match(/<link[^>]+href=[^>]+rel=["']canonical["']/i),
      h1: match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i),
      structuredData: match(/<script[^>]+type=["']application\/ld\+json["']/i),
      noindex: match(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i),
    },
  };
}

function youtubeAuthorization(env, accessToken) {
  if (env.YOUTUBE_API_KEY) return { key: env.YOUTUBE_API_KEY };
  return { accessToken };
}

async function youtubeGet(endpoint, parameters, authorization) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));
  if (authorization.key) url.searchParams.set('key', authorization.key);
  const response = await fetch(url, {
    headers: authorization.accessToken ? { Authorization: `Bearer ${authorization.accessToken}` } : {},
  });
  return responseJson(response, `YouTube ${endpoint}`);
}

export async function cachedYoutubePayload({ cacheDirectory, key, loader }) {
  if (!cacheDirectory) return loader();
  const digest = createHash('sha256').update(key).digest('hex');
  const cachePath = path.join(cacheDirectory, `${digest}.json`);
  try {
    return JSON.parse(await fs.readFile(cachePath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const payload = await loader();
  await fs.mkdir(cacheDirectory, { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(payload) + '\n');
  return payload;
}

async function youtubeVideos({ env, accessToken, config, periods }) {
  const authorization = youtubeAuthorization(env, accessToken);
  const searchesConfig = Array.isArray(config.youtubeSearches) && config.youtubeSearches.length > 0
    ? config.youtubeSearches
    : [{ id: 'ciclismo', regionCode: 'BR', relevanceLanguage: 'pt', query: 'ciclismo bicicleta mountain bike Brasil' }];
  const searches = await Promise.all(searchesConfig.map(async (market) => {
    const query = String(market.query || 'ciclismo bicicleta Brasil');
    const parameters = {
      part: 'snippet', type: 'video', order: 'viewCount', maxResults: 50,
      regionCode: market.regionCode, relevanceLanguage: market.relevanceLanguage,
      videoCategoryId: 17, publishedAfter: `${periods.current.startDate}T00:00:00Z`, q: query,
    };
    const payload = await cachedYoutubePayload({
      cacheDirectory: env.YOUTUBE_CACHE_DIR,
      key: JSON.stringify(parameters),
      loader: () => youtubeGet('search', parameters, authorization),
    });
    return { market, items: payload.items || [] };
  }));
  const metadata = new Map();
  for (const { market, items } of searches) {
    for (const item of items) {
      const id = item.id?.videoId;
      if (!id) continue;
      const captured = metadata.get(id) || { markets: new Set(), languages: new Set(), searches: new Set() };
      captured.markets.add(market.regionCode);
      captured.languages.add(market.relevanceLanguage);
      captured.searches.add(market.id || market.query);
      metadata.set(id, captured);
    }
  }
  const ids = [...metadata.keys()];
  if (ids.length === 0) throw new Error('YouTube não retornou vídeos para a janela analisada');
  const batches = [];
  for (let index = 0; index < ids.length; index += 50) batches.push(ids.slice(index, index + 50));
  const details = await Promise.all(batches.map((batch) => youtubeGet('videos', {
    part: 'snippet,statistics,contentDetails',
    id: batch.join(','),
    maxResults: 50,
  }, authorization)));
  return details.flatMap((payload) => payload.items || []).map((video) => ({
    ...video,
    _intelligence: {
      markets: [...(metadata.get(video.id)?.markets || [])],
      languages: [...(metadata.get(video.id)?.languages || [])],
      searches: [...(metadata.get(video.id)?.searches || [])],
    },
  }));
}

export async function runEditorialIntelligence({
  cadence = argument('cadence', 'weekly'),
  outputDirectory = argument('output', path.join(root, 'tmp/editorial-intelligence')),
  env = process.env,
  now = new Date(),
} = {}) {
  if (!['weekly', 'monthly'].includes(cadence)) throw new Error(`Cadência inválida: ${cadence}`);
  const config = JSON.parse(await fs.readFile(path.join(root, 'automation/n8n/config.example.json'), 'utf8'));
  const generatedAt = now.toISOString();
  const periods = periodsFor({ cadence, generatedAt });
  const context = {
    cadence,
    generatedAt,
    periods,
    runKey: `${cadence}-${isoDate(now)}`,
  };
  config.maximumBriefs = cadence === 'monthly' ? config.monthlyMaximumBriefs : config.weeklyMaximumBriefs;
  config.refreshAfterDays = cadence === 'monthly' ? config.monthlyRefreshAfterDays : 150;
  const maximumSearchQueries = Number(config.maximumSearchQueries || 1000);
  const searchConsoleCountry = config.searchConsoleCountry || 'bra';
  const accessToken = await googleAccessToken(env);
  const configuredSites = config.searchConsoleSites || [{ id: 'blog', role: 'editorial', siteUrl: config.searchConsoleSiteUrl }];
  const searchConsoleSites = configuredSites.map((site) => ({
    ...site,
    siteUrl: site.id === 'blog'
      ? (env.SEARCH_CONSOLE_BLOG_SITE_URL || env.SEARCH_CONSOLE_SITE_URL || site.siteUrl)
      : site.id === 'shop'
        ? (env.SEARCH_CONSOLE_SHOP_SITE_URL || site.siteUrl)
        : site.siteUrl,
  }));
  const trendsPromise = googleTrendsBrazil({ env })
    .then((items) => ({ status: 'available', items, error: null }))
    .catch((error) => ({ status: 'unavailable', items: [], error: String(error?.message || error).slice(0, 240) }));
  const shop = searchConsoleSites.find((site) => site.id === 'shop');
  const marketDemandPromise = googleAdsMarketDemand({ env, config, shopUrl: shop?.publicUrl })
    .catch((error) => ({ status: 'unavailable', items: [], error: String(error?.message || error).slice(0, 500) }));
  const publicShopSeoPromise = shop?.publicUrl
    ? Promise.all([
      publicSiteAudit(shop.publicUrl)
        .then((signal) => ({ status: 'available', signal, error: null }))
        .catch((error) => ({ status: 'unavailable', signal: null, error: String(error?.message || error).slice(0, 240) })),
      publicPageSpeedSignal(shop.publicUrl)
        .then((signal) => ({ status: 'available', signal, error: null }))
        .catch((error) => ({ status: 'unavailable', signal: null, error: String(error?.message || error).slice(0, 240) })),
    ]).then(([siteAudit, pageSpeed]) => ({ status: siteAudit.status, siteAudit, pageSpeed }))
    : Promise.resolve({ status: 'not_configured', siteAudit: null, pageSpeed: null });
  const youtubePromise = youtubeVideos({ env, accessToken, config, periods })
    .then((items) => ({ status: 'available', items, error: null }))
    .catch((error) => ({ status: 'unavailable', items: [], error: String(error?.message || error).slice(0, 500) }));
  const siteResultsPromise = Promise.all(searchConsoleSites.map(async (site) => {
    try {
      const [currentRows, previousRows, brazilCurrent, brazilPrevious, globalCurrent, globalPrevious] = await Promise.all([
        searchConsoleRows({ accessToken, siteUrl: site.siteUrl, period: periods.current, country: searchConsoleCountry, maximumRows: maximumSearchQueries }),
        searchConsoleRows({ accessToken, siteUrl: site.siteUrl, period: periods.previous, country: searchConsoleCountry, maximumRows: maximumSearchQueries }),
        searchConsoleSummary({ accessToken, siteUrl: site.siteUrl, period: periods.current, country: searchConsoleCountry }),
        searchConsoleSummary({ accessToken, siteUrl: site.siteUrl, period: periods.previous, country: searchConsoleCountry }),
        searchConsoleSummary({ accessToken, siteUrl: site.siteUrl, period: periods.current }),
        searchConsoleSummary({ accessToken, siteUrl: site.siteUrl, period: periods.previous }),
      ]);
      const tag = (row) => ({ ...row, _propertyId: site.id, _propertyRole: site.role });
      return { site, status: 'available', error: null, currentRows: currentRows.map(tag), previousRows: previousRows.map(tag), brazilCurrent, brazilPrevious, globalCurrent, globalPrevious };
    } catch (error) {
      if (site.accessMode !== 'optional') throw error;
      const empty = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      return { site, status: 'not_authorized', error: String(error?.message || error).slice(0, 500), currentRows: [], previousRows: [], brazilCurrent: empty, brazilPrevious: empty, globalCurrent: empty, globalPrevious: empty };
    }
  }));
  const [siteResults, youtube, contentIndex, trends, publicShopSeo, marketDemand] = await Promise.all([
    siteResultsPromise,
    youtubePromise,
    fetch(env.CONTENT_INDEX_URL || config.contentIndexUrl).then((response) => responseJson(response, 'Índice público do blog')),
    trendsPromise,
    publicShopSeoPromise,
    marketDemandPromise,
  ]);
  const gscCurrent = siteResults.flatMap((result) => result.currentRows);
  const gscPrevious = siteResults.flatMap((result) => result.previousRows);
  const propertyDiagnostics = Object.fromEntries(siteResults.map((result) => [result.site.id, {
    siteUrl: result.site.siteUrl,
    role: result.site.role,
    accessMode: result.site.accessMode || 'required',
    status: result.status,
    error: result.error,
    current: { brazil: result.brazilCurrent, global: result.globalCurrent, detailedBrazilRows: result.currentRows.length },
    previous: { brazil: result.brazilPrevious, global: result.globalPrevious, detailedBrazilRows: result.previousRows.length },
  }]));
  const sumSummary = (period, scope) => {
    const total = siteResults.reduce((aggregate, result) => {
    const summary = result[`${scope}${period === 'current' ? 'Current' : 'Previous'}`];
      aggregate.clicks += summary.clicks;
      aggregate.impressions += summary.impressions;
      aggregate.weightedPosition += summary.position * summary.impressions;
      return aggregate;
    }, { clicks: 0, impressions: 0, weightedPosition: 0 });
    return {
      clicks: total.clicks,
      impressions: total.impressions,
      ctr: total.impressions ? total.clicks / total.impressions : 0,
      position: total.impressions ? total.weightedPosition / total.impressions : 0,
    };
  };
  const report = buildEditorialIntelligence({
    context,
    config,
    gscCurrent,
    gscPrevious,
    videos: youtube.items,
    articles: contentIndex.articles || [],
    searchConsoleDiagnostics: {
      current: { brazil: sumSummary('current', 'brazil'), global: sumSummary('current', 'global') },
      previous: { brazil: sumSummary('previous', 'brazil'), global: sumSummary('previous', 'global') },
      properties: propertyDiagnostics,
    },
    googleTrends: trends.items,
    googleTrendsStatus: { status: trends.status, error: trends.error },
    publicShopSeo,
    youtubeStatus: { status: youtube.status, error: youtube.error },
    marketDemand: marketDemand.items,
    marketDemandStatus: { status: marketDemand.status, error: marketDemand.error },
  });
  await fs.mkdir(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, `${report.runKey}.json`);
  const markdownPath = path.join(outputDirectory, `${report.runKey}.md`);
  const queriesCsvPath = path.join(outputDirectory, `${report.runKey}-consultas-brasil.csv`);
  const marketDemandCsvPath = path.join(outputDirectory, `${report.runKey}-demanda-google-brasil.csv`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(markdownPath, intelligenceMarkdown(report) + '\n');
  const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csvHeader = ['rank', 'consulta', 'cluster', 'intencao', 'propriedades', 'cliques', 'impressoes', 'ctr', 'posicao', 'variacao', 'dispositivos', 'paginas', 'canibalizacao', 'score'];
  const csvRows = (report.brazilRankings?.seoMeasured || []).map((item) => [
    item.rank, item.term, item.cluster, item.intent, item.propertyIds.join('|'), item.clicks, item.impressions, item.ctr, item.position, item.delta,
    item.devices.join('|'), item.targetUrls.join('|'), item.cannibalizationRisk, item.opportunityScore,
  ]);
  await fs.writeFile(queriesCsvPath, [csvHeader, ...csvRows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n');
  const demandHeader = ['rank', 'termo', 'cluster', 'intencao', 'buscas_mensais_medias', 'tendencia', 'concorrencia_ads', 'indice_concorrencia', 'aderencia_portfolio', 'cobertura_blog', 'acao'];
  const demandRows = (report.brazilRankings?.googleMarketDemand || []).map((item) => [
    item.rank, item.term, item.cluster, item.intent, item.averageMonthlySearches, item.trend,
    item.competition, item.competitionIndex, item.portfolioRelevance, item.coverage?.url || '', item.recommendedAction,
  ]);
  await fs.writeFile(marketDemandCsvPath, [demandHeader, ...demandRows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n');
  return { report, jsonPath, markdownPath, queriesCsvPath, marketDemandCsvPath };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  runEditorialIntelligence()
    .then(({ report, jsonPath, markdownPath, queriesCsvPath }) => console.log(JSON.stringify({ runKey: report.runKey, jsonPath, markdownPath, queriesCsvPath })))
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
