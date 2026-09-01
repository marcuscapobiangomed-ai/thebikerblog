# Histórico — TheBikerBlog (Fases 1–8)

**Nota:** Este arquivo documenta as fases anteriores do projeto (até 19/07/2026). A versão atual (2026-08+) implementa um pipeline de publicação automática descrito em [README.md](README.md) e [SECURITY.md](SECURITY.md).

---

## Evolução do projeto

### Fase 1–3 (2025)
- Estrutura de blog Jekyll básica
- Catálogo de bicicletas com 30 modelos
- Posts manuais com frontmatter estruturado

### Fase 4–7 (2025–2026)
- Bot de WhatsApp integrado (pesquisa → rascunho → PR → publicação manual)
- Validação em CI (schemas, builds Jekyll, imagens)
- Documentação e auditoria de qualidade

### Fase 8 (19/07/2026)
- Pipeline de WhatsApp com publicação via PR
- Cron desativado por padrão
- 52 posts publicados (36 ativos)

### Fase 9+ (20/07–25/08/2026)
- Migração para **pipeline automático** (GitHub Actions)
- Pesquisa + geração + publicação totalmente automática 3x/dia
- Gates de qualidade rígidos (extensão, linguagem, integridade de claims)
- Campanha mensal de 30 dias com fallback determinístico
- Calendário de corridas sincronizado diariamente
- Watchdog editorial com renovação automática de campanhas

---

## Referências por fase

Se você está procurando código ou comportamento da Fase 8 ou anterior:
- **Estrutura de dados:** [_data/](./data/) (agora [`_data/`](./_data/))
- **Workflows de CI:** [.github/workflows/](./github/workflows/)
- **Validação e schemas:** [bot/src/validation/](./bot/src/validation/), [bot/src/schemas/](./bot/src/schemas/)
- **Publicação:** [bot/src/campaign_producer.js](./bot/src/campaign_producer.js)
