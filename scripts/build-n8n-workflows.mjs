import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetDirectory = path.join(root, 'automation/n8n/workflows');
const check = process.argv.includes('--check');
const enginePath = path.join(root, 'scripts/lib/editorial-intelligence.mjs');
const engineSource = (await fs.readFile(enginePath, 'utf8')).replace(/\r\n/g, '\n').replaceAll('export function ', 'function ');

const ids = {
  weekly: '11000000-0000-4000-8000-000000000001', monthly: '11000000-0000-4000-8000-000000000002',
  weeklyMode: '11000000-0000-4000-8000-000000000003', monthlyMode: '11000000-0000-4000-8000-000000000004',
  context: '11000000-0000-4000-8000-000000000005', gscCurrent: '11000000-0000-4000-8000-000000000006',
  gscPrevious: '11000000-0000-4000-8000-000000000007', tagCurrent: '11000000-0000-4000-8000-000000000008',
  tagPrevious: '11000000-0000-4000-8000-000000000009', content: '11000000-0000-4000-8000-000000000010',
  tagContent: '11000000-0000-4000-8000-000000000011', youtubeSearch: '11000000-0000-4000-8000-000000000012',
  youtubeIds: '11000000-0000-4000-8000-000000000013', youtubeDetails: '11000000-0000-4000-8000-000000000014',
  tagYoutubeDetails: '11000000-0000-4000-8000-000000000015', youtubePopular: '11000000-0000-4000-8000-000000000016',
  tagYoutubePopular: '11000000-0000-4000-8000-000000000017', mergeYoutube: '11000000-0000-4000-8000-000000000018',
  normalizeYoutube: '11000000-0000-4000-8000-000000000019', mergeSeo: '11000000-0000-4000-8000-000000000020',
  mergeExternal: '11000000-0000-4000-8000-000000000021', mergeSignals: '11000000-0000-4000-8000-000000000022',
  mergeContext: '11000000-0000-4000-8000-000000000023', engine: '11000000-0000-4000-8000-000000000024',
  findIssue: '11000000-0000-4000-8000-000000000025', isNew: '11000000-0000-4000-8000-000000000026',
  createIssue: '11000000-0000-4000-8000-000000000027', commentIssue: '11000000-0000-4000-8000-000000000028',
  youtubeMarkets: '11000000-0000-4000-8000-000000000029',
  gscBrazilSummaryCurrent: '11000000-0000-4000-8000-000000000030', tagBrazilSummaryCurrent: '11000000-0000-4000-8000-000000000031',
  gscBrazilSummaryPrevious: '11000000-0000-4000-8000-000000000032', tagBrazilSummaryPrevious: '11000000-0000-4000-8000-000000000033',
  gscGlobalSummaryCurrent: '11000000-0000-4000-8000-000000000034', tagGlobalSummaryCurrent: '11000000-0000-4000-8000-000000000035',
  gscGlobalSummaryPrevious: '11000000-0000-4000-8000-000000000036', tagGlobalSummaryPrevious: '11000000-0000-4000-8000-000000000037',
  googleTrends: '11000000-0000-4000-8000-000000000038', tagGoogleTrends: '11000000-0000-4000-8000-000000000039',
  mergeBrazilSummaries: '11000000-0000-4000-8000-000000000040', mergeGlobalSummaries: '11000000-0000-4000-8000-000000000041',
  mergeSeoDiagnostics: '11000000-0000-4000-8000-000000000042', mergeSeoAll: '11000000-0000-4000-8000-000000000043',
  mergeExternalTrends: '11000000-0000-4000-8000-000000000044',
  gscSites: '11000000-0000-4000-8000-000000000045',
  shopPageSpeed: '11000000-0000-4000-8000-000000000046', tagShopPageSpeed: '11000000-0000-4000-8000-000000000047',
  mergePublicShopSeo: '11000000-0000-4000-8000-000000000048',
};

function node(id, name, type, typeVersion, position, parameters = {}) {
  return { parameters, id, name, type, typeVersion, position };
}

function codeNode(id, name, position, jsCode) {
  return node(id, name, 'n8n-nodes-base.code', 2, position, { mode: 'runOnceForAllItems', jsCode });
}

function httpNode(id, name, position, parameters, credentialType) {
  const authentication = credentialType ? {
    authentication: 'predefinedCredentialType',
    nodeCredentialType: credentialType,
  } : {};
  const { options: customOptions = {}, ...requestParameters } = parameters;
  return node(id, name, 'n8n-nodes-base.httpRequest', 4.2, position, {
    ...requestParameters,
    ...authentication,
    options: {
      timeout: 45000,
      ...customOptions,
      response: {
        ...customOptions.response,
        response: { neverError: name.startsWith('Search Console') || name.startsWith('YouTube'), responseFormat: 'json', ...(customOptions.response?.response || {}) },
      },
    },
  });
}

