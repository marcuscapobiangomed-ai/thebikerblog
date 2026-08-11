# Programa editorial de corridas — TheBiker Insights

## Decisão

Corridas ocupam 8 das 30 pautas do ciclo editorial (26,7%), atendendo a referência de 25% sem reduzir o tema a uma única interpretação:

| Trilha | Pautas por ciclo | Função |
|---|---:|---|
| `professional-coverage` | 4 | Explicar o calendário profissional, antecipar provas e analisar resultados e decisões técnicas. |
| `participant-calendar` | 4 | Ajudar o ciclista a descobrir provas no Brasil e decidir se pode e deve participar. |

## Formatos

### Cobertura profissional

- `preview`: prévia ligada a uma prova específica;
- `recap`: resultado e análise depois da prova;
- `weekly-roundup`: boletim de provas e resultados da semana.

Intenção editorial: `follow_market_competition`.

### Calendário participativo

- `calendar-roundup`: agenda com várias provas e situação conhecida das inscrições;
- `event-guide`: guia aprofundado de uma prova;
- `registration-alert`: só pode existir quando há inscrição aberta e URL oficial verificada.

Tipos de artigo: `calendario-provas` e `guia-prova`. Intenção editorial: `find_race_to_enter`.

## Fontes e estado dos dados

1. Calendário e resultados profissionais: UCI, CBC, federação responsável e organizador oficial.
2. Provas participativas: calendário CBC/federação, página oficial do evento, regulamento e plataforma de inscrição apontada pela organização.
3. Agregadores, redes sociais e vídeos podem gerar uma pauta, mas não confirmar data, inscrição, percurso, resultado ou cancelamento.
4. O registro canônico é `_data/race-events.json`; cada evento mantém URL e horário da checagem.
5. “Inscrição aberta” exige URL específica verificada. Sem isso, o estado público é “Inscrição ainda não confirmada na fonte oficial”.
6. Antes da publicação, a pauta precisa ser revalidada em até 24 horas. Fonte vencida, evento ausente ou divergência bloqueiam a publicação.

## Calendário público automatizado

A página `/corridas/` consome `publicCalendar` do mesmo registro canônico `_data/race-events.json`. Esse snapshot é separado dos eventos ligados às pautas editoriais para que uma atualização pública nunca invalide uma campanha em andamento.

- `npm run sync:races` consulta diariamente os endpoints oficiais de calendário da UCI para estrada e MTB;
- a seleção pública mantém até 3 provas que abrangem o dia atual, 3 provas relevantes encerradas nos últimos 30 dias e as 10 próximas provas de WorldTour, Women’s WorldTour, ProSeries, Copa do Mundo ou Campeonato Mundial;
- o card “Em disputa hoje” considera qualquer prova de estrada ou MTB cuja data oficial abranja o dia atual; ele não alega transmissão ao vivo nem confirma resultado, e permanece visível com um estado informativo quando o recorte estiver vazio;
- cada item é reconfirmado na ficha oficial da competição, que fornece país, classe e site do organizador;
- o dia de referência é calculado em `America/Sao_Paulo`, inclusive em execuções manuais próximas da virada UTC;
- o script limita a concorrência das consultas, usa retentativa com backoff, grava o snapshot de forma atômica e encerra com erro se o contrato da fonte mudar, houver divergência de classe ou não existirem 3 recentes e 10 próximas;
- o workflow `update-race-calendar.yml` roda às 05:20 de Brasília, usa o mesmo bloqueio de escrita das demais automações e dispara o deploy normal somente depois de registrar um snapshot válido;
- snapshots com mais de 48 horas são recusados por `npm run validate:races`, e falhas do workflow entram no alerta operacional do blog.

Quando uma pauta profissional planejada ainda não possui `eventIds`, o produtor editorial usa o snapshot sincronizado como sinal de priorização: prévias recebem uma prova futura, resumos recebem uma prova recente e boletins semanais recebem até três eventos de maior classe e proximidade. A pesquisa oficial continua obrigatória e o vínculo automático não libera publicação por conta própria.

O calendário público informa fatos de agenda; ele não equivale a uma prévia, análise, resultado detalhado ou liberação de inscrição. Esses conteúdos continuam sujeitos aos gates editoriais e de fonte de até 24 horas.

## Fluxo

1. O planejamento mensal reserva quatro posições para cada trilha.
2. A pauta `planned` pode apontar para eventos do registro, mas começa com `sourceStatus: pending`.
3. A pesquisa consulta novamente as fontes oficiais e grava a data da verificação.
4. A pauta só avança para `research-ready` com evento, fonte e verificação válidos.
5. Na hora de publicar, a automação confere novamente a janela de 24 horas.
6. Se os dados não forem suficientes, a pauta é bloqueada; uma reserva não factual mantém a cadência sem inventar uma corrida.

## Limites comerciais e visuais

- Concorrentes podem aparecer apenas como fato esportivo indispensável, nunca com recomendação, preço ou CTA.
- Produtos da TheBiker só entram quando a associação ao atleta/equipe e a disponibilidade na loja forem verificadas separadamente.
- Uma imagem de evento real exige fotografia licenciada ou gráfico factual. IA não pode simular atleta, percurso, resultado ou cena documental de uma prova real.

## Métricas separadas

- Profissional: leitura qualificada, retorno ao blog, consumo de prévia e resumo do mesmo evento.
- Participativo: clique em fonte oficial/inscrição, uso de filtros por modalidade/região e retorno à atualização do calendário.
- Abertura da agenda é medida como `race_calendar_view`; clique em ficha oficial é `race_outbound_click`, segmentado por evento e seção. Clique que sai para a loja continua medido separadamente como `store_click`.
