# Inteligência SEO, YouTube e atualização editorial

## Produção e homologação

O workflow `.github/workflows/editorial-intelligence.yml` é o scheduler de produção e não depende de computador ligado. Ele executa o motor compartilhado em `scripts/lib/editorial-intelligence.mjs`, cria ou atualiza a issue operacional e, no ciclo mensal, aciona a renovação da campanha. Os JSONs do n8n continuam como representação visual e ambiente de homologação local da mesma regra de negócio.

## Resultado esperado

O pacote transforma sinais semanais e mensais em uma fila priorizada de pautas e atualizações. Ele consulta o Google Ads Keyword Planner para demanda total aproximada do mercado, Search Console para visibilidade própria, o feed RSS oficial de pesquisas em alta do Google Trends Brasil, vídeos mais vistos relacionados a ciclismo, o ranking `mostPopular` de esportes no Brasil e o índice público do blog. Depois compara demanda, desempenho e cobertura existente, cria briefings rastreáveis e registra o relatório em uma issue do GitHub.

O Keyword Planner usa sementes aderentes ao catálogo, marcas permitidas e a URL pública da TheBikerShop. A coleta é restrita a Google Search, Brasil e idioma português. Ela entrega média mensal aproximada dos últimos 12 meses, histórico mensal e concorrência entre anunciantes. Esses números medem o mercado inteiro, não a presença do TheBiker, e concorrência publicitária não é apresentada como dificuldade orgânica de SEO.

O diagnóstico do Search Console consulta separadamente o blog e `sc-domain:thebikershop.com.br`, além de fazer leituras do total global, do total agregado do Brasil e das consultas detalhadas brasileiras. Isso diferencia ausência global de impressões, ausência de tráfego brasileiro e impressões brasileiras cujas consultas não ficaram visíveis por baixo volume ou privacidade. Somente as consultas detalhadas brasileiras entram no ranking e nas pautas SEO.

Os dados das duas propriedades permanecem identificados como `blog`/`editorial` e `shop`/`commercial`. O relatório apresenta rankings individuais e uma camada cruzada para consultas visíveis nos dois domínios. Essa sobreposição é uma oportunidade de ligação editorial-comercial; só deve ser classificada como canibalização depois de análise da intenção e das páginas envolvidas.

O acesso ao Search Console do blog é obrigatório e continua fail-closed. O acesso à propriedade da loja é opcional porque pertence a terceiro: um `403` fica registrado como `not_authorized`, não derruba o relatório do blog e não é convertido em consulta estimada. Nesse cenário, a loja recebe um diagnóstico público gratuito do PageSpeed Insights, rotulado como `public_measurement`, limitado a performance, SEO técnico e acessibilidade mobile.

O Google Trends RSS é um radar complementar de aceleração jornalística. O fluxo filtra as tendências gerais por termos técnicos do nicho e aceita uma janela com zero sinais elegíveis. O feed não representa volume absoluto, não substitui o Search Console e não autoriza alegações de “palavra-chave mais pesquisada”. A API completa do Google Trends permanece opcional porque exige acesso separado ao programa alfa do Google.

O n8n não publica artigos diretamente. A issue semanal alimenta a inteligência; a issue mensal aciona a renovação automática da janela editorial de 30 dias. O pipeline existente pesquisa fontes, produz o rascunho, valida imagem e texto e só agenda conteúdo aprovado. Essa separação impede que popularidade de vídeo seja tratada como prova factual.

Uma janela sem pauta elegível ainda gera relatório com `planningStatus: insufficient_signals`. Esse estado é diagnóstico, não aprovação: `autoPublish` permanece falso e nenhuma pauta ou campanha é inventada para preencher a lacuna.

## Arquivos importáveis

- `automation/n8n/workflows/thebiker-seo-youtube-intelligence.json`: coleta, normalização, score, deduplicação e relatório.
- `automation/n8n/workflows/thebiker-intelligence-errors.json`: incidente fail-closed no GitHub.
- `automation/n8n/config.example.json`: valores sem segredo usados como referência.
- `.github/workflows/renew-monthly-campaign.yml`: transforma a issue mensal em uma campanha rolante de 30 dias.

Os JSONs são gerados por `npm run build:n8n` e verificados por `npm run check:n8n`. Não edite somente o artefato gerado; altere o gerador ou o motor em `scripts/lib/editorial-intelligence.mjs`.

## Cadência

- segunda-feira, 06:17 em `America/Sao_Paulo`: janela finalizada de sete dias comparada aos sete dias anteriores;
- dia 1 de cada mês, 07:23: janela finalizada de 28 dias comparada aos 28 dias anteriores;
- atraso de três dias no Search Console para evitar decisões com dados ainda incompletos;
- consultas detalhadas e agregadas do Search Console, uma leitura do feed Trends Brasil, buscas `order=viewCount` com cache diário e métricas do YouTube em lote.