function connect(connections, from, to, output = 0, input = 0) {
  connections[from] ||= { main: [] };
  connections[from].main[output] ||= [];
  connections[from].main[output].push({ node: to, type: 'main', index: input });
}

const weeklyModeCode = `return [{ json: { cadence: 'weekly', lookbackDays: 7, generatedAt: new Date().toISOString() } }];`;
const monthlyModeCode = `return [{ json: { cadence: 'monthly', lookbackDays: 28, generatedAt: new Date().toISOString() } }];`;
const contextCode = `
const input = $input.first().json;
const end = new Date(input.generatedAt);
end.setUTCDate(end.getUTCDate() - 3);
const currentStart = new Date(end);
currentStart.setUTCDate(currentStart.getUTCDate() - input.lookbackDays + 1);
const previousEnd = new Date(currentStart);
previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
const previousStart = new Date(previousEnd);
previousStart.setUTCDate(previousStart.getUTCDate() - input.lookbackDays + 1);
const date = (value) => value.toISOString().slice(0, 10);
const runKey = input.cadence + '-' + date(new Date(input.generatedAt));
return [{ json: {
  ...input,
  runKey,
  periods: {
    current: { startDate: date(currentStart), endDate: date(end) },
    previous: { startDate: date(previousStart), endDate: date(previousEnd) },
  },
  config: {
    searchConsoleSiteUrl: 'https://blog.thebiker.com.br/',
    searchConsoleSites: [
      { id: 'blog', role: 'editorial', accessMode: 'required', siteUrl: 'https://blog.thebiker.com.br/' },
      { id: 'shop', role: 'commercial', accessMode: 'optional', siteUrl: 'sc-domain:thebikershop.com.br', publicUrl: 'https://thebikershop.com.br/' },
    ],
    contentIndexUrl: 'https://blog.thebiker.com.br/api/content-index.json',
    githubOwner: 'marcuscapobiangomed-ai',
    githubRepository: 'thebikerblog',
    market: 'BR',
    searchConsoleCountry: 'bra',
    maximumSearchQueries: 1000,
    googleTrendsRssUrl: 'https://trends.google.com/trending/rss?geo=BR',
    trendsMaximumSignals: 20,
    youtubeMaximumVideos: 20,
    requirePortugueseYouTube: true,
    youtubeSearches: [
      { id: 'ciclismo-tecnico', regionCode: 'BR', relevanceLanguage: 'pt', query: 'ciclismo técnico bicicleta' },
      { id: 'mountain-bike', regionCode: 'BR', relevanceLanguage: 'pt', query: 'mountain bike MTB Brasil' },
      { id: 'bike-estrada', regionCode: 'BR', relevanceLanguage: 'pt', query: 'bike de estrada ciclismo Brasil' },
      { id: 'gravel', regionCode: 'BR', relevanceLanguage: 'pt', query: 'bicicleta gravel Brasil' },
      { id: 'manutencao', regionCode: 'BR', relevanceLanguage: 'pt', query: 'manutenção bicicleta oficina' },
      { id: 'suspensao', regionCode: 'BR', relevanceLanguage: 'pt', query: 'suspensão bike ajuste MTB' },
      { id: 'componentes', regionCode: 'BR', relevanceLanguage: 'pt', query: 'componentes bicicleta Shimano SRAM' },
      { id: 'pneus-rodas', regionCode: 'BR', relevanceLanguage: 'pt', query: 'pneu roda bicicleta tubeless' },
      { id: 'bike-fit', regionCode: 'BR', relevanceLanguage: 'pt', query: 'bike fit posição ciclismo' },
      { id: 'treinamento', regionCode: 'BR', relevanceLanguage: 'pt', query: 'treino ciclismo performance' },
      { id: 'tecnologia', regionCode: 'BR', relevanceLanguage: 'pt', query: 'tecnologia bicicleta lançamento' },
      { id: 'thebiker-portfolio', regionCode: 'BR', relevanceLanguage: 'pt', query: 'Scott bike Shimano SRAM Syncros Brasil' },
    ],
    cyclingTerms: ['ciclismo', 'mountain bike', 'mtb', 'bike fit', 'suspensão', 'transmissão', 'shimano', 'sram', 'scott', 'syncros', 'pneu', 'roda'],
    portfolioBrands: ['Scott', 'Shimano', 'SRAM', 'Syncros', 'Fox', 'RockShox'],
    blockedPromotionBrands: ['Trek', 'Specialized', 'Cannondale', 'Cervélo', 'Giant', 'BMC', 'Pinarello'],
    minimumImpressions: 5,
    maximumBriefs: input.cadence === 'monthly' ? 30 : 8,
    refreshAfterDays: input.cadence === 'monthly' ? 90 : 150,
  },
} }];`;

