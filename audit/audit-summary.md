# Auditoria Editorial — Resumo Executivo

## Status atual

| Métrica | Valor |
|---------|-------|
| Total de artigos publicados | 32 |
| Artigos auditados (Lotes 1-4) | 20 |
| Artigos pendentes | 12 |
| Data da auditoria | 2026-07-19 |

## Decisões do Lote 1

| Decisão | Quantidade | Artigos | Status |
|---------|-----------|---------|--------|
| Fundir | 3 | Post 1, 9, 10 → guia único de iniciantes | ✅ Concluído |
| Reescrever | 2 | Post 2 (até R$ 5k), Post 3 (até R$ 10k) | ✅ Concluído |
| Manter | 0 | — | — |
| Redirecionar | 0 | — | Pendente (após revisão) |
| Remover | 0 | — | — |

## Decisões do Lote 2

| Decisão | Quantidade | Artigos | Status |
|---------|-----------|---------|--------|
| Reescrever | 3 | Post 11 (Addict), Post 12 (Foil), Post 4 (comparativo) | ✅ Concluído |
| Fundir | 1 | Posts 28 + 33 (importação) → guia único | ✅ Concluído |

## Decisões do Lote 3

| Decisão | Quantidade | Artigos | Status |
|---------|-----------|---------|--------|
| Reescrever | 4 | Post 14 (Tarmac SL8), Post 15 (Madone vs Émonda), Post 16 (SuperSix vs SystemSix), Post 5 (Émonda vs Tarmac) | ✅ Concluído |

## Decisões do Lote 4

| Decisão | Quantidade | Artigos | Status |
|---------|-----------|---------|--------|
| Reescrever | 1 | Post 23 (capacetes) | ✅ Concluído |
| Atualizar | 5 | Posts 20, 21, 22, 24, 7 | ✅ Concluído |

## Problemas críticos encontrados

### 1. Inconsistência de preços
Caloi Elite Carbon aparece com **3 preços diferentes** em 3 posts:
- R$ 4.999 (post 2)
- R$ 9.500 (post 3)
- R$ 10.000 (post 9)

Isso quebra completamente a credibilidade do domínio.

### 2. Modelos inventados ou confundidos
- "Shimano Sora" listada como bicicleta (post 1)
- "Soul 100" — marca não identificada (post 2)
- "Trekk 1.1" — Trek escrito errado, modelo inexistente (post 3)
- "Caloi 10" — modelo urbano confundido com bike de estrada (post 10)

### 3. Duplicidade temática
Posts 1, 9 e 10 respondem à mesma pergunta: 3 artigos que deveriam ser 1.

### 4. Ausência de fontes
Nenhum dos 32 posts tem URLs reais como fonte. Todas as seções "Fontes consultadas" são placeholders genéricos.

### 5. Imagens
Nenhuma imagem tem origem comprovada. Os paths no frontmatter apontam para arquivos que não existem.

### 6. Preços inventados (Lote 2)
Scott Foil RC 20 antigo dizia "a partir de R$ 35.000". Preço real na AllSports Store: R$ 53.999.

### 7. Confusão entre modelos
Post 11 tratava Addict (endurance) e Addict RC (race) como sinônimos. São linhas diferentes com geometrias, quadros e públicos distintos.

### 8. Erro grave de matemática em importação
Post 28 usava "R$ 4.000" em um contexto que sugeria ser o valor em dólar (USD), mas escrevia como real (BRL), causando confusão sobre o custo real.

### 9. Duplicidade em importação
Posts 28 e 33 tratavam do mesmo tema (importação de bike). Fundidos em guia único.

### 10. Descontinuações não documentadas (Lote 3)
Post 15 não mencionava que a Trek descontinuou a Émonda (Madone Gen 8 substitui). Post 16 não mencionava que o SystemSix foi descontinuado (SuperSix Evo Gen 5 absorveu).

### 11. Tiers confundidos (Tarmac SL8)
Post 14 tratava S-Works, Pro e Comp como se fossem a mesma bike. Cada tier tem carbono, peso e componentes diferentes.

### 12. Comparativo desatualizado
Post 5 comparava Émonda SLR com Tarmac SL7 (não SL8), ignorando 2 gerações de diferença.

### 13. Segurança não priorizada (capacetes)
Post 23 original não mencionava MIPS, Kineticore ou WaveCel. Não citava o Virginia Tech Helmet Lab. Preços irreais (R$ 200-R$ 2.000, corrigido para R$ 200-R$ 3.000+).

### 14. Dados incorretos em 105 vs Ultegra
Post 7 dizia "11 velocidades" (ambos 12v), preços irreais (R$ 1.500-2.500 para 105 completo), e afirmava que Ultegra é menos durável que 105 (incorreto).

### 15. Modelos de rodas genéricos
Post 21 listava modelos que não correspondiam a produtos reais disponíveis no Brasil em 2026.

## Próximos passos

