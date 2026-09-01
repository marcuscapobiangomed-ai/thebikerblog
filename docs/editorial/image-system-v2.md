# Sistema editorial de imagens TheBiker v2

## Princípio

Cada imagem precisa cumprir uma função editorial verificável. Imagem de produto prova construção, montagem ou detalhe; gráfico explica dados; fotografia de corrida registra um fato; imagem conceitual cria atmosfera sem fingir realidade.

Capas genéricas são permitidas somente em rascunhos. Nenhum post novo pode ser publicado apenas com fallback.

## Matriz por tipo de conteúdo

| Conteúdo | Hero preferencial | Imagens internas mínimas | IA generativa |
|---|---|---:|---|
| Review | Foto oficial ou própria do produto exato | 3: lateral, detalhe técnico e componente decisivo | Proibida para representar o produto |
| Comparativo | Fotos oficiais equivalentes ou composição aprovada | 3: produtos, geometria e matriz visual | Apenas fundo ou gráfico sem produto fictício |
| Lançamento | Material oficial da marca e da versão anunciada | 2: mudança técnica e geração anterior | Proibida para representar lançamento |
| Prévia de corrida | Foto licenciada da prova ou gráfico do percurso | 2: altimetria e setores decisivos | Proibida como fotografia do evento |
| Pós-corrida | Foto licenciada ou gráfico de resultado/tática | 2: movimento decisivo e classificação | Proibida como registro da corrida |
| Guia técnico | Foto própria, diagrama ou ilustração técnica | 2: mecanismo e aplicação | Permitida somente quando conceitual e identificada |
| Guia de compra | Produtos reais do portfólio | 2: critérios e diferenças | Proibida para representar produto específico |

## Classes de origem

- `official-product-photo`: fabricante, distribuidor ou TheBiker; produto e versão exatos.
- `own-photo`: produção própria, com responsável e data.
- `licensed-editorial-photo`: agência, organizador ou fotógrafo; licença comercial registrada.
- `data-graphic`: gráfico criado pela equipe a partir de dados citados.
- `technical-diagram`: diagrama próprio ou autorizado.
- `ai-editorial-concept`: conceito sem produto, atleta, corrida ou acontecimento real identificável.
- `system-fallback`: capa temporária, exclusiva para rascunhos.

## Arquivos obrigatórios

Cada post novo usa:

- `hero-1600.webp`: 1600×900, até 300 KB.
- `hero-800.webp`: 800×450, até 160 KB.
- `card-640.webp`: 640×360, até 100 KB.
- `image-manifest.json`: manifesto v2 aprovado.

AVIF pode ser adicionado como formato preferencial, mantendo WebP como fallback. Todos os formatos usam 16:9 para preservar o enquadramento entre página, cards e compartilhamento.

## Regras visuais

- sem texto embutido em fotografias;
- gráficos podem conter texto, fonte e data;
- foco visual preservado no centro seguro de 70% da imagem;
- sem logotipo inventado, bicicleta híbrida ou componente tecnicamente impossível;
- sem concorrente como foco visual;
- alt text descreve o que importa no contexto, sem repetir o título;
- legenda explica por que a imagem está no artigo;
- crédito não substitui licença.

## Manifesto e aprovação

O manifesto registra origem, URL, data de obtenção, licença, evidência, crédito, marcas e produtos retratados, uso de IA, função editorial, ponto focal e responsável pela aprovação.

Publicação é bloqueada quando:

1. o manifesto não é v2;
2. a imagem usa fallback;
3. dimensões ou proporção estão erradas;
4. arquivos ou variantes estão ausentes;
5. licença ou evidência está incompleta;
6. produto retratado não é o produto declarado;
7. IA tenta representar produto, atleta ou evento real;
8. há marca concorrente em destaque;
9. aprovação automatizada ou recibo do gate está ausente.

## Direção visual dos fallbacks

Os fallbacks usam grafite, preto, cinza metálico e amarelo discreto; iluminação técnica; composição limpa; ausência de marcas e texto. Eles devem parecer capas de uma publicação de alta performance, mas sempre carregar status `draft-only`.