const reportCode = `${engineSource}
const values = $input.all().map((item) => item.json);
const context = values.find((item) => item.kind === 'context');
const rows = (kind) => values.filter((item) => item.kind === kind).flatMap((item) => item.rows || []);
const current = rows('gsc_current');
const previous = rows('gsc_previous');
const youtube = values.find((item) => item.kind === 'youtube') || { videos: [], error: null };
const videos = youtube.videos || [];
const articles = values.find((item) => item.kind === 'content_index')?.articles || [];
const summaries = (kind) => values.filter((item) => item.kind === kind);
const combinedSummary = (kind) => {
  const items = summaries(kind).map((item) => item.summary || {});
  const impressions = items.reduce((sum, item) => sum + Number(item.impressions || 0), 0);
  const clicks = items.reduce((sum, item) => sum + Number(item.clicks || 0), 0);
  const weightedPosition = items.reduce((sum, item) => sum + Number(item.position || 0) * Number(item.impressions || 0), 0);
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? weightedPosition / impressions : 0 };
};
const propertyDiagnostics = {};
for (const item of values.filter((value) => value.propertyId && value.summary)) {
  const property = propertyDiagnostics[item.propertyId] ||= { role: item.propertyRole, current: {}, previous: {} };
  const period = item.kind.endsWith('_current') ? 'current' : 'previous';
  const scope = item.kind.includes('_brazil_') ? 'brazil' : 'global';
  property[period][scope] = item.summary;
}
for (const item of values.filter((value) => value.propertyId && value.kind === 'gsc_current')) {
  const property = propertyDiagnostics[item.propertyId] ||= { role: item.propertyRole, current: {}, previous: {} };
  property.accessMode = item.accessMode || 'required';
  property.status = item.error ? 'not_authorized' : 'available';
  property.error = item.error || null;
}
const trends = values.find((item) => item.kind === 'google_trends') || { items: [], status: 'unavailable', error: 'n8n_feed_unavailable' };
const publicShopSeo = values.find((item) => item.kind === 'public_shop_seo') || { status: 'unavailable', signal: null, error: 'n8n_pagespeed_unavailable' };
if (!context) throw new Error('Contexto da execução ausente');
const requiredPropertyFailure = values.find((item) => item.propertyId && item.accessMode !== 'optional' && item.error);
if (requiredPropertyFailure) throw new Error('Search Console obrigatório indisponível para ' + requiredPropertyFailure.propertyId + ': ' + requiredPropertyFailure.error);
const report = buildEditorialIntelligence({
  context, config: context.config, gscCurrent: current, gscPrevious: previous, videos, articles,
  searchConsoleDiagnostics: {
    current: { brazil: combinedSummary('gsc_brazil_summary_current'), global: combinedSummary('gsc_global_summary_current') },
    previous: { brazil: combinedSummary('gsc_brazil_summary_previous'), global: combinedSummary('gsc_global_summary_previous') },
    properties: propertyDiagnostics,
  },
  googleTrends: trends.items || [],
  googleTrendsStatus: { status: trends.status || 'available', error: trends.error || null },
  publicShopSeo,
  youtubeStatus: { status: youtube.error ? 'unavailable' : 'available', error: youtube.error || null },
});
return [{ json: {
  ...report,
  title: '[INTEL-BR] ' + report.runKey + ' — Demanda Google, SEO próprio e YouTube Brasil',
  body: intelligenceMarkdown(report),
  issueQuery: 'repo:' + context.config.githubOwner + '/' + context.config.githubRepository + ' in:title "[INTEL] ' + report.runKey + '"',
  githubOwner: context.config.githubOwner,
  githubRepository: context.config.githubRepository,
} }];`;

const tagTrendsCode = `
const data = $input.first().json;
const raw = typeof data === 'string' ? data : String(data.data || data.body || data.response || '');
const decode = (value) => String(value || '').replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, '$1').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");
const field = (xml, name) => decode(xml.match(new RegExp('<' + name + '>([\\\\s\\\\S]*?)<\\\\/' + name + '>', 'i'))?.[1] || '').trim();
const items = [...raw.matchAll(/<item>([\\s\\S]*?)<\\/item>/gi)].map((match) => ({
  title: field(match[1], 'title'),
  approximateTraffic: field(match[1], 'ht:approx_traffic'),
  publishedAt: field(match[1], 'pubDate'),
  sourceUrl: field(match[1], 'link') || 'https://trends.google.com/trending?geo=BR',
})).filter((item) => item.title);
return [{ json: { kind: 'google_trends', status: 'available', error: null, items } }];`;