O SLO operacional é ter o relatório mensal concluído e a janela renovada até o dia 3. Falha gera incidente e não aprova publicação.

## Credenciais necessárias

Na produção, cadastre `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REFRESH_TOKEN` como secrets do environment `editorial-automation`. `YOUTUBE_API_KEY` é opcional quando o refresh token já possui `youtube.readonly`. Só depois do primeiro teste real defina `INTELLIGENCE_ENABLED=true`.

Para demanda de mercado, use credenciais separadas e cadastre como secrets do mesmo environment:

- `GOOGLE_ADS_CLIENT_ID`;
- `GOOGLE_ADS_CLIENT_SECRET`;
- `GOOGLE_ADS_REFRESH_TOKEN` com escopo `https://www.googleapis.com/auth/adwords`;
- `GOOGLE_ADS_DEVELOPER_TOKEN`.

Cadastre como variables, sem hífens nos IDs:

- `GOOGLE_ADS_CUSTOMER_ID`: conta cliente usada na consulta;
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`: conta administradora que recebeu o developer token;
- `GOOGLE_ADS_API_VERSION=v23`: versão ajustável sem alteração de código.

Enquanto qualquer item estiver ausente, a seção de demanda aparece como `not_configured`; Search Console, Trends e YouTube nunca preenchem essa lacuna.

No n8n local, crie credenciais equivalentes pela interface; nunca edite os JSONs exportados para inserir tokens.

### Google OAuth2

Habilite Search Console API e YouTube Data API no projeto Google. A conta precisa ter acesso à propriedade do Search Console. Use os escopos:

- `https://www.googleapis.com/auth/webmasters.readonly`
- `https://www.googleapis.com/auth/youtube.readonly`

O refresh token de produção precisa conter os dois escopos. No n8n, associe a mesma credencial Google aos cinco nós Google; se a instância separar credenciais por escopo, use uma para Search Console e outra para YouTube.

### Ativação do Google Ads Keyword Planner

Esta etapa é humana porque envolve aceite de termos, faturamento e consentimento OAuth. Ela não exige criar campanha nem ativar anúncios:

1. Criar a conta cliente Google Ads da TheBiker e concluir o cadastro com os dados de faturamento exigidos para liberar o Planejador de palavras-chave. Não publicar campanha.
2. Criar uma conta administradora Google Ads e vincular a conta cliente.
3. No API Center da conta administradora, solicitar o developer token descrevendo o uso interno: relatório semanal/mensal de pesquisa de mercado para planejamento editorial e comercial, sem gestão automatizada de campanhas.
4. No projeto Google Cloud, habilitar Google Ads API e configurar a tela de consentimento OAuth.
5. Autorizar uma conta com acesso à conta Ads usando exclusivamente o escopo `https://www.googleapis.com/auth/adwords` e gerar um refresh token dedicado.
6. Gravar os quatro secrets e três variables listados acima no environment `editorial-automation`; nunca inserir valores no repositório ou em logs.
7. Executar manualmente `TheBiker — Inteligência SEO e YouTube` com cadência `weekly` e confirmar `marketDemandStatus: available`, CSV `demanda-google-brasil` e a nova tabela na issue.

O método usado é somente `GenerateKeywordIdeas`; ele lê ideias e métricas históricas e não cria campanha, anúncio, orçamento ou cobrança publicitária. A conta deve permanecer sem campanhas ativas até autorização comercial explícita.

### GitHub

O workflow de produção utiliza apenas o `GITHUB_TOKEN` efêmero com leitura de conteúdo, escrita de issues e dispatch de Actions. No n8n local, use uma credencial limitada ao repositório `marcuscapobiangomed-ai/thebikerblog` e à escrita de issues.

## Instalação

1. Importe primeiro `thebiker-intelligence-errors.json` e mantenha desativado.
2. Importe `thebiker-seo-youtube-intelligence.json` e mantenha desativado.
3. No nó `Contexto e configuração`, confirme a propriedade do Search Console, URL pública, repositório, termos de ciclismo e portfólio permitido.
4. Confirme em `searchConsoleSites` os valores exatos das duas propriedades: a URL-prefix do blog e `sc-domain:thebikershop.com.br` para a loja.
5. Garanta que a credencial Google tenha acesso ao blog. O acesso à loja melhora o relatório, mas é opcional; sem autorização, o workflow mantém apenas as evidências públicas gratuitas da loja.
6. Vincule as credenciais Google e GitHub aos nós indicados.
7. Nas configurações do fluxo principal, selecione `TheBiker — Erros da inteligência editorial` como error workflow.
8. Execute manualmente e confira os contadores de propriedades GSC, consultas Brasil, impressões agregadas Brasil/global, oportunidades cruzadas, tendências, vídeos, artigos e briefings.
9. Confirme que a issue contém evidência e URL para cada pauta, payload estruturado e gate editorial.
10. Ative o tratador de erros e, por último, o fluxo principal.

