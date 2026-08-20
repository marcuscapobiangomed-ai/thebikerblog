# Automação editorial TheBiker

## Arquitetura operacional

O GitHub Actions é o motor de produção permanente. O n8n local serve para visualização e homologação, mas a continuidade do blog não depende de computador ligado.

O workflow `.github/workflows/cron-post.yml` possui três janelas diárias de execução. Cada execução produz no máximo uma pauta e compartilha o grupo de concorrência `thebiker-editorial-write` com auditoria, reparo, renovação e publicação. O workflow `.github/workflows/publish-daily.yml` verifica a publicação às 11h55, 12h00 e 12h10 em `America/Sao_Paulo`; a operação é idempotente.

O fluxo completo é:

1. recuperar ou substituir pauta bloqueada;
2. pesquisar fontes permitidas;
3. construir ficha factual;
4. gerar e criticar o rascunho;
5. aplicar edição premium quando necessária;
6. produzir e validar imagem;
7. executar os gates estruturais antes de promover qualquer arquivo;
8. agendar somente artigo com nota final mínima 90 e zero bloqueadores;
9. publicar a pauta aprovada na data local;
10. validar o artefato promovido e persistir o novo SHA; a conclusão bem-sucedida do workflow aciona um único deploy do `main` atualizado.

Falha de fonte, modelo, orçamento, schema, imagem, SEO ou build mantém a pauta bloqueada. Popularidade de vídeo é sinal editorial, nunca prova factual.

## Provedores e orçamento

O pipeline usa:

- Groq para pesquisa com navegação e como redundância editorial;
- Gemini como primeira opção gratuita para o rascunho;
- `deepseek-v4-flash` para planejamento, JSON, ficha factual e auditorias estruturadas;
- `deepseek-v4-pro` para edição premium, reparo e conteúdo técnico de maior risco.

O teto aprovado é `AI_MONTHLY_BUDGET_USD=5.00`. A telemetria registra modelo, tokens, custo estimado e gasto acumulado. Há alerta lógico a 60%, estado crítico a 85% e bloqueio preventivo quando a próxima chamada puder ultrapassar o teto. O limite nunca é elevado automaticamente.

O estimador considera preços diferentes para V4 Flash e V4 Pro, além de tokens de entrada com e sem cache. Toda chamada DeepSeek, inclusive o planejamento mensal, precisa passar pelo mesmo guard financeiro.

## Configuração no GitHub

No environment `editorial-automation`, mantenha somente os secrets necessários:

- `GROQ_API_KEY`;
- `GEMINI_API_KEY`;
- `DEEPSEEK_API_KEY`;
- credenciais Google de leitura descritas em `docs/operations/n8n-editorial-intelligence.md`.

Variáveis operacionais:

- `AUTOMATION_ENABLED=true`;
- `AI_MONTHLY_BUDGET_USD=5.00`;
- `DEEPSEEK_FLASH_MODEL=deepseek-v4-flash`;
- `DEEPSEEK_PRO_MODEL=deepseek-v4-pro`;
- `INTELLIGENCE_ENABLED=true` somente depois de validar o OAuth Google.

As chaves não entram em `_config.yml`, `_data`, JavaScript público, logs ou arquivos `.env` versionados.

## Recuperação e segurança

- `400 output_parse_failed`, 429, timeout e erros transitórios recebem retry limitado.
- A recuperação de atraso exige a política explícita `oldest-approved`; cada execução promove no máximo uma pauta vencida e atualiza a data pública para o dia real da recuperação.
- Resposta de pesquisa inválida pode usar somente evidência interna pertinente e com fontes permitidas.
- Sem evidência suficiente, a pauta permanece bloqueada e uma reserva evergreen ocupa o buffer.
- Reviews e comparativos validados exigem produto rastreável.
- Concorrentes podem ser contexto técnico, nunca promoção ou CTA.
- Somente inventário TheBiker verificado recebe link comercial.
- Os alertas cobrem inteligência, renovação, produção, recomposição do buffer, auditoria, reparo, publicação e deploy; falhas recorrentes são agrupadas pelo fingerprint da causa.
- Pull requests integrados acionam deploy pelo `push` em `main`. Como commits feitos pelo `GITHUB_TOKEN` não encadeiam workflows por `push`, publicação e atualização de corridas acionam o deploy pelo evento `workflow_run` após sucesso. Um dispatch manual só constrói com `force_deploy=true`.

## Recuperação controlada de publicações

1. Execute `publish-daily.yml` manualmente com `dry_run=true` e `catch_up=true` para identificar o atraso aprovado mais antigo.
2. Confirme no resumo o `item_id`, o indicador de catch-up e a quantidade de atrasos restantes.
3. Execute novamente com `dry_run=false` e `catch_up=true`.
4. Aguarde o commit, o deploy disparado pelo `push` e a validação do site antes de repetir.

Uma pauta bloqueada na data atual não impede um atraso anterior que já esteja aprovado. Sem `catch_up=true`, o publicador permanece fail-closed e não escolhe atrasos implicitamente.

## Agenda de corridas

`npm run validate:races` verifica a estrutura factual do snapshot. `npm run validate:races:freshness` aplica separadamente a janela operacional de 48 horas e é obrigatório para atualizar a agenda ou publicar pauta de corrida. Artigos comuns não são bloqueados pela idade global da agenda.

O sincronizador aceita contingência factual com exatamente cinco das seis provas brasileiras esperadas, registrando `sourceStatus: degraded` e metadados tipados. Abaixo de cinco, a atualização falha sem persistir; nenhum evento é inventado para completar a agenda.

## OAuth da inteligência editorial

Se o Google responder `invalid_grant`, defina `INTELLIGENCE_ENABLED=false` e mantenha a produção editorial independente ativa. Renove `GOOGLE_REFRESH_TOKEN`, teste manualmente `editorial-intelligence.yml` e somente então restaure `INTELLIGENCE_ENABLED=true`. Nunca registre o token em issue, log ou arquivo versionado.

## Critério de autonomia

Não declarar operação autônoma apenas porque o código está versionado. A prova exige uma execução semanal, uma renovação mensal, publicações e deployments consecutivos, alertas exercitados e observação com o computador desligado.
