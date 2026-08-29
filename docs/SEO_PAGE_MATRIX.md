# Matriz de paginas SEO da TheBiker

## Regra principal

Os formatos abaixo classificam intencao de busca; eles nao autorizam criacao de paginas em massa. Toda nova pagina programatica precisa de demanda medida no Search Console ou Keyword Planner, diferenca substancial em relacao ao acervo e produtos verificados quando houver recomendacao comercial.

| Intencao | Aplicacao | Prioridade |
|---|---|---:|
| `comparison` | Comparacoes internas do portfolio com criterios equivalentes | Muito alta |
| `constraint` | Faixa de preco, componente ou requisito binario real | Muito alta |
| `commercial` | Preco, custo-beneficio e onde comprar com observacao datada | Muito alta |
| `use-case` | XC, longa distancia, primeira prova ou bikepacking | Alta |
| `problem` | Diagnostico e solucao de falhas tecnicas | Alta |
| `alternative` | Alternativas reais a um modelo, sem promover concorrente bloqueado | Media |
| `feature` | Di2, AXS, carbono HMX ou outra diferenca decisiva | Media |

Integracoes de SaaS e segmentacoes cosmeticas ficam fora do escopo. Quando uma consulta ja estiver coberta, a decisao padrao e atualizar a URL existente.

## Frontmatter para paginas programaticas

Use `seo_page` somente quando a pagina nascer de uma variacao SEO repetivel. Artigos editoriais comuns nao precisam desse bloco.

```yaml
seo_page:
  type: comparison
  primary_query: "spark rc team vs expert"
  demand:
    source: search-console
    measured_at: 2026-08-13
    value: 42
  differentiation:
    - "comparacao de suspensao com os mesmos criterios"
    - "preco e estoque observados na mesma data"
    - "veredito separado por perfil de uso"
  unique_evidence:
    - "tabela produzida com o catalogo verificado"
    - "checagem comercial datada"
  verified_product_ids:
    - scott-spark-rc-team-2027-thebiker-br
    - scott-spark-rc-expert-2027-thebiker-br
```

Para `constraint`, acrescente `constraint` com o filtro binario ou numerico exato. Comparacoes e alternativas exigem ao menos dois IDs de produto; preco, restricao, caso de uso e feature exigem ao menos um.

## Gate contra doorway pages

`npm run audit:seo` reprova uma pagina com `seo_page` quando:

- a demanda nao foi medida ou nao possui data e valor;
- faltam tres diferencas substantivas e duas evidencias proprias;
- faltam produtos verificados;
- o conteudo visivel tem menos de 700 palavras;
- duas paginas programaticas publicadas atingem 78% de similaridade lexical.

O gate nao prova qualidade por si so. Fontes primarias, metodo, atualizacao de preco e estoque e revisao editorial continuam obrigatorios.
