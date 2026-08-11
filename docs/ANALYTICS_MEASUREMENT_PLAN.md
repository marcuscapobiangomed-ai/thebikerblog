# TheBiker Analytics Measurement Plan

## Objetivo

Transformar audiência em decisões editoriais e comerciais verificáveis. O sistema combina:

- **Google Analytics 4:** aquisição, audiência, engajamento e conversões;
- **Microsoft Clarity:** mapas de calor, mapas de rolagem e gravações de interação;
- **UTMs:** atribuição dos acessos enviados para a loja;
- **Search Console e Bing Webmaster:** demanda orgânica e indexação, analisadas separadamente do comportamento no site.

A propriedade GA4 existente usa `G-DHD86P6XDZ`. O projeto Clarity `xyo6bi7k8g` está configurado em `_config.yml`; ambos carregam somente após consentimento de analytics.

O contrato de público, a taxonomia e os três KPIs primários ficam em `docs/AUDIENCE_OPERATING_SYSTEM.md` e `_data/audience.json`.

## Funil principal

```text
Aquisição → Conteúdo consumido → Intenção de produto → Clique para a loja
                               ↘ Comparador/ferramenta ↗
```

| Etapa | Evento | O que responde |
|---|---|---|
| Entrada | `page_view` | Quantas páginas e sessões foram vistas? |
| Conteúdo | `content_view` | Quais artigos atraem leitores? |
| Qualidade | `scroll_depth` | O leitor chegou a 25%, 50%, 75% ou 90%? |
| Leitura qualificada | `qualified_read` | O leitor chegou a 75% do artigo? |
| Produto | `view_item` | Qual produto despertou intenção? |
| Comparação | `comparison_add` | Quais modelos entram na consideração? |
| Comparação | `comparison_complete` | Quantas comparações foram concluídas? |
| Ferramenta | `size_calculator_complete` | A calculadora de tamanho foi concluída? |
| Ferramenta | `gear_calculator_complete` | A calculadora de marchas foi concluída? |
| Conversão | `store_click` | Quem saiu para a TheBiker Shop e de qual posição? |
| Navegação | `internal_link_click` | Quais links mantêm o visitante avançando dentro do blog? |
| Navegação | `external_link_click` | Quais fontes e destinos externos recebem cliques? |
| Interação | `button_click` | Quais botões de interface são utilizados? |
| Interesse | `newsletter_interest` | Houve intenção de cadastro no formulário atual? |

`newsletter_interest` não deve ser tratado como inscrição ou lead enquanto o formulário não estiver conectado a um serviço que realmente grave o cadastro.

## Parâmetros permitidos

- `page_path`
- `page_type`
- `content_id`
- `content_type`
- `content_category`
- `percent_scrolled`
- `product_id`
- `product_brand`
- `product_model`
- `product_ids`
- `product_count`
- `placement`
- `element_type`
- `element_name`
- `link_type`
- `destination_host`
- `destination_path`
- `button_type`
- `profile`
- `audience_intent`
- `experience_level_target`

Nome, e-mail, telefone, CPF, endereço e conteúdo de formulários são bloqueados pelo coletor e não podem ser parâmetros de analytics.
O destino nunca inclui query string ou fragmento. Botões dentro de formulários, controles de consentimento e elementos com `data-analytics-ignore` ficam fora do tracking genérico.

## Configuração no GA4

As oito dimensões abaixo, o evento principal `store_click` e os públicos **Alta intenção TheBiker** e **Leitores técnicos engajados** foram configurados em 7 de agosto de 2026. A evidência operacional está em `docs/operations/analytics-audience-configuration-2026-08-07.md`.

Em **Administrador → Definições personalizadas**, cadastrar como dimensões de evento:

1. `page_type`
2. `content_type`
3. `content_category`
4. `product_id`
5. `placement`
6. `percent_scrolled`
7. `audience_intent`
8. `experience_level_target`

Todas têm escopo **Evento**. `audience_intent` e `experience_level_target` são dimensões de baixa cardinalidade que descrevem a página; não representam uma inferência sobre a identidade do visitante. Os dados podem levar de 24 a 48 horas para aparecer nos relatórios após coleta e cadastro.

Em **Administrador → Eventos principais**, marcar `store_click` como evento principal. `newsletter_interest` só deve virar evento principal quando a inscrição for real.

### Relatórios recomendados

1. **Visão executiva:** usuários, sessões, sessões engajadas, visualizações, origem/mídia e `store_click`.
2. **Conteúdo:** título/caminho, `content_view`, usuários, 50% e 90% de rolagem e cliques para a loja.
3. **Produtos:** `view_item`, comparações, `store_click` e taxa produto → loja.
4. **Aquisição:** source/medium/campaign, landing page, engajamento e conversões.
5. **Tecnologia:** dispositivo, navegador, resolução e páginas com perda de engajamento.
6. **Público editorial:** intenção, nível-alvo, origem, leitura qualificada e saída para a loja.
7. **Navegação e CTAs:** `element_name`, `placement`, `link_type`, destino e volume de cliques por página.

