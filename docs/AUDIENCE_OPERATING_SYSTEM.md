# Sistema de público-alvo — TheBiker Blog

## Contrato de público

O TheBiker Blog é o canal editorial oficial da TheBiker para o mercado brasileiro. O núcleo é formado por ciclistas intermediários e avançados, atletas amadores, competidores e entusiastas de tecnologia que tomam decisões de performance, manutenção, ajuste e compra com base em evidências.

O público secundário reúne mecânicos, bike fitters, treinadores, lojistas e especialistas que precisam de especificações rastreáveis. O segmento de crescimento é o ciclista já ativo que está evoluindo para decisões intermediárias. Conteúdo básico pode funcionar como porta de entrada, mas não deve dominar a home, o calendário nem a distribuição.

A fonte canônica e legível por máquinas está em `_data/audience.json`; a versão pública é `/api/audience.json`.

## Necessidades e promessa

| Segmento | Trabalho que precisa realizar | Resposta editorial |
|---|---|---|
| Ciclista técnico/competitivo | Melhorar performance e decidir equipamento | Reviews, comparativos, ajuste e manutenção com efeito prático explicado |
| Profissional de referência | Consultar especificações e limitações | Dados exatos, fontes oficiais, compatibilidade e data de verificação |
| Ciclista em evolução | Sair da decisão genérica para a técnica | Conteúdo progressivo, critérios explícitos e links para aprofundamento |

## Taxonomia de intenção

Cada página declara a intenção editorial; isso descreve o conteúdo, não a identidade do visitante.

- `technical_learning`: compreender tecnologia, engenharia ou técnica;
- `solve_problem`: diagnosticar, ajustar ou manter;
- `compare_products`: comparar opções verificadas do portfólio;
- `purchase_consideration`: avaliar compra ou upgrade;
- `follow_market_competition`: acompanhar lançamento, mercado ou competição;
- `plan_ride`: planejar rota, treino ou experiência de pedal.

O nível-alvo permitido é `intermediate`, `advanced`, `professional`, `intermediate_advanced` ou `mixed_progression`. O padrão é `intermediate_advanced`.

## Uso no calendário e na automação

Todo briefing novo deve trazer `audience_segment`, `audience_intent` e `experience_level_target`. A pauta só avança quando:

1. resolve uma necessidade de pelo menos um segmento canônico;
2. mantém profundidade compatível com o nível-alvo;
3. usa concorrentes apenas como sinal factual, nunca como promoção;
4. associa CTA somente a inventário TheBiker verificado;
5. declara fontes, limitações e método.

A distribuição editorial continua sendo governada pelo guia editorial: reviews e análises técnicas 35%, comparativos 25%, competições 25%, lançamentos/mercado 10% e conteúdo básico no máximo 5%.

## Mensuração sem falsa precisão

O site não infere profissão nem nível pessoal a partir da navegação. GA4 e Clarity recebem apenas o nível-alvo da página, a intenção editorial e ações observadas. Ocupação ou experiência real só podem ser usadas quando declaradas voluntariamente em pesquisa ou newsletter conectada, com consentimento e política de retenção.

### Três KPIs primários

1. **Alcance orgânico qualificado:** sessões orgânicas engajadas em páginas do público prioritário. Fonte: GA4 + Search Console.
2. **Taxa de leitura qualificada:** usuários com `scroll_depth` de 75 ou 90 divididos por usuários com `content_view`. Fonte: GA4.
3. **Taxa de intenção assistida TheBiker:** usuários com `store_click` ou `comparison_complete` divididos por leitores qualificados. Fonte: GA4.

Os primeiros 28 dias completos formam a linha de base. Até existir esse período, metas numéricas são provisórias. Direção inicial para os 90 dias seguintes: +25% em alcance orgânico qualificado, leitura qualificada de pelo menos 35% e intenção assistida de pelo menos 3%.

### Drivers e guardrails

- Drivers: consultas nas posições 4–20, CTR por cluster, retorno qualificado em 28 dias e cobertura das necessidades por segmento.
- Guardrails: zero promoção de concorrente, zero dado comercial vencido publicado e zero falha editorial ignorada.

## Segmentos operacionais

No GA4:

- **Leitores técnicos engajados:** `content_view` seguido de `scroll_depth` 75 ou 90 na mesma sessão;
- **Alta intenção TheBiker:** `view_item`, `comparison_complete` ou `store_click`;
- **Audiência recorrente qualificada:** ativar somente após volume suficiente e validação de duas sessões engajadas.

No Clarity, usar os custom tags `page_type`, `content_type`, `content_category`, `audience_intent` e `experience_level_target` para salvar os mesmos recortes em mapas de calor e gravações.

## Ritual de decisão

- Semanal: analisar páginas com oportunidade de posição 4–20, rolagem baixa, dead/rage clicks e intenção por tipo de conteúdo.
- Mensal: comparar os três KPIs, cobertura por segmento, recorrência e contribuição para a loja.
- Trimestral: revisar a definição dos segmentos com dados observados e respostas voluntárias; nenhuma persona vira fato sem evidência.
