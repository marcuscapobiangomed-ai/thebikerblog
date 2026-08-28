# Batch 02 — Scott

**Status:** ✅ Concluído
**Data:** 2026-07-19
**Responsável:** Equipe TheBikerBlog
**Tipo:** Artigos de review e guia técnico (Lote 2)

---

## Artigos no batch

| # | Post antigo | Slug | Ação |
|---|------------|------|------|
| 11 | 2026-06-29 scott-addict-2026-ficha-técnica-completa | scott-addict-2026 | ❌ Arquivado |
| 12 | 2026-06-30 scott-foil-2026-review-completo | scott-foil-2026 | ❌ Arquivado |
| 4 | 2026-07-25 scott-addict-vs-cervélo-caledonia | scott-addict-vs-cervelo-caledonia | ❌ Arquivado |
| 28 | 2026-07-20 quanto-custa-importar-uma-bike-de-estrada | guia-importacao-bike-2026 | ❌ Arquivado |
| 33 | 2026-08-03 quanto-custa-importar-uma-scott-addict | guia-importacao-bike-2026 | ❌ Arquivado (fundido com 28) |

## Artigos novos publicados

| Slug | Título | Editorial Status |
|------|--------|-----------------|
| `2026-07-19-scott-addict-2026-guia-completo` | Scott Addict 2026: Ficha Técnica, Preços e Para Quem é Indicada | draft |
| `2026-07-19-scott-foil-rc-2026-review-completo` | Scott Foil RC 2026: Review Completo da Bicicleta Aero | draft |
| `2026-07-19-scott-addict-vs-cervelo-caledonia-2026` | Scott Addict vs Cervélo Caledonia 2026: Comparativo para Ciclistas | draft |
| `2026-07-19-guia-importacao-bike-estrada-brasil-2026` | Guia Completo: Importar Bike de Estrada para o Brasil em 2026 | draft |

## Erros corrigidos

1. **Post 11 (Addict):** confundia Addict (endurance) com Addict RC (race) como se fossem o mesmo modelo. Agora são duas linhas distintas com especificações separadas.
2. **Post 12 (Foil):** preços inventados (R$ 35.000-55.000 sem fonte). Corrigido com dados reais da AllSports Store (R$ 53.999 a R$ 94.990).
3. **Post 4 (comparativo):** usava dados de 2025 como se fossem 2026. Corrigido com specs 2026 oficiais de ambos os fabricantes.
4. **Post 28 (importação):** erro grave: usava "R$ 4.000" como exemplo de custo em dólar (USD), mas escrevia como se fosse real (BRL). Correção: mostra que a matemática original estava errada e recalcula com valores reais.
5. **Post 33 (import Scott):** duplicata do post 28 com foco na Scott Addict. Fundido com o post 28 no novo guia único de importação.
6. **Preços Scott Foil:** post antigo dizia "Foil RC 20 a partir de R$ 35.000". Preço real: R$ 53.999 (AllSports Store).
7. **Grupo Shimano 105:** post antigo do comparativo tratava 105 mecânico como "groupset de entrada". Em 2026, 105 mecânico 12v é um excelente grupo intermediário.

## Research files

| Arquivo | Conteúdo |
|---------|----------|
| `content/research/batch-02/scott-addict-2026.json` | Ficha técnica: Addict endurance (6 modelos, €2.799-€7.699) e Addict RC (5 modelos, $4.999-$14.999) |
| `content/research/batch-02/scott-foil-2026.json` | Ficha Foil RC: 5 modelos (€4.599-€11.999), preços Brasil (AllSports Store): R$ 53.999 a R$ 94.990 |
| `content/research/batch-02/scott-addict-vs-cervelo-caledonia.json` | Comparativo Real vs Real: specs oficiais 2026 |
| `content/research/batch-02/guia-importacao-bike-2026.json` | Regras de importação 2026 (MP 1.357/2026): RTS até US$ 3.000, II 60%, ICMS 17-20%, desconto US$ 30 no PRC |

## Pendências

- [ ] Imagens: artigos novos têm paths de frontmatter mas arquivos reais não foram criados
- [ ] Preços Brasil: Scott Addict e Cervélo Caledonia ainda sem preços oficiais no Brasil — revisar em 3 meses
- [ ] Redirecionamentos: adicionar rotas em `_redirects.yml` para os 5 posts antigos
- [ ] Gate editorial automatizado: artigos permanecem em `editorial_status: draft` até recibo, score e bloqueadores serem validados

## Verificação

- [x] 4 artigos novos escritos (com fontes reais, sem preços inventados)
- [x] 5 posts antigos arquivados em `_posts/archived/`
- [x] 1 research JSON criado (importação)
- [x] Frontmatter completo com fontes, tags e metadados
- [x] Disclaimer "Como este artigo foi produzido" em cada post