## Como a inteligência vira pauta

1. Termos do Keyword Planner são ordenados por média mensal, tendência recente, intenção e aderência às sementes do portfólio. Concorrentes são excluídos da geração direta de pauta e todo CTA continua condicionado a inventário verificado.
2. Consultas brasileiras detalhadas do Search Console com ao menos cinco impressões recebem score por demanda, variação, CTR e posição. A faixa 4–20 recebe prioridade de otimização; agregados globais servem somente para diagnóstico.
3. Tendências gerais do Google Trends Brasil só entram quando correspondem ao vocabulário técnico do nicho. Elas recebem rótulo de descoberta e nunca são apresentadas como volume SEO absoluto.
4. O YouTube entra por vídeos recentes ordenados por visualizações e por `mostPopular` em esportes/BR. O score considera visualizações por dia e engajamento.
5. Apenas vídeos relacionados aos termos técnicos configurados permanecem.
6. O título e as tags do índice público indicam se a resposta já existe. Nesse caso, a ação é `refresh`; caso contrário, `new-content`.
7. Sinal que cita concorrente pode informar tendência de categoria, mas o briefing não autoriza promoção, link ou CTA para concorrente.
8. Cada briefing registra evidência, URL, ângulo, página-alvo, score e gates de publicação.
9. A issue semanal permanece como relatório. A issue mensal é reconhecida por `[INTEL] monthly-` e renova automaticamente a campanha rolante.
10. O renovador preserva itens futuros já em produção ou agendados, remove dias publicados, substitui bloqueios e completa exatamente 30 datas consecutivas.
11. Briefings `refresh` não viram artigos duplicados: são gravados em `_data/editorial-refresh-queue.json` para o fluxo de atualização do acervo.
12. A geração final continua no pipeline GitHub/IA protegido; revisão humana passa a ser exigida somente para exceções bloqueadas.

## Revisão mensal obrigatória

- atualizar páginas em posições 4–20 antes de abrir clusters sem sinal;
- revisar páginas com mais de 90 dias ou oportunidade de busca;
- confirmar canibalização por intenção e consolidar páginas sobrepostas;
- revalidar produto, URL, preço, estoque, especificação e imagem;
- comparar Search Console, GA4, Clarity e conversões assistidas;
- registrar o que foi atualizado, unido, removido ou mantido.

## Falhas e recuperação

- 401/403 Google: renovar OAuth e confirmar acesso à propriedade/API.
- Keyword Planner `not_configured`: concluir conta Ads, developer token, OAuth `adwords` e IDs; manter a seção vazia até ativação real.
- Keyword Planner `unavailable`: registrar request ID sanitizado, conferir nível do developer token, vínculo manager/cliente e versão da API; não substituir volume com Trends ou Search Console.
- quota do YouTube: registrar `unavailable`, usar os sinais medidos restantes e reduzir frequência ou consultas; YouTube é complementar e nunca preenche SEO medido.
- resposta vazia: manter o relatório com zero sinal e investigar configuração, sem inventar tendência.
- feed Trends indisponível: registrar a indisponibilidade e continuar com Search Console e YouTube; Trends é fonte complementar.
- Search Console da loja com 403: registrar `not_authorized`, manter o blog e executar PageSpeed público; nunca apresentar a estimativa como consulta real.
- PageSpeed indisponível ou limitado por quota: registrar a falha e continuar; a fonte é complementar e não substitui Search Console.
- 429/timeout em fonte complementar: registrar indisponibilidade e continuar. Em Search Console obrigatório do blog, manter falha fechada.
- erro GitHub: o relatório permanece nos dados da execução; repetir depois de corrigir a credencial.
- qualquer falha: nenhum post é aprovado; o incidente fica disponível para revisão e uma pauta bloqueada pode ser substituída por reserva na renovação seguinte.
- timeout, 429 ou falha transitória: `campaign:recover` libera uma tentativa adicional; na reincidência, ou em erro permanente, preserva a exceção no ledger e ocupa a mesma data com uma pauta-reserva.

## Métricas do próprio fluxo

- sucesso semanal e mensal;
- duração e taxa de falha por fonte;
- quantidade de sinais, pautas, refreshes e pautas aprovadas;
- tempo entre sinal, briefing, aprovação, publicação e primeira impressão;
- participação de pautas que chegam ao top 3, ganham CTR ou geram clique para produto verificado.
