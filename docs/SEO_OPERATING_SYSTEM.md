# TheBiker SEO Operating System

## Ambição e regra de decisão

O objetivo é construir a maior autoridade digital de ciclismo técnico em português e, depois, expandir por idioma. “Maior” deve ser medido por demanda orgânica qualificada, citações, links editoriais, audiência recorrente e receita assistida — não por volume bruto de textos.

Cada publicação precisa responder a uma demanda real melhor do que o resultado atual: mais evidência própria, mais precisão, melhor estrutura e uma atualização verificável. Conteúdo em escala que apenas reescreve páginas existentes não entra no índice.

## Arquitetura temática

1. **Pilares permanentes:** ajuste e biomecânica, suspensão, transmissão, rodas e pneus, manutenção avançada, treinamento e tecnologia.
2. **Clusters de produto:** uma página canônica por modelo verificado, ligada a guias de ajuste, manutenção, comparação interna e solução de problemas.
3. **Atualidade com vida útil:** lançamentos e competições devem explicar impacto técnico; não publicar notícia commodity sem análise própria.
4. **Ferramentas:** calculadoras e tabelas precisam mostrar metodologia, unidade, limites e referências, além de apontar para os guias correspondentes.

O primeiro mercado é pt-BR. Inglês e espanhol só entram como conteúdo realmente localizado em subdiretórios próprios, com validação automatizada nativa e `hreflang`; tradução automática em massa fica bloqueada.

## Contrato de uma página excelente

Todo artigo indexável deve conter:

- uma resposta direta no primeiro bloco e uma promessa coerente com título e descrição;
- autor/equipe identificável, data de publicação e data de atualização;
- método declarado: teste de campo, pesquisa documental, análise de dados ou combinação;
- evidência original quando possível: medições, fotos próprias, tabelas, protocolos e limitações;
- fontes primárias próximas das afirmações técnicas;
- cada seção factual preserva a pergunta respondida, a afirmação, o `source_id` e um trecho de evidência da fonte;
- imagens úteis com dimensões, texto alternativo e licença/crédito;
- links internos para o pilar, a entidade/produto e o próximo passo do leitor;
- CTA comercial apenas para item exato com disponibilidade verificada na TheBiker;
- dados estruturados coerentes com o conteúdo visível;
- revisão de atualização para preço, estoque, especificação e calendário.

IA pode apoiar pesquisa e estrutura, mas o pipeline só aprova automaticamente quando confirma fatos, método declarado, evidência e limites; falhas retornam para correção ou nova pesquisa.

## Distribuição para busca e assistentes de IA

- HTML semântico, links rastreáveis, URL canônica, sitemap enxuto e feed completo formam a fonte principal.
- `robots.txt` permite explicitamente bots de pesquisa do Google, Bing, OpenAI, Anthropic e Perplexity.
- `/llms.txt` oferece orientação concisa e `/api/content-index.json` entrega o índice editorial em formato legível por máquina.
- Schema.org identifica organização, artigo, produto, breadcrumbs e FAQ somente quando o conteúdo correspondente estiver visível.
- Search Console e Bing Webmaster Tools recebem o sitemap; IndexNow entra após adoção de domínio próprio, evitando vincular a chave ao host compartilhado do GitHub Pages.
- Referências externas são conquistadas com estudos originais, dados citáveis, ferramentas e cobertura técnica que outras publicações queiram referenciar.

Nenhum arquivo especial garante citação por uma IA. A condição durável é permitir rastreamento e publicar respostas originais, claras, estáveis e corroboradas.

### Contratos implantados

