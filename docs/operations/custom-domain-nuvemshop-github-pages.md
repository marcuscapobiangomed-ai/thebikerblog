# Domínio oficial: TheBiker Insights no GitHub Pages

## Arquitetura aprovada

- A loja continua integralmente na Nuvemshop em `thebikershop.com.br` e `www.thebikershop.com.br`.
- O canal editorial é publicado pelo GitHub Pages em `blog.thebiker.com.br`.
- Nenhum registro do domínio raiz, de `www`, e-mail, checkout ou Nuvemshop pode ser alterado por este procedimento.
- A entrada nova e isolada é apenas o host `blog` no domínio `thebiker.com.br`.

## Estado verificado em 11 de agosto de 2026

- `blog.thebiker.com.br` possui CNAME para `marcuscapobiangomed-ai.github.io`.
- O GitHub Pages reconhece o domínio, mantém HTTPS obrigatório e informa certificado aprovado.
- A homepage pública responde HTTP 200 em HTTPS.
- O repositório mantém `CNAME`, URL canônica e artefatos de analytics vinculados ao mesmo host.

## Invariantes de segurança

Antes e depois da ativação, registrar e comparar:

1. Respostas DNS A/AAAA do domínio raiz.
2. CNAME e resolução de `www`.
3. Resposta HTTPS da homepage da loja.
4. Abertura de uma categoria e de um produto público.
5. Ausência de mudanças no painel, tema, checkout, produtos, e-mails e integrações da Nuvemshop.

Qualquer diferença na loja interrompe o corte. Timeout, erro ou resposta inconclusiva não contam como aprovação.

## Procedimento controlado

1. Confirmar que `blog.thebiker.com.br` não possui A, AAAA ou CNAME.
2. Em **GitHub > Settings > Pages**, cadastrar `blog.thebiker.com.br` como custom domain.
3. No provedor DNS, criar somente:

   ```text
   Tipo: CNAME
   Nome/host: blog
   Destino: marcuscapobiangomed-ai.github.io
   ```

   O destino não contém protocolo, barra nem `/thebikerblog`.

4. Não editar nem remover os registros `@`, `www`, MX, TXT ou qualquer entrada existente.
5. Publicar o candidato que define:

   ```yaml
   url: "https://blog.thebiker.com.br"
   baseurl: ""
   ```

6. Aguardar DNS e certificado TLS. Só então ativar **Enforce HTTPS**.
7. Validar homepage, artigos, imagens, canonical, Open Graph, `sitemap.xml`, `feed.xml`, `robots.txt`, `llms.txt` e `/api/content-index.json`.
8. Repetir os testes públicos da loja e comparar com a linha de base.
9. Configurar Search Console e Bing somente após o novo host estar estável.

## Gate de aceite

- `https://blog.thebiker.com.br/` responde em HTTPS sem alerta.
- Nenhum ativo ou link interno depende de `/thebikerblog`.
- Canonical, Open Graph, sitemap e artefatos de descoberta usam apenas o novo host.
- Domínio raiz e `www` continuam resolvendo para a infraestrutura anterior da loja.
- Homepage, categoria e produto da loja continuam acessíveis.
- Validações Node, build Jekyll e gates do artefato público passam no mesmo commit.
- Nenhuma configuração da Nuvemshop foi alterada.

## Reversão

Em caso de falha, remover somente o CNAME `blog` de `thebiker.com.br` e o custom domain do GitHub Pages. Não tocar em `@`, `www`, MX, TXT ou registros da Nuvemshop. Restaurar `url` e `baseurl` em um novo commit validado.

## Referências

- [GitHub Pages: gerenciar domínio personalizado](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [GitHub Pages: verificar domínio](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
