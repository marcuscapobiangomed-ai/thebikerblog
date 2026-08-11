# Evidência de configuração de público no GA4 — 2026-08-07

## Propriedade

- Nome: `TheBiker Blog`
- Property ID: `546043157`
- Measurement ID no site: `G-DHD86P6XDZ`
- Clarity Project ID no site: `xyo6bi7k8g`

## Dimensões personalizadas confirmadas

Todas foram criadas com escopo de evento:

1. Tipo de página — `page_type`
2. Tipo de conteúdo — `content_type`
3. Categoria do conteúdo — `content_category`
4. ID do produto — `product_id`
5. Posicionamento — `placement`
6. Percentual de rolagem — `percent_scrolled`
7. Intenção editorial — `audience_intent`
8. Nível alvo do conteúdo — `experience_level_target`

## Evento principal e públicos

- `store_click`: confirmado como evento principal.
- `Alta intenção TheBiker`: criado, duração de 30 dias, condição `store_click`.
- `Leitores técnicos engajados`: criado, duração de 28 dias, condição `event_name = qualified_read`.
- `Audiência recorrente qualificada`: não criada nesta data. A propriedade mostrava 13 usuários no período disponível; ativar somente quando houver volume para validar a condição de duas sessões engajadas sem falsa precisão.

## Snapshot observado antes desta publicação

Na página inicial do GA4, para os sete dias exibidos:

- 11 usuários ativos;
- 488 eventos;
- 10 novos usuários;
- 110 visualizações;
- 19 sessões diretas, 6 não atribuídas e 4 orgânicas.

Este snapshot comprova coleta, mas não é a linha de base dos KPIs. A linha de base oficial exige 28 dias completos após a publicação dos novos parâmetros.

## Janela de verificação

Dimensões personalizadas e públicos podem levar de 24 a 48 horas para acumular dados. A revisão operacional deve confirmar:

1. `audience_intent` e `experience_level_target` preenchidos nos relatórios;
2. `qualified_read` aparecendo depois de leitores atingirem 75% dos artigos;
3. os dois públicos acumulando usuários;
4. custom tags equivalentes aparecendo nos filtros do Clarity;
5. ausência de PII e respeito ao consentimento.
