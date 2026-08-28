# Manual Editorial — Blog oficial da TheBiker

## Posicionamento

O blog oficial da **TheBiker** é uma publicação especializada para ciclistas intermediários, avançados, atletas e profissionais. Seu núcleo é formado por reviews técnicos, comparativos, lançamentos, notícias de marcas do portfólio e cobertura analítica das principais competições.

O conteúdo tem objetivo editorial e comercial: demonstrar autoridade, valorizar o portfólio real da TheBiker e ajudar o leitor a escolher produtos vendidos pela loja.

## Voz

- Conhecimento técnico excepcional, sem explicações introdutórias desnecessárias.
- Precisão em versões, anos, materiais, geometria, componentes e compatibilidades.
- Comparações equivalentes, com critérios explícitos e conclusão por perfil.
- Persuasão construída por evidência e interpretação técnica, nunca por superioridade inventada.
- Português do Brasil claro, seguro e específico.

## Público prioritário

1. Ciclistas intermediários em evolução técnica.
2. Ciclistas avançados e competitivos.
3. Atletas amadores e profissionais.
4. Entusiastas de equipamentos, tecnologia e competições.
5. Clientes da TheBiker interessados em compra, troca ou upgrade.

Conteúdo básico para iniciantes deve ser excepcional e não dominar a home, o calendário ou as recomendações.

Cada briefing novo deve declarar `audience_segment`, `audience_intent` e `experience_level_target` conforme `docs/AUDIENCE_OPERATING_SYSTEM.md`. Esses campos descrevem o alvo editorial da pauta e alimentam GA4, Clarity, o índice público para IAs e o fluxo n8n.

## Distribuição editorial

| Pilar | Participação de referência |
|---|---:|
| Reviews e análises técnicas do portfólio | 35% |
| Comparações entre produtos do portfólio | 25% |
| Corridas e campeonatos | 25%: 4 pautas profissionais + 4 pautas para participar a cada ciclo de 30 dias |
| Lançamentos, mercado e notícias das marcas vendidas | 10% |
| Conteúdo básico | até 5% |

## Política de marcas — obrigatória

1. É estritamente proibido anunciar, recomendar, valorizar, linkar para compra ou incluir CTA de marca que não esteja no portfólio confirmado da TheBiker.
2. Todo produto promovido exige URL oficial da loja e data da verificação.
3. Comparativos comerciais só podem incluir opções vendidas pela TheBiker.
4. Uma marca concorrente pode ser citada apenas quando for fato indispensável à cobertura de corrida, resultado, equipe ou campeonato.
5. Menção contextual de concorrente não pode conter recomendação, elogio comercial, link de compra, disponibilidade, preço ou chamada para ação.
6. Se o portfólio não puder ser confirmado, o artigo deve parar com `PORTFÓLIO NÃO CONFIRMADO`.
7. A lista operacional fica em `bot/config/thebiker-portfolio.json` e precisa ser revalidada periodicamente contra o catálogo oficial.

## Profundidade esperada nos reviews

Quando aplicável, analisar:

- versão exata, ano e mercado;
- arquitetura do quadro, materiais, layup e construção;
- geometria completa e efeito esperado no comportamento;
- transmissão, relações, escalonamento e estratégia de uso;
- rodas, largura interna, pneus, pressão e compatibilidades;
- frenagem, cockpit, integração, padrões proprietários e manutenção;
- peso declarado, tamanho medido e configuração da medição;
- diferenças para a geração anterior;
- alternativas equivalentes disponíveis na TheBiker;
- impacto em subida, plano, sprint, terreno técnico e endurance;
- custo total, possibilidade de upgrade, garantia e disponibilidade;
- indicação por perfil, percurso e objetivo competitivo.

Expressões como “leve”, “rápido”, “rígido” ou “confortável” só podem ser usadas com contexto técnico suficiente.

## Métodos de análise

| Tipo | Descrição | Rótulo |
|---|---|---|
| Desk research | Pesquisa em fabricante, distribuidor, catálogo TheBiker e fontes técnicas | Análise documental |
| Field review | Teste prático documentado, com produto, período, percurso e condições identificados | Review com teste próprio |
| Cobertura esportiva | Resultado, classificação, percurso e fatos confirmados em fontes oficiais | Cobertura de competição |

Análise documental nunca pode ser apresentada como experiência própria.

## Comparativos

- Usar a mesma versão, mercado e período de referência.
- Comparar pelos mesmos critérios.
- Não criar um vencedor universal: concluir por perfil e aplicação.
- Todas as opções recomendadas devem estar confirmadas no portfólio.
- Concorrentes externos não entram como recomendação nem alternativa comercial.

## Corridas e campeonatos

O pilar tem duas trilhas independentes. `professional-coverage` cobre o esporte profissional; `participant-calendar` ajuda o leitor a encontrar e avaliar provas no Brasil. As duas usam a mesma categoria pública, mas não compartilham formato, intenção de audiência nem gate de fontes. A operação detalhada está em `docs/editorial/race-program.md`.

### Prévia

- posição da prova no calendário;
- percurso, altimetria e setores decisivos;
- condições previstas;
- favoritos e forma recente;
- cenários táticos;
- marcas do portfólio presentes em bicicletas, componentes e equipamentos;
- horário, transmissão e fontes oficiais.

### Resumo

- resultado confirmado;
- movimentos determinantes;
- leitura tática das equipes;
- desempenho dos atletas;
- equipamentos de marcas do portfólio em destaque;
- impacto na classificação e na temporada;
- próximas provas.

### Calendário para participar

- data, cidade, estado, modalidade e nível da prova;
- situação da inscrição, prazo e link oficial quando confirmados;
- categorias, filiação e elegibilidade;
- distância, altimetria, regulamento e logística apenas quando publicados;
- adiamentos e cancelamentos destacados;
- informação ausente rotulada como “Inscrição ainda não confirmada na fonte oficial”.

## Lançamentos e notícias

- Priorizar marcas e produtos comercializados pela TheBiker.
- Separar anúncio, rumor, vazamento e interpretação editorial.
- Confirmar versão, mercado, disponibilidade e preço.
- Explicar o que mudou e para quem a evolução é relevante.
- Não publicar rumor como lançamento confirmado.

## Transparência comercial

O blog deve declarar que é o canal editorial oficial da TheBiker e que seleciona pautas com prioridade para produtos e marcas da loja. Isso não autoriza informações falsas, experiência simulada ou ocultação de limitações técnicas relevantes.

## Gate antes da publicação

- [ ] A marca promovida está na lista canônica do portfólio.
- [ ] Há URL oficial da TheBiker e data de verificação.
- [ ] Nenhum concorrente recebeu recomendação, link ou CTA.
- [ ] Todas as afirmações técnicas possuem fonte.
- [ ] O método de análise está declarado.
- [ ] Não há experiência prática inventada.
- [ ] O texto tem profundidade adequada ao público avançado.
- [ ] A conclusão explica para quem o produto faz sentido.
- [ ] O gate automatizado concluiu sem bloqueadores e o recibo editorial foi emitido.
- [ ] Em corrida, o evento existe no registro, a fonte oficial foi revista nas últimas 24 horas e a trilha/formato estão corretos.
