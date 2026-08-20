import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildEditorialTopicLedger, editorialTopicKey, topicHistoryBlocksCandidate } from '../bot/src/automation/topic-ledger.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'thebiker-topic-ledger-'))
await fs.mkdir(path.join(root, '_posts', 'drafts'), { recursive: true })
await fs.mkdir(path.join(root, '_posts', 'archived'), { recursive: true })
await fs.writeFile(path.join(root, '_posts', '2026-08-20-pauta-publicada.md'), `---
published: true
title: "Pressão dos pneus por terreno: protocolo técnico"
slug: "pressao-pneus-terreno"
date: 2026-08-20
category: engenharia
---
Conteúdo.
`)
await fs.writeFile(path.join(root, '_posts', 'archived', '2026-07-01-pauta-arquivada.md'), `---
editorial_status: "published"
title: "Inspeção da transmissão depois da chuva"
date: 2026-07-01
---
Conteúdo.
`)
await fs.writeFile(path.join(root, '_posts', 'drafts', '2026-08-21-rascunho.md'), `---
published: true
title: "Rascunho não pode entrar no histórico"
date: 2026-08-21
---
Conteúdo.
`)

const ledger = await buildEditorialTopicLedger({ root, now: new Date('2026-08-21T12:00:00Z') })
assert.equal(ledger.items.length, 2)
assert.equal(ledger.items.some((item) => item.id === 'rascunho'), false)
assert.equal(ledger.items[0].cooldownUntil, '2026-12-28')
assert.equal(ledger.generatedAt, '2026-08-20T12:00:00.000Z', 'o artefato precisa ser determinístico quando nada mudou')

const candidate = {
  id: 'nova-pressao',
  title: 'Pressão dos pneus por terreno: protocolo técnico',
  category: 'engenharia',
}
assert.equal(topicHistoryBlocksCandidate(candidate, ledger.items, { onDate: '2026-09-01' }), true)
assert.equal(topicHistoryBlocksCandidate(candidate, ledger.items, { onDate: '2027-03-01' }), false)
assert.equal(topicHistoryBlocksCandidate({ ...candidate, id: 'pauta-publicada', title: 'Outro título técnico' }, ledger.items, { onDate: '2027-03-01' }), true)
assert.equal(topicHistoryBlocksCandidate({ ...candidate, category: 'competicoes' }, ledger.items, { onDate: '2026-09-01' }), false, 'cobertura recorrente de eventos usa eventIds em vez de cooldown editorial')
assert.equal(topicHistoryBlocksCandidate({ ...candidate, id: 'pauta-publicada', category: 'competicoes' }, ledger.items, { onDate: '2027-03-01' }), true, 'nem corridas podem reutilizar o id exato de um post publicado')
assert.equal(editorialTopicKey('Pressão dos pneus em 2026'), 'pressao-pneus')

await fs.rm(root, { recursive: true, force: true })
console.log('Registro histórico antirrepetição validado com sucesso.')