### Lote 1 — ✅ Concluído em 19/07/2026
- [x] Pesquisar modelos reais de bike de estrada até R$ 5.000 no Brasil
- [x] Pesquisar modelos reais de bike de estrada de R$ 5.000 a R$ 10.000
- [x] Coletar preços em lojas com data
- [x] Registrar fichas de pesquisa completas
- [x] Escrever novo guia de iniciantes (fundindo posts 1, 9, 10)
- [x] Reescrever guia até R$ 5.000
- [x] Reescrever guia até R$ 10.000
- [ ] Criar imagens com licença (pendente)
- [x] Configurar redirecionamentos
- [ ] Submeter relatório de auditoria após o gate editorial automatizado

### Lote 2 — ✅ Concluído em 19/07/2026
- [x] Pesquisar specs oficiais Scott Addict 2026 (endurance + RC)
- [x] Pesquisar specs oficiais Scott Foil RC 2026 com preços Brasil
- [x] Pesquisar specs oficiais Cervélo Caledonia 2026
- [x] Pesquisar regras de importação 2026 (MP 1.357/2026)
- [x] Registrar fichas de pesquisa (4 JSONs)
- [x] Reescrever guia Scott Addict 2026
- [x] Reescrever review Scott Foil RC 2026
- [x] Reescrever comparativo Addict vs Caledonia
- [x] Fundir posts 28 + 33 em guia único de importação
- [x] Arquivar 5 posts antigos em `_posts/archived/`
- [x] Gerar relatório batch-02.md

### Lote 3 — ✅ Concluído em 19/07/2026
- [x] Pesquisar specs oficiais Specialized Tarmac SL8 (3 tiers)
- [x] Pesquisar Trek Madone Gen 8 vs Émonda (incluir descontinuação)
- [x] Pesquisar Cannondale SuperSix Evo Gen 5 (SystemSix descontinuado)
- [x] Pesquisar comparativo Émonda vs Tarmac SL8 para escalada
- [x] Registrar fichas de pesquisa (4 JSONs)
- [x] Reescrever review Specialized Tarmac SL8 2026
- [x] Reescrever comparativo Madone vs Émonda
- [x] Reescrever review SuperSix Evo 2026 (com contexto do SystemSix)
- [x] Reescrever comparativo Émonda vs Tarmac SL8
- [x] Arquivar 4 posts antigos em `_posts/archived/`
- [x] Gerar relatório batch-03.md

### Lote 4 — ✅ Concluído em 19/07/2026
- [x] Pesquisar dados atuais de capacetes, grupos, rodas, pedais e sensores
- [x] Registrar fichas de pesquisa (2 JSONs)
- [x] Reescrever guia de capacetes (prioridade 1 — segurança)
- [x] Atualizar comparativo 105 vs Ultegra com dados reais (peso, preço, Di2)
- [x] Atualizar guia de rodas de carbono com modelos reais disponíveis no Brasil
- [x] Atualizar guia de pedais clipless com fontes e preços
- [x] Atualizar artigo de sensores de potência com fontes
- [x] Atualizar artigo de inovações em componentes com fontes
- [x] Arquivar 1 post antigo em `_posts/archived/`
- [x] Gerar relatório batch-04.md

### Próximos lotes
| Lote | Tema | Artigos | Prioridade |
|------|------|---------|------------|
| 5 | Guias perenes (tamanho, manutenção, carbono vs alumínio, importação) | 7 | Média |
| 6 | Tendências, WorldTour, lançamentos | 4 | Média |

## Risco editorial

**ALTO** — Os guias de compra (Lote 1) têm potencial de causar prejuízo financeiro a leitores com informações incorretas. Recomenda-se tratar esses artigos antes de qualquer outro conteúdo.

## Arquivos gerados nesta auditoria

```
audit/
├── content-inventory.csv          # Inventário básico (32 posts)
├── content-inventory-complete.csv # Inventário completo com avaliações
├── decisions.csv                  # Decisões por artigo
├── redirects.yml                  # Mapa de redirecionamentos
├── audit-summary.md               # Este arquivo
└── batches/
    ├── batch-01.md                # Análise detalhada do Lote 1
    ├── batch-02.md                # Análise detalhada do Lote 2
    ├── batch-03.md                # Análise detalhada do Lote 3
    └── batch-04.md                # Análise detalhada do Lote 4

content/research/batch-01/
├── melhor-bike-de-estrada-para-iniciantes.json
├── melhores-bikes-de-estrada-ate-5-mil.json
└── melhores-bikes-de-estrada-ate-10-mil.json

content/research/batch-02/
├── scott-addict-2026.json
├── scott-foil-2026.json
├── scott-addict-vs-cervelo-caledonia.json
└── guia-importacao-bike-2026.json

content/research/batch-03/
├── specialized-tarmac-sl8-2026.json
├── trek-madone-vs-emonda-2026.json
├── cannondale-supersix-evo-2026.json
└── trek-emonda-vs-specialized-tarmac-2026.json

content/research/batch-04/
├── melhores-capacetes-ciclismo-2026.json
└── shimano-105-vs-ultegra-2026.json
```
