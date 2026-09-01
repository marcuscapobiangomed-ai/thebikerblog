# Guia de SEO — TheBikerBlog

## Meta description

- Escrever uma descrição factual e específica, normalmente entre 90–170 caracteres
- Explicar a decisão que a página ajuda o leitor a tomar, sem repetir palavras-chave artificialmente
- Não exigir CTA: a descrição deve representar fielmente o conteúdo da página

## Estrutura de headings

- `H1`: apenas o título do artigo
- `H2`: seções principais (Ficha Técnica, Veredito, etc.)
- `H3`: subseções

## Schema.org

- **Article**: presente em todos os posts (via `head.html`)
- **FAQPage**: presente quando há seção de perguntas frequentes
- **BreadcrumbList**: presente em todos os posts

## Imagens

- Alt text descreve a imagem para quem não a vê; não é um campo para acumular palavras-chave
- WebP como formato padrão
- Nome de arquivo descritivo (ex: `scott-addict-20-2026-lateral.webp`)

## Links

- Internos: usar `site.baseurl` + caminho relativo
- Internos: priorizar links contextuais para o pilar, entidade, problema relacionado ou próximo passo
- Externos: `rel="noopener noreferrer"` + `target="_blank"`
- Afiliados: `rel="sponsored noopener noreferrer"`
