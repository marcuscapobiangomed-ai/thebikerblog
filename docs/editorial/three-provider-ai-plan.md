# Plano de geração editorial com Gemini, Groq e DeepSeek

Data de referência: 4 de agosto de 2026.

## Objetivo

Usar as cotas gratuitas de Gemini e Groq para volume, preparação e controle; reservar o saldo pago do DeepSeek para síntese e edição final de alto valor. Nenhum provedor publica diretamente. Todo resultado passa por validações determinísticas e pelo gate editorial automatizado antes do agendamento.

## Papel de cada provedor

| Provedor | Papel principal | Quando não usar |
|---|---|---|
| Groq | Extração rápida de fatos, normalização em JSON, criação de pauta, crítica objetiva e reparo de formato | Como autoridade factual ou redator final sem validação documental |
| Gemini | Primeiro rascunho longo, organização do material, alternativas de intertítulos e revisão de cobertura | Para inventar pesquisa ausente ou publicar diretamente |
| DeepSeek | Edição final dos artigos prioritários, resolução de conflitos técnicos e reescrita orientada pelas críticas | Em tarefas mecânicas, tentativas ilimitadas ou como fallback automático de qualquer erro |

Os nomes dos modelos serão variáveis de ambiente. A disponibilidade e os limites serão lidos da conta, sem depender de nomes fixos no código.

## Fluxo recomendado

### 1. Pacote de evidências — sem IA

O sistema reúne apenas fontes primárias, catálogo TheBiker, data de verificação, especificações, resultados oficiais e campos obrigatórios do tipo editorial. URLs, datas, marcas e números passam por validação antes de consumir qualquer API.

Se o portfólio ou uma afirmação essencial não estiver confirmado, a execução termina como pesquisa insuficiente.

### 2. Ficha estruturada — Groq

Groq recebe o pacote de evidências e devolve JSON curto:

- fatos confirmados com identificação da fonte;
- lacunas e conflitos;
- afirmações proibidas;
- ângulos técnicos possíveis;
- cobertura mínima exigida pelo formato.

Esta etapa é barata em tokens, rápida e reutilizável. O resultado é armazenado por hash das fontes.

### 3. Arquitetura e primeiro rascunho — Gemini

Gemini recebe a ficha validada, o formato canônico e as regras TheBiker. Produz o artigo estruturado em JSON, com:

- intertítulos específicos e atraentes;
- nenhum rótulo “Introdução”, “Desenvolvimento” ou “Conclusão”;
- “Perguntas frequentes” permitido;
- parágrafos coesos;
- fontes vinculadas às alegações;
- nenhuma promoção de concorrentes.

O texto continua como rascunho e não pode acrescentar fatos fora do pacote.

### 4. Auditor adversarial — Groq

Uma segunda chamada curta, sem pedir reescrita, identifica:

- afirmações sem fonte;
- contradições de números ou versões;
- tom genérico ou iniciante;
- promoção indevida;
- intertítulos fracos;
- repetição, enchimento e conclusão não demonstrada.

O auditor devolve apenas uma lista estruturada de problemas, gravidade e trecho afetado. Isso evita gastar o provedor premium para descobrir erros básicos.

### 5. Edição final — DeepSeek

DeepSeek recebe somente o pacote de evidências, o rascunho e a crítica já filtrada. Sua função é corrigir e elevar o texto, sem pesquisar nem criar dados.

Uso obrigatório:

- posts P0;
- reviews de produto;
- comparativos com decisão comercial;
- análises de corrida que exigem síntese tática;
- qualquer rascunho com conflito técnico relevante.

Uso condicionado:

- posts P1/P2 somente quando o score automático ficar abaixo do limite de publicação.

Se o saldo, a API ou o limite de custo falhar, o conteúdo permanece pendente; não se publica uma versão inferior automaticamente.

### 6. Gates finais — sem IA

Antes de salvar:

