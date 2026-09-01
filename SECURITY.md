# Política de Segurança — TheBikerBlog

## Credenciais

- **Nenhum token** deve estar presente em URLs do Git
- Todos os tokens são usados exclusivamente via header `Authorization: Bearer`
- Arquivos `.env` estão no `.gitignore` e **nunca** são commitados
- `.env.example` contém apenas placeholders
- As chaves das APIs existem somente como **GitHub Environment Secrets** no ambiente `editorial-automation`; nunca como variáveis Jekyll, JavaScript do navegador ou arquivos em `_data`
- O site público não chama Groq, Gemini ou DeepSeek: somente workflows privados fazem essas chamadas
- O deploy verifica o conteúdo final de `_site` e falha se reconhecer uma credencial
- Logs e artefatos nunca devem imprimir headers, valores de secrets ou dumps de `process.env`
- Chaves expostas em chat, log ou commit devem ser revogadas e substituídas antes da ativação

## Automação editorial (2026)

**Estado atual:** pipeline automático está ativa (controlada por `AUTOMATION_ENABLED=true`).

**Execuções automáticas (GitHub Actions):**
- **Pesquisa + produção:** 06:05, 10:05, 14:05 BRT (3x/dia)
- **Recomposição de buffer:** 23:15, 04:35, 10:45, 16:15 BRT
- **Publicação:** 11:55, 12:00, 12:10 BRT (3 tentativas idempotentes)
- **Watchdog editorial:** 18:23 BRT
- **Sync de calendário:** 05:20 BRT (diariamente)
- **Inteligência SEO:** seg 06:17 BRT; 1º dia do mês 07:23 BRT

**Gates de segurança:** cada pauta passa por 5 validações:
1. Extensão mínima (900–1800 palavras conforme tipo)
2. Proibição de linguagem publicitária
3. Exigência de fonte rastreável (fabricante, distribuidor, loja)
4. Integridade de claims (alegações técnicas devem existir nas fontes confirmadas)
5. Revisão IA com nota ≥90/100

**Transacionalidade:** nada é commitado em `main` a menos que toda a cadeia de validação passe. Se qualquer gate falha, a pauta entra em `blocked` e é substituída por um fallback na próxima tentativa.

**Proteção de buffer:** se o buffer de pautas agendadas cair abaixo de `EDITORIAL_MIN_SAFE_BUFFER` (padrão 1), os workflows falham com `exit 1` para alertar (via issue automática aberta por `automation-alerts.yml`).

## Validação de entrada (legado)

- Integração WhatsApp está desativada (não faz parte da instalação padrão)
- Limite diário de 10 solicitações por número (histórico)
- Comprimento máximo de 5000 caracteres (histórico)

## Reporting

Para reportar vulnerabilidades, abra um incidente em `_data/incidents/` ou entre em contato via contato@thebikerblogblog.com.br.
