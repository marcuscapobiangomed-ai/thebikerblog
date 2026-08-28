# 🚴 TheBiker Blog

**Canal editorial oficial da TheBiker para ciclistas experientes: análises técnicas, comparativos, lançamentos e cobertura de competições.**

## Pipeline editorial

```
📱 WhatsApp (/novo <tema>)
        ↓
📊 Ficha de pesquisa (content/research/<slug>.json)
        ↓
🤖 IA gera rascunho estruturado (JSON validado por schema)
        ↓
🖼️ Plano de imagens (assets/img/posts/<slug>/image-manifest.json)
        ↓
✅ Validação automática (research, claims, images, frontmatter)
✅ Contrato AEO/GEO com resposta direta, fontes, FAQ visível e JSON-LD estático
        ↓
🤖 Gate editorial automatizado (score, bloqueadores, recibo e citabilidade)
        ↓
🚀 Agendamento → publicação automática
```

### Transparência

- Os artigos são produzidos e validados **por um fluxo de inteligência artificial com gates determinísticos**
- **Nenhum conteúdo é publicado sem passar pelo gate editorial automatizado**
- **Análises documentais** são explicitamente identificadas como tal — não são testes pessoais
- **Especificações técnicas exigem fonte** (fabricante, distribuidor, loja)
- Todo artigo possui `status: draft` até o gate emitir recibo e o publicador alterar para `status: published`

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
└── drafts/                  # Rascunhos aguardando validação automática

assets/img/posts/<slug>/
├── image-manifest.json      # Metadados das imagens
├── hero.jpg                 # Imagem principal
└── thumb-480.webp           # Thumbnail para cards e listas
```

## Integração com WhatsApp

A integração está desativada e suas dependências de navegador não fazem parte da instalação padrão. Use `npm run post:manual` ou `npm run batch` dentro de `bot/` para operar o pipeline editorial. A reativação exige uma revisão de segurança explícita.

Comandos históricos do adaptador:

| Comando | Ação |
|---|---|
| `/novo <tema>` | Registrar novo tema e iniciar pipeline |
| `/status <slug>` | Verificar progresso |
| `/aprovar <slug>` | Consulta informativa; não libera publicação manual |
| `/cancelar <slug>` | Cancelar tema |
| `/ajuda` | Mostrar ajuda |

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
# Configure DEEPSEEK_API_KEY (preferencial), GEMINI_API_KEY (fallback), GITHUB_TOKEN, etc.
npm start
```

## Requisitos

- Node.js 18+
- Conta GitHub
- DeepSeek API key
- Google Gemini API key (fallback) (https://aistudio.google.com/apikey)
- WhatsApp no celular
