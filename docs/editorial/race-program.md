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
- Clique que sai para a loja continua medido como `store_click`; clique para organizador ou inscrição deve ser classificado separadamente como `race_outbound_click`.
