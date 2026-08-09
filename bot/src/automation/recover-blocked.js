import fs from 'node:fs/promises'
import path from 'node:path'
import { CampaignSchema, publicCampaignSummary } from './campaign.js'

const TRANSIENT = /timeout|timed out|aborted|429|rate limit|temporar|econnreset|fetch failed/i
const FINALIZATION = /^Valida(?:ção|cao) final:/i

const RECOVERY_RESERVES = [
  { id: 'reserva-radar-profissional-oficial', title: 'Radar profissional: próxima prova com calendário e resultados oficialmente verificáveis', summary: 'Reserva de cobertura profissional que só avança depois de ser vinculada a um evento e a fontes oficiais revalidadas.', category: 'competicoes', race: { track: 'professional-coverage', format: 'weekly-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'reserva-calendario-participativo-oficial', title: 'Calendário brasileiro de provas: atualização com inscrições e mudanças verificadas', summary: 'Reserva participativa que permanece pendente até receber eventos oficiais, situação de inscrição e checagem recente das fontes.', category: 'competicoes', race: { track: 'participant-calendar', format: 'calendar-roundup', eventIds: [], sourceStatus: 'pending' } },
  { id: 'reserva-diagnostico-ruidos-bike', title: 'Diagnóstico de ruídos na bicicleta: método por carga, frequência e interface', summary: 'Protocolo técnico para isolar ruídos de transmissão, cockpit, rodas e quadro sem substituir componentes por tentativa e erro.', category: 'manutencao-ajustes' },
  { id: 'reserva-pressao-pneus-terreno', title: 'Pressão de pneus por terreno: como testar sem transformar sensação em dado', summary: 'Método de campo para ajustar pressão, registrar comportamento e separar aderência, suporte lateral, impacto e resistência ao rolamento.', category: 'engenharia' },
  { id: 'reserva-inspecao-pos-chuva', title: 'Inspeção pós-chuva: os pontos que concentram contaminação, corrosão e desgaste', summary: 'Rotina técnica depois de treinos molhados, priorizando rolamentos, transmissão, freios, suspensão e interfaces do quadro.', category: 'manutencao-ajustes' },
  { id: 'reserva-cabos-mangueiras-roteamento', title: 'Cabos e mangueiras: roteamento, atrito e sinais de montagem que pedem correção', summary: 'Leitura técnica de curvas, fixações, contato com o quadro e interferências que alteram comando, ruído e durabilidade.', category: 'componentes' },
  { id: 'reserva-limpeza-transmissao-metodo', title: 'Limpeza de transmissão: como remover contaminantes sem deslocar o problema', summary: 'Sequência de limpeza, inspeção e relubrificação que considera corrente, cassete, coroas, roldanas e compatibilidade química.', category: 'manutencao-ajustes' },
]

function localDate(now, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function reserveToItem(reserve, blocked) {
  return {
    day: blocked.day,
    publishDate: blocked.publishDate,
    id: reserve.id,
    title: reserve.title,
    summary: reserve.summary,
    category: reserve.category,
    ...(reserve.race ? { race: structuredClone(reserve.race) } : {}),
    freshness: reserve.category === 'competicoes' ? 'event-driven' : ['review', 'comparativo', 'lancamentos'].includes(reserve.category) ? 'revalidate-24h' : 'evergreen',
    status: 'planned',
    productIds: [],
    imageAssetIds: [],
    attempts: 0,
  }
}

function nextReserve(campaign, blocked) {
  const used = new Set(campaign.items.map((item) => item.id))
  const available = [...campaign.reserves, ...RECOVERY_RESERVES].filter((item, index, items) => !used.has(item.id) && items.findIndex((candidate) => candidate.id === item.id) === index)
  if (blocked.race) return available.find((item) => item.race?.track === blocked.race.track) || null
  return available.find((item) => item.category !== 'competicoes') || null
}

export function recoverBlockedCampaign(campaignInput, { now = new Date(), maximumTransientAttempts = 2 } = {}) {
  const campaign = CampaignSchema.parse(structuredClone(campaignInput))
  const today = localDate(now, campaign.timezone)
  const blocked = campaign.items.find((item) => item.status === 'blocked' && item.publishDate >= today)
  if (!blocked) return { campaign, result: { status: 'idle' }, exception: null }
  const reason = blocked.blockReason || 'Motivo não informado'
  if (FINALIZATION.test(reason) && blocked.postPath) {
    blocked.status = 'validation'
    delete blocked.blockReason
    return {
      campaign: CampaignSchema.parse(campaign),
      result: { status: 'retry-finalization', itemId: blocked.id, attempts: blocked.attempts || 0 },
      exception: null,
    }
  }
  if (TRANSIENT.test(reason) && (blocked.attempts || 0) < maximumTransientAttempts) {
    blocked.status = 'planned'
    delete blocked.blockReason
    return { campaign: CampaignSchema.parse(campaign), result: { status: 'retry', itemId: blocked.id, attempts: blocked.attempts || 0 }, exception: null }
  }
  const reserve = nextReserve(campaign, blocked)
  if (!reserve) return { campaign, result: { status: 'blocked', itemId: blocked.id, reason: 'Nenhuma pauta-reserva disponível' }, exception: null }
  const exception = { recordedAt: now.toISOString(), campaignId: campaign.id, replacedItem: blocked, replacement: { id: reserve.id, title: reserve.title }, reason }
  campaign.items[blocked.day - 1] = reserveToItem(reserve, blocked)
  campaign.reserves = campaign.reserves.filter((item) => item.id !== reserve.id)
  for (const fallback of RECOVERY_RESERVES) {
    if (campaign.reserves.length >= 3 && campaign.reserves.some((item) => item.id === fallback.id)) continue
    if (!campaign.items.some((item) => item.id === fallback.id) && !campaign.reserves.some((item) => item.id === fallback.id)) campaign.reserves.push(fallback)
    if (campaign.reserves.length >= 5) break
  }
  return { campaign: CampaignSchema.parse(campaign), result: { status: 'replaced', itemId: blocked.id, replacementId: reserve.id, publishDate: blocked.publishDate }, exception }
}

export async function recoverBlockedCampaignFiles({ root, now = new Date() } = {}) {
  const campaignPath = path.join(root, 'bot/editorial-campaign.json')
  const campaign = JSON.parse(await fs.readFile(campaignPath, 'utf8'))
  const recovered = recoverBlockedCampaign(campaign, { now })
  if (recovered.result.status === 'idle' || recovered.result.status === 'blocked') return recovered.result
  await fs.writeFile(campaignPath, JSON.stringify(recovered.campaign, null, 2) + '\n')
  await fs.writeFile(path.join(root, '_data/editorial-calendar.json'), JSON.stringify(publicCampaignSummary(recovered.campaign), null, 2) + '\n')
  if (recovered.exception) {
    const ledgerPath = path.join(root, 'bot/operational-state/editorial-exceptions.json')
    const ledger = await fs.readFile(ledgerPath, 'utf8').then(JSON.parse).catch((error) => error?.code === 'ENOENT' ? { schemaVersion: 1, items: [] } : Promise.reject(error))
    ledger.items.push(recovered.exception)
    await fs.writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n')
  }
  return recovered.result
}
