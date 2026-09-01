# Checklist de Revisão — TheBikerBlog

## Artigo

- [ ] Título claro e informativo
- [ ] Meta description factual, normalmente entre 90–170 caracteres
- [ ] Tags usam o vocabulário controlado
- [ ] Status definido (`draft`, `reviewed` ou `published`)

## Conteúdo

- [ ] Nenhuma alegação não verificada ("testamos" em desk research)
- [ ] Preços têm data e fonte
- [ ] Especificações citam modelo, ano, mercado
- [ ] Comparativos usam fontes equivalentes
- [ ] Nenhuma informação inventada
- [ ] Cada seção factual responde uma pergunta explícita e nomeia a entidade principal
- [ ] Cada número, comparação ou recomendação tem fonte e trecho de evidência no mesmo contexto
- [ ] Pronomes e referências não dependem de outro bloco para serem compreendidos
- [ ] Há links internos contextuais para o pilar, entidade ou próximo passo quando aplicável
- [ ] `npm run audit:citability` foi executado; blocos fracos foram corrigidos ou aceitos com motivo editorial

## Imagens

- [ ] image-manifest.json presente
- [ ] Hero image 1600×900 WebP < 200 KB
- [ ] Alt text preenchido e descritivo
- [ ] Crédito e licença registrados

## Fontes

- [ ] Ficha de pesquisa completa
- [ ] Pelo menos uma fonte oficial (fabricante ou distribuidor)
- [ ] Preço com URL e data de consulta
- [ ] `source_id` usado por cada afirmação corresponde a uma fonte existente

## Técnico

- [ ] Build Jekyll passa sem erros
- [ ] Frontmatter YAML válido
- [ ] Links funcionando
- [ ] Nenhum placeholder (logo.svg) como imagem principal
- [ ] `ai_reviewed_by: "TheBiker AI Editorial Gate"` e recibo editorial com hash estão presentes