- `direct_answer` é obrigatório e aparece como conteúdo visível no início do artigo;
- FAQ estruturada é opcional e só gera `FAQPage` quando pergunta e resposta também aparecem na página;
- o JSON-LD editorial é renderizado estaticamente, com organização, site, artigo, breadcrumbs, fontes e FAQ aplicável;
- `/llms.txt` funciona como mapa curto de prioridades recentes, limitado a 20 artigos;
- `/api/content-index.json` é o catálogo completo e escalável, com resposta direta, fontes e estado de prontidão para citação;
- o artefato Jekyll compilado é validado antes do deploy, incluindo JSON, JSON-LD e coerência entre FAQ visível e estruturada;
- artigos novos usam `editorial_format: full-article-v2`, com contrato de evidência por seção e links internos contextuais quando houver destino relevante;
- `ai_reviewed_by` identifica a automação; `reviewed_by` permanece opcional e não é usado como bloqueio;
- referências conhecidas de ChatGPT, Perplexity, Claude, Gemini, Copilot, Meta AI e Poe são classificadas sem armazenar a consulta do usuário.

### Política de rastreamento

Bots de busca e recuperação usados para descoberta e respostas podem acessar o conteúdo público. Crawlers identificados como coleta para possível treinamento, como `GPTBot` e `ClaudeBot`, ficam bloqueados. `Google-Extended` permanece separado do Google Search e pode ser governado sem alterar a indexação tradicional. A política deve ser reavaliada quando os fornecedores mudarem seus agentes ou finalidades.

## Cadência editorial

### Semanal

- 1 artigo-pilar ou estudo original;
- 2 respostas de cluster derivadas de dúvidas reais;
- atualização das páginas afetadas por preço, estoque ou especificação;
- revisão de links internos entre novas páginas e acervo.

### Mensal

- consolidar consultas do Search Console por intenção, não apenas palavra-chave;
- atualizar páginas na faixa de posições 4–20 antes de abrir clusters novos;
- comparar páginas descobertas, rastreadas, indexadas e com tráfego;
- revisar referências recebidas, citações e tráfego de assistentes;
- podar, unir ou redirecionar páginas sobrepostas.

## Métricas de controle

- páginas válidas indexadas / páginas indexáveis;
- cliques orgânicos, impressões, CTR e posição por cluster;
- participação de consultas sem marca e presença no top 3;
- domínios editoriais que referenciam estudos e ferramentas;
- conversões assistidas para produtos verificados;
- tráfego identificado por `utm_source=chatgpt.com` e outros referenciadores de IA;
- Core Web Vitals por template;
- idade mediana desde a última revisão de conteúdo sensível ao tempo.

## Sequência de 90 dias

### Dias 0–30 — fundação

- limpar o índice público, corrigir metadados e validar dados estruturados;
- verificar Search Console/Bing, enviar sitemap e estabelecer o painel-base;
- escolher e configurar um domínio próprio da marca;
- mapear 3 pilares e 30 demandas, canibalização e lacunas de evidência.

### Dias 31–60 — autoridade

- publicar estudos e ferramentas com dados próprios;
- formar clusters profundos em torno de dúvidas e produtos verificados;
- iniciar relacionamento editorial com fabricantes, atletas, oficinas e organizações para fontes e referências legítimas.

### Dias 61–90 — escala controlada

- atualizar vencedores, consolidar páginas fracas e expandir apenas clusters com sinal;
- automatizar briefing, checagens, correções e distribuição, bloqueando apenas falhas que o próprio pipeline não consegue resolver;
- decidir internacionalização com base em demanda e capacidade de validação nativa automatizada.

## Gate antes de publicar

`npm run audit:seo` e `npm run audit:citability` devem passar junto ao gate geral. O primeiro verifica a superfície técnica; o segundo simula blocos de recuperação de aproximadamente 250–400 tokens e aponta dependência de contexto, entidade implícita e afirmação quantificada sem evidência local. É um preflight heurístico, não uma reprodução do algoritmo de Google ou de um chatbot. O gate automatizado confirma intenção, precisão, originalidade, evidência próxima das afirmações, links internos, representação fiel do método e valor para um ciclista experiente. O comprimento é um limite operacional, não um objetivo editorial.
