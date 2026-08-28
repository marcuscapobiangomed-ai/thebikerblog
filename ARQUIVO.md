# TheBikerBlog — Plano de Execução (Fase 8)

## Estado atual — 19/07/2026

| Métrica | Valor |
|---------|-------|
| Progresso geral | 65% |
| Bicicletas cadastradas | 30 |
| Registros de preço | 30 (100% com URLs) |
| Fontes cadastradas | 23 |
| Total de posts | 52 (36 ativos + 16 arquivados) |
| Posts auditados | 100% |
| Pipeline homologado | ✅ 10/10 testes |

## Estrutura do projeto

```
medblog-full/
├── _posts/                  # Artigos do blog (36 ativos)
│   ├── archived/            # Posts originais (16)
│   ├── drafts/              # Rascunhos gerados
│   └── scripts/             # Validador de frontmatter
├── _includes/               # Componentes Jekyll
├── _layouts/                # Layouts (post, product/bike)
├── _config.yml              # Configuração Jekyll
├── _redirects.yml           # Redirecionamentos 301
├── .github/workflows/       # CI/CD
│   ├── pr-validate.yml      # Valida em PR (schemas, posts, build)
│   ├── deploy.yml           # Deploy em push na main
│   └── cron-post.yml        # Cron desativado (só manual)
├── data/
│   ├── products/bikes/      # 30 JSONs de bicicletas
│   ├── prices/              # 30 JSONs de preços
│   ├── geometries/          # 30 JSONs de geometria
│   ├── sources/sources.json # 23 fontes
│   ├── brands/brands.json   # 8 marcas
│   ├── taxonomies/          # Taxonomia padronizada
│   └── schemas/             # Validadores JS
├── content/research/        # Fichas de pesquisa
├── bot/src/                 # Bot v3 (WhatsApp + Gemini + GitHub)
│   ├── index.js             # Pipeline editorial
│   ├── cron_post.js         # (desativado)
│   ├── publisher.js         # Publica via PR
│   ├── input-validator.js   # Sanitização
│   └── schemas/             # Schemas de artigo
├── project/90-days/         # Quadro de execução
│   ├── board.md             # Kanban
│   ├── week-01-02.md        # Tarefas semanas 1-2
│   ├── status-report.md     # Relatório automático
│   └── templates/           # Template de tarefa
├── scripts/
│   ├── pipeline-test.ps1    # Teste completo (10 passos)
│   ├── fix-placeholders.ps1 # Corrige campos vazios
│   └── generate-status-report.js # Relatório automático
├── docs/operations/
│   └── branch-protection.md # Regras da main
├── SECURITY.md              # Política de segurança
└── ARQUIVO.md               # Este arquivo
```

## Ordens de execução

### Semanas 1-2: Segurança e pipeline editorial ✅ (78%)
- [x] GitHub Actions valida PR (schemas, frontmatter, autoria, build)
- [x] Cron desativado (só execução manual)
- [x] Input validator (WhatsApp, sanitização, prompt injection)
- [x] Autoria fictícia removida (46 arquivos)
- [x] Placeholders corrigidos (reviewed_by, image_credit, brand)
- [x] Pipeline testado (10/10 passos)
- [ ] Branch protection ativada no GitHub (documentação pronta)
- [ ] price_min/price_max: 0 pendentes (artigos sem produto específico)

### Semanas 3-4: Auditoria ✅ (100%)
- [x] 32/32 artigos auditados
- [x] decisions.csv com decisão por artigo
- [x] 16 posts críticos reescritos
- [x] Redirecionamentos configurados
- [x] Frontmatter de 5 posts de dados corrigido

### Semanas 5-6: Base de produtos ✅ (100%)
- [x] 30 bicicletas em data/products/bikes/
- [x] 30 registros de preço em data/prices/
- [x] 30 geometrias em data/geometries/
- [x] 23 fontes em data/sources/sources.json
- [x] 100% com fonte primária
- [x] 100% com data de atualização
- [x] Schema validation aprovado

### Semanas 7-8: Páginas de produto ⏳ (0%)
- [ ] Gerar /bikes/<marca>/<modelo>/ de cada bike JSON
- [ ] Incluir ficha técnica, preço, imagem, fontes
- [ ] 10 páginas publicadas

### Semanas 9-10: Comparador ⏳ (0%)
- [ ] Comparar 2 bicicletas lado a lado
- [ ] Preço, peso, quadro, grupo, freios, rodas
- [ ] URL compartilhável
- [ ] Responsivo

### Semanas 11-12: Analytics e monetização ⏳ (0%)
- [ ] Eventos: product_view, compare, affiliate_click
- [ ] Links afiliados com rel="sponsored"
- [ ] Painel mínimo funcional

## Como executar

```bash
# 1. Rodar validação completa
node data/schemas/validate-all.js
node _posts/scripts/validate-posts.js

# 2. Pipeline test
powershell -File scripts/pipeline-test.ps1

# 3. Gerar status report
node scripts/generate-status-report.js

# 4. Corrigir placeholders (se necessário)
powershell -File scripts/fix-placeholders.ps1

# 5. Gerar páginas de produto
node scripts/generate-pages.js

# 6. Para executar o bot (WhatsApp + IA)
# cd bot && CRON_ENABLED=false node src/index.js
```

## Regras de segurança

1. **Nada publicado sem gates editoriais** — publicação direta sem recibo bloqueada
2. **Nada sem validação** — CI falha se schemas ou frontmatter estiverem inválidos
3. **Nenhum token em URL** — todos via header Authorization
4. **Nenhuma execução automática** — cron desativado
5. **Nenhum autor fictício** — "Equipe TheBikerBlog" é o autor padrão

## Contato

Para ajustes no plano, abra issue ou PR em https://github.com/marcuscapobiangomed-ai/thebikerblog