Taxas operacionais:

- leitura qualificada = usuários com `scroll_depth=50` / usuários com `content_view`;
- leitura completa = usuários com `scroll_depth=90` / usuários com `content_view`;
- intenção comercial = usuários com `store_click` / usuários com `view_item`;
- taxa de saída para a loja = sessões com `store_click` / sessões com `content_view`;
- progressão interna = sessões com `internal_link_click` / sessões com `content_view`;
- adoção de CTA = sessões com o clique do elemento / sessões que visualizaram a página onde ele aparece;
- uso do comparador = usuários com `comparison_complete` / usuários com `comparison_add`.

### Tráfego de assistentes de IA

O coletor classifica referências conhecidas de ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, Meta AI e Poe sem armazenar a pergunta do usuário. As dimensões `traffic_source_type` e `ai_assistant_source` acompanham o evento `ai_referral_visit`. O parâmetro oficial `utm_source=chatgpt.com` também é reconhecido. Referenciadores desconhecidos permanecem como `standard`; nenhuma origem é inferida sem evidência no referrer ou UTM.

### Públicos comportamentais

1. **Leitores técnicos engajados (28 dias):** usuários que acionaram `qualified_read` ao chegar a 75% do artigo.
2. **Alta intenção TheBiker (30 dias):** usuários que acionaram `store_click`; `view_item` e `comparison_complete` permanecem como drivers de intenção nos relatórios.
3. **Audiência recorrente qualificada (90 dias):** duas ou mais sessões engajadas; ativar apenas depois de validar volume e disponibilidade da condição no construtor.

Não criar público por profissão presumida, poder aquisitivo inferido ou “nível do ciclista” deduzido da navegação. Perfil declarado só entra com consentimento e integração real do formulário.

## Configuração necessária no Clarity

1. Criar um projeto para a URL pública final do blog.
2. Copiar somente o Project ID para `clarity_project_id` em `_config.yml`.
3. Manter a exigência de consentimento habilitada.
4. Usar custom tags para `page_type`, `content_type`, `content_category`, `audience_intent` e `experience_level_target`.
5. Salvar segmentos para artigos técnicos engajados, intenção TheBiker, mobile e busca orgânica.
6. Revisar semanalmente click maps, scroll maps, attention maps, dead clicks, rage clicks e gravações de páginas com abandono.

Clarity é carregado somente após autorização. A integração envia Consent API v2 com anúncios negados e analytics autorizado.

## Padrão UTM

Todos os links para `thebikershop.com.br` recebem, quando ainda não possuem marcação:

```text
utm_source=thebikerblog
utm_medium=referral
utm_campaign=editorial
utm_content=<posição-do-link>
```

Posições atuais: `site_header`, `site_footer`, `home_shop_cta`, `article_body`, `affiliate-links` e `page`.

## Ritual de acompanhamento

### Semanal

- páginas com maior crescimento e maior queda;
- artigos com muita entrada e baixa rolagem;
- produtos com `view_item` alto e `store_click` baixo;
- mapas de calor mobile das cinco principais landing pages;
- dead clicks, rage clicks e erros de navegação.

### Mensal

- aquisição por canal e campanha;
- conteúdo orgânico que influencia saída para a loja;
- clusters com melhor leitura qualificada;
- dispositivos e templates com pior engajamento;
- revisão da taxonomia, retenção e consentimento;
- decisões documentadas: atualizar, consolidar, promover ou retirar página.

## Critérios de aceite técnico

- antes da escolha: nenhum script GA4 ou Clarity carregado;
- rejeitar: consentimento negado e nenhum evento enviado;
- aceitar: uma única tag GA4, um único `page_view` e eventos sem PII;
- links da loja: um `store_click` e UTMs preservadas;
- artigo: `content_view` e marcos de 25/50/75/90 apenas uma vez por carregamento;
- produto: um `view_item` com ID, marca e modelo;
- rodapé: preferência pode ser reaberta e revogada;
- mobile: banner não bloqueia permanentemente navegação ou conteúdo.

## Limites atuais

- a propriedade e os IDs foram confirmados, mas dimensões, públicos e coleta recente precisam ser validados no painel e aguardam a janela normal de processamento;
- mapas de calor dependem de tráfego real com consentimento; ausência de sessões não é falha de instalação;
- páginas de busca, administração, login e conta são excluídas das gravações; campos de formulário também recebem máscara explícita;
- atribuição de venda exige que a loja preserve UTMs e, para receita real, implemente medição cross-domain ou integração de conversão na própria loja.
