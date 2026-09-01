# 🚴 TheBiker Blog

**Canal editorial oficial da TheBiker para ciclistas experientes: análises técnicas, comparativos, lançamentos e cobertura de competições.**

## Pipeline editorial automatizado

O blog publica automaticamente com cadência 3x/dia (06:05, 10:05, 14:05 BRT) quando `AUTOMATION_ENABLED=true`.

```
📊 Campanha de 30 dias (bot/editorial-campaign.json)
        ↓
🔄 Automação editorial (3x/dia, GitHub Actions `cron-post.yml`)
        ├─ 🔍 Pesquisa fundamentada (Groq/DeepSeek)
        ├─ 🤖 Geração (IA redige, revisa, audita)
        ├─ ✅ Gates de qualidade:
        │  ├─ Extensão mínima de palavras
        │  ├─ Proibição de linguagem publicitária
        │  ├─ Exigência de fonte rastreável
        │  ├─ Integridade de claims (IA audita)
        │  └─ Coerência imagem ↔ produto
        ├─ 🖼️ Imagem oficial + manifesto
        └─ 📅 Agendamento (status: scheduled)
        ↓
🎯 Publicação diária ao meio-dia (12:00 BRT, `publish-daily.yml`)
        ├─ Promove pauta do dia para _posts/
        ├─ Build Jekyll automático
        └─ Deploy em GitHub Pages
        ↓
🔐 Validação pós-deploy (healthcheck de imagens)
```

### Garantias de qualidade

Os artigos passam por **5 gates automáticos** antes de serem publicados:

1. **Extensão mínima:** review 900–1600, comparativo 1000–1800, lançamento 650–1200 palavras
2. **Linguagem editorial:** proibição de termos publicitários ("revolucionário", "imbatível", etc.)
3. **Conteúdo documental:** análises são explicitamente identificadas como pesquisa, não testes
4. **Integridade de claims:** toda alegação técnica deve aparecer nas fontes confirmadas
5. **Imagem coerente:** marca/produto da imagem deve corresponder ao artigo
6. **Revisão final:** nota mínima 90/100 da IA auditora antes de publicação

**Transparência:** artigos contam com `## Fontes` enumeradas e JSON-LD estruturado para máquinas (Googlebot, Perplexity, etc.).

### Estrutura do conteúdo

```text
docs/
├── EDITORIAL_GUIDE.md      # Manual editorial completo
├── IMAGE_GUIDE.md           # Guia de imagens
├── SEO_GUIDE.md             # Diretrizes de SEO
└── REVIEW_CHECKLIST.md      # Checklist de revisão

content/
└── research/                # Fichas de pesquisa (JSON validado)

_posts/
└── drafts/                  # Rascunhos aguardando revisão

assets/img/posts/<slug>/
├── image-manifest.json      # Metadados das imagens
├── hero.jpg                 # Imagem principal
└── thumb-480.webp           # Thumbnail para cards e listas
```

## Operação manual

Para intervir na campanha automatizada ou disparar ações manuais:

```bash
cd bot

# Recomposição de buffer (20 pautas mínimo agendadas)
npm run campaign:replenish -- --target-buffer=20

# Auditoria final de qualidade
npm run campaign:audit-buffer

# Reparo de artigos bloqueados
npm run campaign:repair-buffer

# Renovação manual de 30 dias (quando inteligência detecta necessidade)
npm run campaign:renew
```

## Scripts de validação

Instale primeiro as dependências do bot e execute os comandos abaixo a partir da raiz do repositório:

```bash
npm run install:bot         # Instala versões travadas em bot/package-lock.json
npm run validate:research   # Valida fichas de pesquisa
npm run validate:posts      # Valida frontmatter dos posts
npm run validate:images     # Valida arquivos de imagem referenciados pelos posts
npm run validate:manifests  # Valida manifests editoriais de imagem
npm run validate:data       # Valida produtos, preços, geometrias e fontes
npm run check:claims        # Verifica alegações proibidas
npm run test                # Testa schemas + generator
npm run lint                # Verifica sintaxe JS
npm run build:jekyll        # Build do site Jekyll
npm run validate            # Executa toda a suíte Node (não inclui o build Jekyll)
```

## Setup

```bash
cd bot
cp .env.example .env
# Configure DEEPSEEK_API_KEY, GITHUB_TOKEN, GROQ_API_KEY
npm start
```

## Variáveis de ambiente

| Variável | Descrição | Obrigatório |
|---|---|---|
| `AUTOMATION_ENABLED` | Ativa pipeline automática (3x/dia, publicação diária) | Sim (`true`/`false`) |
| `DEEPSEEK_API_KEY` | Chave DeepSeek (geração de artigos premium) | Sim |
| `DEEPSEEK_PRO_MODEL` | Modelo Pro (padrão `deepseek-v4-pro`) | Não |
| `DEEPSEEK_FLASH_MODEL` | Modelo Flash (padrão `deepseek-v4-flash`) | Não |
| `GROQ_API_KEY` | Chave Groq (pesquisa + fallback) | Sim |
| `GITHUB_TOKEN` | Token GitHub para commits/push | Sim (em CI) |
| `AI_DEEPSEEK_SCORE_THRESHOLD` | Nota mínima para bypass premium (padrão 90) | Não |
| `AI_FINAL_SCORE_THRESHOLD` | Nota mínima final para publicação (padrão 90) | Não |
| `EDITORIAL_MIN_SAFE_BUFFER` | Mínimo de pautas agendadas antes de falhar (padrão 1) | Não |

## Requisitos

- Node.js 18+
- Conta GitHub com acesso ao repositório
- DeepSeek API key (para geração)
- Groq API key (para pesquisa fundamentada)
- GitHub Actions habilitado (para automação)