1. JSON válido e schema completo;
2. portfólio confirmado;
3. fontes e datas presentes;
4. números do texto encontrados na ficha;
5. ausência de marcas promovidas fora do portfólio;
6. ausência de intertítulos genéricos proibidos;
7. extensão e cobertura compatíveis com o formato;
8. status final ainda definido como rascunho.
9. plano visual compatível com o tipo editorial;
10. imagem publicável com manifesto v2 e aprovação pelo gate automatizado.

## Política de custo

- Reservar inicialmente US$ 0,40 dos US$ 2,00 para contingência.
- Usar no máximo US$ 1,60 durante o primeiro ciclo de calibração.
- Medir custo real de três artigos-piloto: review, comparativo e corrida.
- Definir o teto por artigo somente após esse benchmark, usando o consumo retornado pela própria API.
- Permitir no máximo uma geração e uma correção por provedor.
- Não repetir chamada por erro de schema sem antes aplicar reparo local ou crítica curta.
- Reutilizar fichas, críticas e respostas idênticas por hash de modelo, prompt e fontes.
- Interromper automaticamente o DeepSeek ao atingir 80% do orçamento mensal configurado.

## Roteamento e contingência

| Situação | Decisão |
|---|---|
| Groq retorna 429 | Respeitar `retry-after`; adiar a etapa ou usar Gemini somente se houver cota |
| Gemini atinge cota gratuita | Adiar rascunhos P1/P2; usar Groq para tarefas curtas; não consumir DeepSeek por conveniência |
| DeepSeek indisponível | Manter o artigo em revisão, sem publicar |
| JSON inválido | Uma tentativa de reparo no mesmo provedor; depois registrar falha |
| Resposta truncada | Reduzir contexto redundante ou dividir por seção; nunca completar fatos por inferência |
| Divergência entre modelos | A fonte primária vence; sem fonte suficiente, bloquear |

## Métricas obrigatórias

Cada chamada deverá registrar sem incluir chaves ou conteúdo sensível:

- provedor e modelo;
- etapa do pipeline;
- horário e duração;
- tokens de entrada e saída;
- custo estimado e acumulado;
- tentativas e motivo de fallback;
- resultado da validação;
- score editorial antes e depois da edição;
- hash do pacote de fontes.

## Critério de qualidade

O score de publicação será composto por:

- 30% sustentação factual e fontes;
- 20% profundidade técnica;
- 15% aderência ao portfólio;
- 15% clareza e progressão;
- 10% qualidade dos intertítulos;
- 10% utilidade da decisão para o ciclista experiente.

Falha factual, promoção de concorrente ou ausência de evidência de portfólio é bloqueio absoluto, independentemente da pontuação.

## Implantação em quatro etapas

1. Adicionar o cliente Groq e uma interface comum de provedores, sem alterar a publicação.
2. Separar o pipeline em ficha, rascunho, crítica e edição; adicionar cache e telemetria.
3. Executar três artigos-piloto e comparar qualidade, latência e consumo.
4. Fixar os modelos por configuração, calibrar limites e liberar somente a geração de rascunhos.

## Estado da implementação

- Interface comum dos três provedores: implementada.
- Groq em saída JSON: implementado e autenticado em probe controlado.
- Gemini com modelo configurável e saída JSON: implementado.
- DeepSeek com teto operacional de 80% do orçamento: implementado; chave local ainda necessária para probe.
- Cache por hash de fontes, prompt, etapa, provedor e modelo: implementado.
- Telemetria JSONL sem chaves: implementada.
- Gates de extensão, fontes, seções e intertítulos: implementados.
- Rascunhos com `published: false`: implementado.
- Promoção condicionada a `editorial_status: approved` e `ai_reviewed_by`: implementada.
- Batch legado sem fichas: bloqueado no modo de três provedores.

Diagnóstico sem chamadas:

`npm --prefix bot run ai:doctor`

Probe explícito de um provedor:

`npm --prefix bot run ai:doctor -- --live --provider=groq`