const mainNodes = [
  node(ids.weekly, 'Agenda semanal', 'n8n-nodes-base.scheduleTrigger', 1.2, [-1080, -180], { rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 6, triggerAtMinute: 10 }] } }),
  node(ids.monthly, 'Agenda mensal', 'n8n-nodes-base.scheduleTrigger', 1.2, [-1080, 20], { rule: { interval: [{ field: 'months', monthsInterval: 1, triggerAtDayOfMonth: 1, triggerAtHour: 7, triggerAtMinute: 10 }] } }),
  codeNode(ids.weeklyMode, 'Modo semanal', [-860, -180], weeklyModeCode),
  codeNode(ids.monthlyMode, 'Modo mensal', [-860, 20], monthlyModeCode),
  codeNode(ids.context, 'Contexto e configuração', [-620, -80], contextCode),
  codeNode(ids.gscSites, 'Expandir propriedades Search Console', [-500, -520], "const context=$input.first().json; return (context.config.searchConsoleSites||[{id:'blog',role:'editorial',siteUrl:context.config.searchConsoleSiteUrl}]).map((site)=>({json:{...context,config:{...context.config,searchConsoleSiteUrl:site.siteUrl},site}}));"),
  httpNode(ids.gscCurrent, 'Search Console atual', [-260, -500], { method: 'POST', url: "={{ 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent($json.site.siteUrl) + '/searchAnalytics/query' }}", sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: "={{ JSON.stringify({ startDate: $json.periods.current.startDate, endDate: $json.periods.current.endDate, dimensions: ['query','page','country','device'], dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: $json.config.searchConsoleCountry }] }], type: 'web', aggregationType: 'auto', rowLimit: $json.config.maximumSearchQueries, dataState: 'final' }) }}" }, 'googleOAuth2Api'),
  httpNode(ids.gscPrevious, 'Search Console anterior', [-260, -340], { method: 'POST', url: "={{ 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent($json.site.siteUrl) + '/searchAnalytics/query' }}", sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: "={{ JSON.stringify({ startDate: $json.periods.previous.startDate, endDate: $json.periods.previous.endDate, dimensions: ['query','page','country','device'], dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: $json.config.searchConsoleCountry }] }], type: 'web', aggregationType: 'auto', rowLimit: $json.config.maximumSearchQueries, dataState: 'final' }) }}" }, 'googleOAuth2Api'),
  codeNode(ids.tagCurrent, 'Marcar Search Console atual', [-20, -500], "const site=$('Expandir propriedades Search Console').item.json.site; const data=$input.first().json; const rows=(data.rows||[]).map((row)=>({...row,_propertyId:site.id,_propertyRole:site.role})); return [{json:{kind:'gsc_current',propertyId:site.id,propertyRole:site.role,accessMode:site.accessMode||'required',error:data.error?.message||null,rows}}];"),
  codeNode(ids.tagPrevious, 'Marcar Search Console anterior', [-20, -340], "const site=$('Expandir propriedades Search Console').item.json.site; const data=$input.first().json; const rows=(data.rows||[]).map((row)=>({...row,_propertyId:site.id,_propertyRole:site.role})); return [{json:{kind:'gsc_previous',propertyId:site.id,propertyRole:site.role,accessMode:site.accessMode||'required',error:data.error?.message||null,rows}}];"),
  httpNode(ids.gscBrazilSummaryCurrent, 'Search Console resumo Brasil atual', [-360, -680], { method: 'POST', url: "={{ 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent($json.config.searchConsoleSiteUrl) + '/searchAnalytics/query' }}", sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: "={{ JSON.stringify({ startDate: $json.periods.current.startDate, endDate: $json.periods.current.endDate, dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: $json.config.searchConsoleCountry }] }], type: 'web', aggregationType: 'auto', rowLimit: 1, dataState: 'final' }) }}" }, 'googleOAuth2Api'),
  codeNode(ids.tagBrazilSummaryCurrent, 'Marcar resumo Brasil atual', [-100, -680], "const row=$input.first().json.rows?.[0]||{}; const site=$('Expandir propriedades Search Console').item.json.site; return [{json:{kind:'gsc_brazil_summary_current',propertyId:site.id,propertyRole:site.role,summary:{scope:'bra',clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0)}}}];"),
  httpNode(ids.gscBrazilSummaryPrevious, 'Search Console resumo Brasil anterior', [-360, -600], { method: 'POST', url: "={{ 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent($json.config.searchConsoleSiteUrl) + '/searchAnalytics/query' }}", sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: "={{ JSON.stringify({ startDate: $json.periods.previous.startDate, endDate: $json.periods.previous.endDate, dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: $json.config.searchConsoleCountry }] }], type: 'web', aggregationType: 'auto', rowLimit: 1, dataState: 'final' }) }}" }, 'googleOAuth2Api'),
  codeNode(ids.tagBrazilSummaryPrevious, 'Marcar resumo Brasil anterior', [-100, -600], "const row=$input.first().json.rows?.[0]||{}; const site=$('Expandir propriedades Search Console').item.json.site; return [{json:{kind:'gsc_brazil_summary_previous',propertyId:site.id,propertyRole:site.role,summary:{scope:'bra',clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0)}}}];"),
  httpNode(ids.gscGlobalSummaryCurrent, 'Search Console resumo global atual', [-360, -840], { method: 'POST', url: "={{ 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent($json.config.searchConsoleSiteUrl) + '/searchAnalytics/query' }}", sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: "={{ JSON.stringify({ startDate: $json.periods.current.startDate, endDate: $json.periods.current.endDate, type: 'web', aggregationType: 'auto', rowLimit: 1, dataState: 'final' }) }}" }, 'googleOAuth2Api'),
  codeNode(ids.tagGlobalSummaryCurrent, 'Marcar resumo global atual', [-100, -840], "const row=$input.first().json.rows?.[0]||{}; const site=$('Expandir propriedades Search Console').item.json.site; return [{json:{kind:'gsc_global_summary_current',propertyId:site.id,propertyRole:site.role,summary:{scope:'global',clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0)}}}];"),
  httpNode(ids.gscGlobalSummaryPrevious, 'Search Console resumo global anterior', [-360, -760], { method: 'POST', url: "={{ 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent($json.config.searchConsoleSiteUrl) + '/searchAnalytics/query' }}", sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: "={{ JSON.stringify({ startDate: $json.periods.previous.startDate, endDate: $json.periods.previous.endDate, type: 'web', aggregationType: 'auto', rowLimit: 1, dataState: 'final' }) }}" }, 'googleOAuth2Api'),
  codeNode(ids.tagGlobalSummaryPrevious, 'Marcar resumo global anterior', [-100, -760], "const row=$input.first().json.rows?.[0]||{}; const site=$('Expandir propriedades Search Console').item.json.site; return [{json:{kind:'gsc_global_summary_previous',propertyId:site.id,propertyRole:site.role,summary:{scope:'global',clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0)}}}];"),
  httpNode(ids.content, 'Índice público do blog', [-360, -150], { method: 'GET', url: '={{ $json.config.contentIndexUrl }}' }),
  codeNode(ids.tagContent, 'Marcar índice do blog', [-100, -150], "const data=$input.first().json; return [{ json: { kind: 'content_index', articles: data.articles || [] } }];"),
  httpNode(ids.googleTrends, 'Google Trends RSS Brasil', [-360, -40], { method: 'GET', url: '={{ $json.config.googleTrendsRssUrl }}', options: { response: { response: { responseFormat: 'text' } } } }),
  codeNode(ids.tagGoogleTrends, 'Marcar Google Trends Brasil', [-100, -40], tagTrendsCode),
  httpNode(ids.shopPageSpeed, 'PageSpeed público da TheBikerShop', [-360, 20], { method: 'GET', url: 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed', sendQuery: true, queryParameters: { parameters: [
    { name: 'url', value: '={{ $json.config.searchConsoleSites.find((site) => site.id === "shop").publicUrl }}' },
    { name: 'strategy', value: 'mobile' },
    { name: 'category', value: 'performance' }, { name: 'category', value: 'seo' }, { name: 'category', value: 'accessibility' },
  ] }, options: { response: { response: { neverError: true } } } }),
  codeNode(ids.tagShopPageSpeed, 'Marcar SEO público da loja', [-100, 20], "const data=$input.first().json; const categories=data.lighthouseResult?.categories||{}; const scores=Object.fromEntries(Object.entries(categories).map(([id,category])=>[id,Math.round(Number(category.score||0)*100)])); const pageSpeed={status:data.error?'unavailable':'available',error:data.error?.message||null,signal:data.error?null:{source:'pagespeed-insights',evidenceClass:'public_measurement',targetUrl:data.id||'https://thebikershop.com.br/',strategy:'mobile',scores}}; return [{json:{kind:'public_shop_seo',status:pageSpeed.status,siteAudit:null,pageSpeed}}];"),
  codeNode(ids.youtubeMarkets, 'Expandir buscas do YouTube Brasil', [-380, 80], "const context=$input.first().json; return (context.config.youtubeSearches||[]).map((market)=>({json:{...context,market}}));"),
  httpNode(ids.youtubeSearch, 'YouTube busca por visualizações', [-140, 80], { method: 'GET', url: 'https://www.googleapis.com/youtube/v3/search', sendQuery: true, queryParameters: { parameters: [
    { name: 'part', value: 'snippet' }, { name: 'type', value: 'video' }, { name: 'order', value: 'viewCount' }, { name: 'maxResults', value: '50' },
    { name: 'regionCode', value: '={{ $json.market.regionCode }}' }, { name: 'relevanceLanguage', value: '={{ $json.market.relevanceLanguage }}' }, { name: 'videoCategoryId', value: '17' },
    { name: 'publishedAfter', value: "={{ $json.periods.current.startDate + 'T00:00:00Z' }}" }, { name: 'q', value: '={{ $json.market.query }}' },
  ] } }, 'googleOAuth2Api'),
  node(ids.youtubeIds, 'Consolidar IDs do YouTube', 'n8n-nodes-base.code', 2, [100, 80], { mode: 'runOnceForEachItem', jsCode: "const ids=($json.items||[]).map((item)=>item.id?.videoId).filter(Boolean); const market=$('Expandir buscas do YouTube Brasil').item.json.market; return {json:{ids:[...new Set(ids)].slice(0,50),market,error:$json.error?.message||null}};" }),
  httpNode(ids.youtubeDetails, 'YouTube métricas dos vídeos', [150, 80], { method: 'GET', url: 'https://www.googleapis.com/youtube/v3/videos', sendQuery: true, queryParameters: { parameters: [{ name: 'part', value: 'snippet,statistics,contentDetails' }, { name: 'id', value: '={{ $json.ids.join(",") }}' }] } }, 'googleOAuth2Api'),
  node(ids.tagYoutubeDetails, 'Marcar vídeos pesquisados', 'n8n-nodes-base.code', 2, [400, 80], { mode: 'runOnceForEachItem', jsCode: "const upstream=$('Consolidar IDs do YouTube').item.json; const market=upstream.market; const videos=($json.items||[]).map((video)=>({...video,_intelligence:{markets:[market.regionCode],languages:[market.relevanceLanguage],searches:[market.id||market.query]}})); return {json:{kind:'youtube_part',error:upstream.error||$json.error?.message||null,videos}};" }),
  httpNode(ids.youtubePopular, 'YouTube populares em esportes', [-360, 260], { method: 'GET', url: 'https://www.googleapis.com/youtube/v3/videos', sendQuery: true, queryParameters: { parameters: [{ name: 'part', value: 'snippet,statistics,contentDetails' }, { name: 'chart', value: 'mostPopular' }, { name: 'regionCode', value: 'BR' }, { name: 'videoCategoryId', value: '17' }, { name: 'maxResults', value: '50' }] } }, 'googleOAuth2Api'),
  codeNode(ids.tagYoutubePopular, 'Marcar vídeos populares', [-100, 260], "const data=$input.first().json; const videos=(data.items||[]).map((video)=>({...video,_intelligence:{markets:['BR'],languages:['pt'],searches:['populares-esportes-br']}})); return [{json:{kind:'youtube_part',error:data.error?.message||null,videos}}];"),
  node(ids.mergeYoutube, 'Unir sinais do YouTube', 'n8n-nodes-base.merge', 3.2, [640, 160], { mode: 'append' }),
  codeNode(ids.normalizeYoutube, 'Deduplicar YouTube', [860, 160], "const map=new Map(); const errors=[]; for(const item of $input.all()){if(item.json.error)errors.push(item.json.error); for(const video of item.json.videos||[]){const previous=map.get(video.id); if(!previous){map.set(video.id,video);continue;} previous._intelligence={markets:[...new Set([...(previous._intelligence?.markets||[]),...(video._intelligence?.markets||[])])],languages:[...new Set([...(previous._intelligence?.languages||[]),...(video._intelligence?.languages||[])])],searches:[...new Set([...(previous._intelligence?.searches||[]),...(video._intelligence?.searches||[])])]};}} return [{json:{kind:'youtube',error:errors[0]||null,videos:[...map.values()]}}];"),
  node(ids.mergeSeo, 'Unir períodos SEO', 'n8n-nodes-base.merge', 3.2, [160, -420], { mode: 'append' }),
  node(ids.mergeBrazilSummaries, 'Unir resumos Brasil', 'n8n-nodes-base.merge', 3.2, [160, -650], { mode: 'append' }),
  node(ids.mergeGlobalSummaries, 'Unir resumos globais', 'n8n-nodes-base.merge', 3.2, [160, -800], { mode: 'append' }),
  node(ids.mergeSeoDiagnostics, 'Unir diagnóstico SEO', 'n8n-nodes-base.merge', 3.2, [420, -700], { mode: 'append' }),
  node(ids.mergeSeoAll, 'Anexar diagnóstico SEO', 'n8n-nodes-base.merge', 3.2, [650, -500], { mode: 'append' }),
  node(ids.mergeExternal, 'Unir conteúdo e YouTube', 'n8n-nodes-base.merge', 3.2, [1080, -20], { mode: 'append' }),
  node(ids.mergeExternalTrends, 'Anexar Google Trends', 'n8n-nodes-base.merge', 3.2, [1200, 20], { mode: 'append' }),
  node(ids.mergeSignals, 'Unir todos os sinais', 'n8n-nodes-base.merge', 3.2, [1300, -260], { mode: 'append' }),
  node(ids.mergePublicShopSeo, 'Anexar SEO público da loja', 'n8n-nodes-base.merge', 3.2, [1410, -220], { mode: 'append' }),
  node(ids.mergeContext, 'Anexar contexto', 'n8n-nodes-base.merge', 3.2, [1510, -160], { mode: 'append' }),
  codeNode(ids.engine, 'Gerar relatório e pautas', [1730, -160], reportCode),
  httpNode(ids.findIssue, 'Localizar relatório existente', [1960, -160], { method: 'GET', url: 'https://api.github.com/search/issues', sendQuery: true, queryParameters: { parameters: [{ name: 'q', value: '={{ $json.issueQuery }}' }] }, sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github+json' }, { name: 'X-GitHub-Api-Version', value: '2022-11-28' }] } }, 'githubApi'),
  node(ids.isNew, 'Relatório ainda não existe?', 'n8n-nodes-base.if', 2.2, [2190, -160], { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: 'is-new-report', leftValue: '={{ $json.total_count }}', rightValue: 0, operator: { type: 'number', operation: 'equals' } }], combinator: 'and' }, options: {} }),
  httpNode(ids.createIssue, 'Criar relatório no GitHub', [2430, -240], { method: 'POST', url: "={{ 'https://api.github.com/repos/' + $('Gerar relatório e pautas').item.json.githubOwner + '/' + $('Gerar relatório e pautas').item.json.githubRepository + '/issues' }}", sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github+json' }, { name: 'X-GitHub-Api-Version', value: '2022-11-28' }] }, sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: "={{ JSON.stringify({ title: $('Gerar relatório e pautas').item.json.title, body: $('Gerar relatório e pautas').item.json.body }) }}" }, 'githubApi'),
  httpNode(ids.commentIssue, 'Atualizar relatório existente', [2430, -80], { method: 'POST', url: "={{ 'https://api.github.com/repos/' + $('Gerar relatório e pautas').item.json.githubOwner + '/' + $('Gerar relatório e pautas').item.json.githubRepository + '/issues/' + $json.items[0].number + '/comments' }}", sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github+json' }, { name: 'X-GitHub-Api-Version', value: '2022-11-28' }] }, sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: "={{ JSON.stringify({ body: $('Gerar relatório e pautas').item.json.body }) }}" }, 'githubApi'),
];

const mainConnections = {};
connect(mainConnections, 'Agenda semanal', 'Modo semanal'); connect(mainConnections, 'Agenda mensal', 'Modo mensal');
connect(mainConnections, 'Modo semanal', 'Contexto e configuração'); connect(mainConnections, 'Modo mensal', 'Contexto e configuração');
for (const destination of [
  'Índice público do blog', 'Google Trends RSS Brasil',
  'PageSpeed público da TheBikerShop',
  'Expandir buscas do YouTube Brasil', 'YouTube populares em esportes',
]) connect(mainConnections, 'Contexto e configuração', destination);
connect(mainConnections, 'Contexto e configuração', 'Expandir propriedades Search Console');
for (const destination of [
  'Search Console atual', 'Search Console anterior',
  'Search Console resumo Brasil atual', 'Search Console resumo Brasil anterior',
  'Search Console resumo global atual', 'Search Console resumo global anterior',
]) connect(mainConnections, 'Expandir propriedades Search Console', destination);
connect(mainConnections, 'Search Console atual', 'Marcar Search Console atual'); connect(mainConnections, 'Search Console anterior', 'Marcar Search Console anterior');
connect(mainConnections, 'Marcar Search Console atual', 'Unir períodos SEO', 0, 0); connect(mainConnections, 'Marcar Search Console anterior', 'Unir períodos SEO', 0, 1);
connect(mainConnections, 'Search Console resumo Brasil atual', 'Marcar resumo Brasil atual'); connect(mainConnections, 'Search Console resumo Brasil anterior', 'Marcar resumo Brasil anterior');
connect(mainConnections, 'Marcar resumo Brasil atual', 'Unir resumos Brasil', 0, 0); connect(mainConnections, 'Marcar resumo Brasil anterior', 'Unir resumos Brasil', 0, 1);
connect(mainConnections, 'Search Console resumo global atual', 'Marcar resumo global atual'); connect(mainConnections, 'Search Console resumo global anterior', 'Marcar resumo global anterior');
connect(mainConnections, 'Marcar resumo global atual', 'Unir resumos globais', 0, 0); connect(mainConnections, 'Marcar resumo global anterior', 'Unir resumos globais', 0, 1);
connect(mainConnections, 'Unir resumos Brasil', 'Unir diagnóstico SEO', 0, 0); connect(mainConnections, 'Unir resumos globais', 'Unir diagnóstico SEO', 0, 1);
connect(mainConnections, 'Unir períodos SEO', 'Anexar diagnóstico SEO', 0, 0); connect(mainConnections, 'Unir diagnóstico SEO', 'Anexar diagnóstico SEO', 0, 1);
connect(mainConnections, 'Índice público do blog', 'Marcar índice do blog');
connect(mainConnections, 'Google Trends RSS Brasil', 'Marcar Google Trends Brasil');
connect(mainConnections, 'PageSpeed público da TheBikerShop', 'Marcar SEO público da loja');
connect(mainConnections, 'Expandir buscas do YouTube Brasil', 'YouTube busca por visualizações'); connect(mainConnections, 'YouTube busca por visualizações', 'Consolidar IDs do YouTube'); connect(mainConnections, 'Consolidar IDs do YouTube', 'YouTube métricas dos vídeos'); connect(mainConnections, 'YouTube métricas dos vídeos', 'Marcar vídeos pesquisados');
connect(mainConnections, 'YouTube populares em esportes', 'Marcar vídeos populares'); connect(mainConnections, 'Marcar vídeos pesquisados', 'Unir sinais do YouTube', 0, 0); connect(mainConnections, 'Marcar vídeos populares', 'Unir sinais do YouTube', 0, 1); connect(mainConnections, 'Unir sinais do YouTube', 'Deduplicar YouTube');
connect(mainConnections, 'Marcar índice do blog', 'Unir conteúdo e YouTube', 0, 0); connect(mainConnections, 'Deduplicar YouTube', 'Unir conteúdo e YouTube', 0, 1);
connect(mainConnections, 'Unir conteúdo e YouTube', 'Anexar Google Trends', 0, 0); connect(mainConnections, 'Marcar Google Trends Brasil', 'Anexar Google Trends', 0, 1);
connect(mainConnections, 'Anexar diagnóstico SEO', 'Unir todos os sinais', 0, 0); connect(mainConnections, 'Anexar Google Trends', 'Unir todos os sinais', 0, 1);
connect(mainConnections, 'Unir todos os sinais', 'Anexar SEO público da loja', 0, 0); connect(mainConnections, 'Marcar SEO público da loja', 'Anexar SEO público da loja', 0, 1);
connect(mainConnections, 'Anexar SEO público da loja', 'Anexar contexto', 0, 0); connect(mainConnections, 'Contexto e configuração', 'Anexar contexto', 0, 1); connect(mainConnections, 'Anexar contexto', 'Gerar relatório e pautas');
connect(mainConnections, 'Gerar relatório e pautas', 'Localizar relatório existente'); connect(mainConnections, 'Localizar relatório existente', 'Relatório ainda não existe?'); connect(mainConnections, 'Relatório ainda não existe?', 'Criar relatório no GitHub', 0); connect(mainConnections, 'Relatório ainda não existe?', 'Atualizar relatório existente', 1);

const mainWorkflow = {
  name: 'TheBiker — Inteligência SEO e YouTube',
  nodes: mainNodes,
  pinData: {},
  connections: mainConnections,
  active: false,
  settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveManualExecutions: true, saveExecutionProgress: true },
  versionId: '21000000-0000-4000-8000-000000000001',
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

const errorNodes = [
  node('31000000-0000-4000-8000-000000000001', 'Erro do workflow', 'n8n-nodes-base.errorTrigger', 1, [-420, 0], {}),
  codeNode('31000000-0000-4000-8000-000000000002', 'Formatar incidente', [-160, 0], `const data=$input.first().json; const execution=data.execution||{}; const workflow=data.workflow||{}; const day=new Date().toISOString().slice(0,10); return [{json:{title:'[N8N] Falha de inteligência editorial '+day,body:'Falha no workflow **'+(workflow.name||'desconhecido')+'**.\\n\\n- Execução: '+(execution.url||execution.id||'não informada')+'\\n- Último nó: '+(execution.lastNodeExecuted||'não informado')+'\\n- Erro: '+(execution.error?.message||data.error?.message||'não informado')+'\\n\\nA execução fica bloqueada; nenhum conteúdo é publicado automaticamente.'}}];`),
  httpNode('31000000-0000-4000-8000-000000000003', 'Criar incidente no GitHub', [100, 0], { method: 'POST', url: 'https://api.github.com/repos/marcuscapobiangomed-ai/thebikerblog/issues', sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github+json' }, { name: 'X-GitHub-Api-Version', value: '2022-11-28' }] }, sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: '={{ JSON.stringify({ title: $json.title, body: $json.body }) }}' }, 'githubApi'),
];
const errorConnections = {}; connect(errorConnections, 'Erro do workflow', 'Formatar incidente'); connect(errorConnections, 'Formatar incidente', 'Criar incidente no GitHub');
const errorWorkflow = { name: 'TheBiker — Erros da inteligência editorial', nodes: errorNodes, pinData: {}, connections: errorConnections, active: false, settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveManualExecutions: true }, versionId: '21000000-0000-4000-8000-000000000002', meta: { templateCredsSetupCompleted: false }, tags: [] };

const outputs = new Map([
  ['thebiker-seo-youtube-intelligence.json', JSON.stringify(mainWorkflow, null, 2) + '\n'],
  ['thebiker-intelligence-errors.json', JSON.stringify(errorWorkflow, null, 2) + '\n'],
]);
await fs.mkdir(targetDirectory, { recursive: true });
for (const [name, content] of outputs) {
  const target = path.join(targetDirectory, name);
  if (check) {
    const existing = await fs.readFile(target, 'utf8').catch(() => '');
    if (existing.replace(/\r\n/g, '\n') !== content) throw new Error(`Workflow n8n desatualizado: ${path.relative(root, target)}`);
  } else await fs.writeFile(target, content);
}
console.log(`${outputs.size} workflows n8n ${check ? 'verificados' : 'gerados'}.`);
