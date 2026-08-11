import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function expect(condition, message) {
  if (!condition) failures.push(message)
}

const config = read('_config.yml')
const analyticsInclude = read('_includes/analytics.html')
const defaultLayout = read('_layouts/default.html')
const footer = read('_includes/footer.html')
const consent = read('assets/js/privacy-consent.js')
const events = read('assets/js/analytics-events.js')
const affiliateLinks = read('_includes/affiliate-links.html')
const newsletter = read('newsletter.html')
const search = read('search.html')
const privacyPolicy = read('legal/privacy-policy.md')
const cookiePolicy = read('legal/cookie-policy.md')
const audience = JSON.parse(read('_data/audience.json'))
const audiencePlan = read('docs/AUDIENCE_OPERATING_SYSTEM.md')
const customDomain = read('CNAME').trim()
const domainRunbook = read('docs/operations/custom-domain-nuvemshop-github-pages.md')
const machineReadableProducts = read('api/products.json')
const editorialWorkflow = read('.github/workflows/editorial-intelligence.yml')

expect(/google_analytics:\s*G-[A-Z0-9]+/i.test(config), 'Measurement ID GA4 ausente')
expect(/clarity_project_id:\s*"[a-z0-9]+"/i.test(config), 'Project ID real do Clarity ausente')
expect(customDomain === 'blog.thebiker.com.br', 'CNAME não corresponde ao domínio publicado')
expect(config.includes(`url: "https://${customDomain}"`), 'URL canônica não corresponde ao CNAME')
expect(domainRunbook.includes(`https://${customDomain}/`), 'Runbook não corresponde ao domínio publicado')
expect(!machineReadableProducts.includes('insights.thebikershop.com.br'), 'Produtos estruturados usam o domínio antigo')
expect(!editorialWorkflow.includes('insights.thebikershop.com.br'), 'Workflow editorial usa o domínio antigo')
for (const consentType of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']) {
  expect(new RegExp(`${consentType}:\\s*'denied'`).test(analyticsInclude), `Consentimento padrão não negado: ${consentType}`)
}
expect(defaultLayout.includes('{% include consent-banner.html %}'), 'Banner de consentimento não incluído no layout')
expect(footer.includes('data-open-privacy-preferences'), 'Rodapé não reabre preferências')
expect(consent.includes('thebiker:consent-change'), 'Evento de alteração de consentimento ausente')
expect(consent.includes("analytics_Storage: granted ? 'granted' : 'denied'"), 'Clarity Consent API v2 ausente')
expect(!events.includes('G-DHD86P6XDZ'), 'Measurement ID não deve estar duplicado no coletor de eventos')
expect(!events.includes('localStorage'), 'Eventos de navegação não devem persistir no navegador')
expect(!affiliateLinks.includes('onclick='), 'Clique de afiliado possui tracking inline duplicado')
expect(newsletter.includes("'newsletter_interest'"), 'Evento de interesse em newsletter ausente')
expect(!/TheBikerBlog\.track\([\s\S]{0,300}(email:|name:)/.test(newsletter), 'Newsletter envia PII ao analytics')
expect(newsletter.includes('data-clarity-mask="true"'), 'Formulário sensível sem máscara explícita do Clarity')
expect(search.includes("'search_results'"), 'Busca interna sem evento agregado')
expect(!search.includes('search_term:'), 'Termo digitado não deve ser enviado ao analytics')
expect(consent.includes("page_location: window.location.origin + window.location.pathname"), 'GA4 pode receber parâmetros sensíveis da URL')
expect(consent.includes('(admin|search|login|conta)'), 'Clarity não exclui páginas sensíveis')
for (const eventName of ['content_view', 'scroll_depth', 'qualified_read', 'view_item', 'comparison_complete', 'store_click', 'internal_link_click', 'external_link_click', 'button_click', 'race_calendar_view', 'race_outbound_click']) {
  expect(events.includes(`'${eventName}'`), `Evento obrigatório ausente: ${eventName}`)
}
for (const parameter of ['element_type', 'element_name', 'link_type', 'destination_host', 'destination_path', 'button_type']) {
  expect(events.includes(parameter), `Parâmetro de clique ausente: ${parameter}`)
}
expect(events.includes("url.pathname"), 'Destino de clique deve usar caminho sem query string')
expect(events.includes("form')"), 'Botões de formulário devem ser excluídos do tracking genérico')
expect(events.includes('data-analytics-ignore'), 'Elementos precisam permitir exclusão explícita do tracking')
expect(events.includes('data-consent-accept'), 'Controles de consentimento não podem gerar tracking genérico')
expect(events.includes("'ai_referral_visit'"), 'Evento de referência por assistente de IA ausente')
for (const assistant of ['chatgpt', 'perplexity', 'claude', 'gemini', 'microsoft_copilot']) {
  expect(events.includes(`'${assistant}'`), `Classificação de assistente ausente: ${assistant}`)
}
for (const parameter of ['traffic_source_type', 'ai_assistant_source']) {
  expect(events.includes(parameter), `Parâmetro de aquisição por IA ausente: ${parameter}`)
}
for (const parameter of ['audience_segment', 'audience_intent', 'experience_level_target']) {
  expect(events.includes(parameter), `Parâmetro de público ausente: ${parameter}`)
  expect(analyticsInclude.includes(parameter.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())), `Configuração Liquid ausente: ${parameter}`)
}
expect(events.includes("window.clarity('set'"), 'Custom tags do Clarity ausentes')
expect(audience.segments.length === 3, 'Contrato precisa ter três segmentos de público')
expect(audience.privacy.inferOccupation === false, 'Ocupação não pode ser inferida')
expect(audience.privacy.inferPersonalExperienceLevel === false, 'Nível pessoal não pode ser inferido')
expect(audiencePlan.includes('Três KPIs primários'), 'Plano de público sem KPIs primários')
expect(privacyPolicy.includes('Microsoft Clarity'), 'Política de privacidade não declara Clarity')
expect(cookiePolicy.includes('Desativada'), 'Política de cookies não informa estado inicial')

for (const file of ['assets/js/privacy-consent.js', 'assets/js/analytics-events.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' })
  if (result.status !== 0) failures.push(`${file}: JavaScript inválido\n${result.stderr}`)
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`ERRO: ${failure}`))
  process.exit(1)
}

console.log('✓ Analytics, consentimento, eventos e políticas validados')
