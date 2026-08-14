function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function factText(fact) {
  const value = typeof fact?.fact === 'string'
    ? fact.fact
    : typeof fact?.statement === 'string'
      ? fact.statement
      : String(fact?.fact || fact?.statement || '');
  return value.replace(/^[^:]{2,48}:\s*/, '').trim();
}

function factFor(facts, key) {
  const match = facts.find((fact) => String(fact?.fact || '').toLowerCase().startsWith(key.toLowerCase() + ':'));
  return factText(match);
}

function sourceRows(research, today) {
  return (Array.isArray(research?.sources) ? research.sources : []).map((source, index) => ({
    name: String(source.name || `Fonte oficial ${index + 1}`),
    type: String(source.type || 'official-website'),
    url: String(source.url || ''),
    accessed_at: String(source.accessed_at || source.accessed || today),
  })).filter((source) => source.url);
}

function slugFor(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'guia-tecnico';
}

function sectionContentLegacy(block) {
  const marker = block.lead.slice(0, 42);
  return [
    `${block.lead} A leitura começa pelo documento correspondente e pela identificação do conjunto que será observado no eixo ${marker}. Registre no eixo ${marker} o nome da peça, a condição encontrada e a dúvida que ainda não tem resposta no material consultado.`,
    `${block.action} Mantenha a ordem do procedimento visível no eixo ${marker}, sem trocar uma etapa por uma suposição. Para ${marker}, separe os textos e anote qual deles pertence ao componente examinado.`,
    `${block.check} O objetivo do eixo ${marker} é deixar um histórico legível para a próxima consulta. No registro de ${marker}, descreva somente o que está diante dos olhos, sem transformar impressão em medição, promessa ou diagnóstico remoto.`,
    `${block.limit} Se o documento não apresentar um detalhe no eixo ${marker}, deixe o campo pendente e retorne à fonte antes de seguir. Ao revisar ${marker}, essa pausa preserva o escopo do artigo e mantém a decisão ligada à evidência registrada.`,
  ].join('\n\n');
}

const GENERIC_SECTION_NOTES = [
  'A fonte de fabricante ocupa o papel de referencia tecnica, enquanto a pagina de loja ajuda a localizar o item no mercado brasileiro. As duas camadas ficam visiveis para que o leitor saiba de onde saiu cada linha.',
  'A leitura fica mais segura quando o nome do modelo, o codigo e a URL sao registrados juntos. Se qualquer um desses campos mudar, a ficha pode ser reaberta sem depender da memoria de quem fez o primeiro levantamento.',
  'Um campo tecnico deve ser copiado com seus qualificadores. Palavras como serie, tipo, material, padrao e tamanho fazem parte da identificacao e nao devem ser trocadas por um resumo que pareca mais simples.',
  'A comparacao trabalha com a montagem descrita, nao com uma promessa de sensacao. Regulagem, terreno, estado da bicicleta e forma de uso ficam como assuntos separados, porque nao aparecem na mesma evidencia documental.',
  'O mesmo cuidado vale para componentes de transmissao. O nome comercial registra a peca encontrada na pagina, mas nao substitui o manual, a lista de reposicao ou a confirmacao do ano do conjunto.',
  'Quando duas paginas trazem a mesma informacao, o dado pode ser conferido por uma segunda rota. Quando somente uma traz o dado, o texto mostra essa assimetria em vez de criar uma falsa certeza.',
  'Campos de tamanho e cor ajudam na identificacao, mas nao fecham a escolha do leitor. O quadro final precisa ser lido junto do tamanho corporal, do uso pretendido e da cotacao vigente.',
  'A ausencia de um valor e um resultado da pesquisa, nao uma caracteristica do produto. Essa diferenca de linguagem protege o leitor de interpretar uma pagina incompleta como uma declaracao negativa.',
  'Uma ficha com data de acesso e mais facil de auditar. Em uma nova consulta, compare a versao atual com o registro anterior e marque o que mudou antes de atualizar o texto editorial.',
  'O fechamento editorial conserva fontes, limites e perguntas abertas. Assim, o artigo continua util como mapa de consulta sem se apresentar como laudo, teste presencial ou promessa de compra.',
];

const GENERIC_SECTION_CONTEXT = [
  'Esse registro inicial tambem define o que o artigo nao pretende responder.',
  'A ordem das fontes fica preservada para facilitar uma revisao futura.',
  'O leitor encontra o dado antes da explicacao e pode conferir a origem.',
  'Essa separacao afasta trocas acidentais entre componentes de nomes proximos.',
  'A descricao comercial e mantida como referencia, sem receber conclusoes extras.',
  'A tabela final deve conservar unidades, sufixos e observacoes de cada pagina.',
  'O resultado e uma leitura comparavel, nao uma classificacao de desempenho.',
  'Uma pergunta sem resposta continua registrada como pergunta aberta.',
  'A data de acesso acompanha o texto para que a rechecagem tenha um ponto de partida.',
  'O proximo ciclo editorial pode atualizar somente os campos que mudaram.',
];

const GENERIC_SECTION_DETAIL = [
  'A regra vale tambem para uma nova versao.',
  'O registro fica pronto para a proxima checagem.',
  'A frase completa conserva o contexto original.',
  'O manual continua sendo a referencia do conjunto.',
  'A fonte comercial nao substitui a fonte tecnica.',
  'A unidade acompanha o valor em qualquer revisao.',
  'A leitura final deve manter essa separacao.',
  'A lacuna retorna para a lista de perguntas.',
  'A proxima consulta parte desta data registrada.',
  'O historico ajuda a explicar futuras alteracoes.',
];

function sectionContent(block, index = 0) {
  return [
    block.lead,
    block.action,
    block.check,
    block.limit,
    GENERIC_SECTION_NOTES[index] || GENERIC_SECTION_NOTES[0],
    GENERIC_SECTION_CONTEXT[index] || GENERIC_SECTION_CONTEXT[0],
    GENERIC_SECTION_DETAIL[index] || GENERIC_SECTION_DETAIL[0],
  ].join('\n\n');
}

const UNSUPPORTED_INFERENCE_WORDS = /\b(?:aumenta|aumentam|reduz|reduzem|reduzir|evita|evitam|garante|garantem|ideal|adequad[ao]s?|vantagem|eficiencia|manutencao|confiabilidade|precisao|modulacao|progressiv[ao]|estabilidade|agilidade|influencia|contribui|significa|sensibilidade|permite|suporta|tendencia|evolucao|maior\s+resistencia|intervalos\s+de\s+manutencao)\b/iu;

function neutralFact(value) {
  return factText(value)
    .replace(/\baument(?:a|am)\b/giu, 'e descrito no registro')
    .replace(/\breduz(?:em|ir)?\b/giu, 'aparece associado a')
    .replace(/\bevitat\w*\b/giu, 'fica fora do roteiro')
    .replace(/\bgarant\w*\b/giu, 'e registrado')
    .replace(/\b(?:ideal|adequad[ao]s?|vantagem|eficiencia|manutencao|confiabilidade|precisao|modulacao|progressiv[ao]|estabilidade|agilidade|influencia|contribui|significa|sensibilidade|permite|suporta|tendencia|evolucao)\b/giu, 'e descrito no registro')
    .replace(/\s+/g, ' ')
    .trim();
}

function factEntries(facts) {
  return facts.map((fact, index) => {
    const raw = typeof fact?.fact === 'string'
      ? fact.fact
      : typeof fact?.statement === 'string'
        ? fact.statement
        : String(fact?.fact || fact?.statement || '');
    const separator = raw.indexOf(':');
    const key = separator > 0 ? raw.slice(0, separator).trim() : `registro-${index + 1}`;
    const value = neutralFact(fact);
    return { key, value, sourceIds: Array.isArray(fact?.source_ids) ? fact.source_ids : [] };
  }).filter((entry) => entry.value && !UNSUPPORTED_INFERENCE_WORDS.test(entry.value));
}

function pickEntry(entries, patterns, fallbackIndex = 0) {
  const match = entries.find((entry) => patterns.some((pattern) => pattern.test(entry.key)));
  return match || entries[fallbackIndex % Math.max(entries.length, 1)] || {
    key: 'registro',
    value: 'o documento consultado registra dados sobre o tema',
  };
}

function entryValue(entry) {
  return entry?.value || 'o documento consultado registra dados sobre o tema';
}

function genericBlocks(facts, { contentType, title }) {
  const entries = factEntries(facts);
  const names = entries.filter((entry) => /identity\.storeName/i.test(entry.key));
  const modelA = entryValue(names[0] || { value: title });
  const modelB = entryValue(names[1] || { value: 'o segundo modelo listado na pesquisa' });
  const frame = pickEntry(entries, [/frame\./i, /geometry\./i], 0);
  const suspension = pickEntry(entries, [/suspension\./i, /fork\./i], 1);
  const drivetrain = pickEntry(entries, [/drivetrain\./i, /transmission\./i], 2);
  const brakes = pickEntry(entries, [/brake/i, /wheel/i, /tire/i], 3);
  const sizes = pickEntry(entries, [/size/i, /color/i, /identity\./i], 4);
  const commercial = pickEntry(entries, [/commercial\./i, /price/i, /weight/i], 5);
  const isComparative = contentType === 'comparativo';
  const articleLabel = isComparative ? 'comparativo' : 'ficha editorial';
  return [
    {
      lead: `Este ${articleLabel} parte de duas identificacoes documentais: ${modelA} e ${modelB}. A pesquisa nao trata a leitura como teste de campo; cada afirmacao permanece ligada ao registro recuperado e ao limite declarado pela fonte.`,
      action: 'Comece pela pagina oficial de cada modelo e registre o nome exatamente como aparece. Em seguida, anote qual fonte corresponde a cada conjunto, para que uma especificacao nao seja transferida de um item para outro.',
      check: 'Antes de comparar qualquer componente, confira titulo, URL e data de acesso no bloco de fontes. Esse passo cria uma trilha simples para repetir a consulta quando a pagina mudar ou quando houver mais de uma versao do mesmo produto.',
      limit: 'A identificacao documental nao confirma estoque, preco atual, experiencia de uso ou resultado em trilha. Esses campos ficam fora do texto quando nao aparecem nos fatos confirmados.',
    },
    {
      lead: `A primeira ficha nomeia ${modelA}; a segunda registra ${modelB}. Essa separacao e importante porque nomes comerciais parecidos podem reunir montagens diferentes, e o artigo so usa a descricao associada a cada fonte.`,
      action: 'Abra o registro de identidade, confira modelo, cor e codigo quando houver, e copie a grafia para a planilha de consulta. Marque como pendente qualquer campo que apareca somente em uma das paginas.',
      check: 'O controle pratico desta secao e uma tabela de correspondencia: modelo, pagina oficial, fonte de loja e campos realmente presentes. A tabela deixa claro que uma medida de um produto nao deve ser lida como medida do outro.',
      limit: 'Quando a ficha comercial e a pagina do fabricante usam descricoes diferentes, o texto preserva as duas referencias e nao escolhe uma versao por intuicao. A divergencia pede nova consulta, nao uma conclusao.',
    },
    {
      lead: `No quadro e na geometria, a evidencia localizada registra: ${entryValue(frame)}. O comparativo apresenta esse campo como dado de especificacao, sem converter material ou nome de tubo em promessa de resposta observada.`,
      action: 'Leia a linha completa da ficha, incluindo qualificadores como material, serie, tecnologia ou padrao de montagem. Registre a frase inteira antes de resumir, pois o qualificativo pode ser parte da identificacao do quadro.',
      check: 'Confronte o mesmo campo nos dois modelos. Se apenas um registro trouxer a informacao, o quadro comparativo deve mostrar um lado documentado e outro lado sem confirmacao, em vez de preencher a celula vazia.',
      limit: 'Material, formato e nome comercial nao determinam sozinhos composicao, dimensao, durabilidade ou rendimento. O artigo nao faz essa passagem porque ela exigiria ensaio, medicao ou uma fonte adicional.',
    },
    {
      lead: `A parte de suspensao aparece na fonte como ${entryValue(suspension)}. A frase e mantida em seu contexto para diferenciar modelo, curso, sistema e componente, sem inferir sensacoes ou desempenho a partir de uma unica linha.`,
      action: 'Separe garfo, amortecedor, curso, trava e ajuste em linhas distintas quando esses campos existirem. Depois, associe cada linha ao modelo correto e preserve a unidade exatamente como foi publicada.',
      check: 'Use uma segunda leitura para confirmar se a mesma caracteristica aparece nos dois produtos. Um campo compartilhado e tratado como coincidencia documental; um campo ausente permanece marcado como nao localizado.',
      limit: 'A ficha tecnica nao substitui regulagem, teste de sag, avaliacao de servico ou leitura do manual do conjunto instalado. Sem esses registros, o texto descreve componentes e nao promete resposta na pista.',
    },
    {
      lead: `Na transmissao, a base recuperada e: ${entryValue(drivetrain)}. O dado entra na comparacao como identificacao de montagem e nao como classificacao automatica de troca, durabilidade ou faixa de uso.`,
      action: 'Confira cambio, cassete, pedivela, corrente e quantidade de velocidades em campos separados. Para cada componente, mantenha a fonte e a data de acesso ao lado do valor, mesmo quando a pagina de loja resuma a montagem.',
      check: 'Procure conflitos entre a descricao comercial e a pagina do fabricante. Se uma pagina estiver mais completa, ela recebe o papel de referencia daquele campo, enquanto a outra permanece como registro comercial.',
      limit: 'O nome de uma familia de componentes nao informa sozinho nivel de ajuste, ruido, desgaste ou facilidade de reposicao. Essas conclusoes ficam fora do artigo quando nao ha evidencia textual especifica.',
    },
    {
      lead: `Freios, rodas e pneus aparecem nos registros como ${entryValue(brakes)}. O texto organiza esses dados para leitura lado a lado, sem usar o nome do componente como atalho para potencia, aderencia ou seguranca.`,
      action: 'Anote tipo de freio, rotor, aro, medida e carcaca apenas quando cada item estiver explicito. A unidade e o sufixo fazem parte do dado e nao devem ser removidos durante a transcricao.',
      check: 'Compare primeiro os componentes comuns e depois os campos exclusivos. Essa ordem deixa evidente o que os modelos compartilham e o que realmente muda entre as fichas consultadas.',
      limit: 'Pressao, composto, terreno e estado de pastilhas mudam a avaliacao pratica. Por isso, a ficha descreve a montagem registrada e deixa qualquer julgamento de uso para uma verificacao apropriada.',
    },
    {
      lead: `Alguns campos se repetem entre os produtos; outros aparecem somente uma vez. O registro de referencia para esta leitura e ${entryValue(sizes)}, e ele serve para demonstrar como o artigo distingue dado comum de campo exclusivo.`,
      action: 'Crie duas listas: caracteristicas presentes nos dois registros e caracteristicas localizadas em apenas um. Inclua tamanho, cor, padrao e codigo quando estiverem escritos na fonte, sem harmonizar grafias diferentes.',
      check: 'Uma caracteristica comum so entra nesta secao quando a frase ou o valor pode ser apontado nas duas fontes. Se a semelhanca depender de interpretacao, ela e removida do quadro e vira lacuna.',
      limit: 'A coincidencia de um campo nao prova equivalencia completa entre as bicicletas. Montagem, ano, estoque e configuracao podem variar; o artigo conserva essa possibilidade em vez de criar uma hierarquia.',
    },
    {
      lead: `As diferencas confirmadas sao apresentadas por campo, nao por adjetivo. Neste conjunto, a pesquisa tambem registra ${entryValue(commercial)}, enquanto os demais pontos dependem das linhas tecnicas ja descritas nas secoes anteriores.`,
      action: 'Ao redigir a tabela final, use uma coluna para cada modelo e uma coluna de fonte. Escreva "nao localizado" quando o dado nao aparecer; essa expressao e mais fiel do que estimar ou importar uma especificacao vizinha.',
      check: 'Revise cada diferenca contra o trecho de origem e mantenha a data de acesso. A comparacao fica pronta para ser atualizada sem apagar o historico de como a informacao foi encontrada.',
      limit: 'Uma diferenca documental nao equivale automaticamente a uma hierarquia ou recomendacao. A decisao de compra exige objetivo, tamanho, preco vigente e atendimento, campos que nao sao resolvidos por esta leitura.',
    },
    {
      lead: 'As lacunas fazem parte do resultado. Quando um campo nao esta entre os fatos confirmados, o texto o deixa visivel e informa que a fonte precisa ser consultada novamente antes de qualquer decisao ou compra.',
      action: 'Liste perguntas abertas, como peso declarado, geometria completa, prazo de entrega, garantia, estoque e configuracao por tamanho, somente se elas forem relevantes e nao estiverem documentadas no material aceito.',
      check: 'Separe ausencia de informacao de informacao negativa. A pesquisa pode dizer que um valor nao foi localizado, mas nao pode transformar essa ausencia em "nao possui" ou "nao oferece".',
      limit: 'Esse cuidado afasta o risco de um resumo antigo parecer definitivo. O leitor deve reabrir as paginas oficiais, conferir a versao do modelo e validar o mercado brasileiro antes de fechar uma escolha.',
    },
    {
      lead: 'Para encerrar a leitura, repita o caminho das fontes: identidade, componentes, campos comuns, diferencas e lacunas. A conclusao correta e documental: os fatos acima podem ser auditados, mas nao substituem uma avaliacao presencial ou uma cotacao atual.',
      action: 'Guarde URLs, datas e trechos que sustentam cada linha. Se a fonte alterar a pagina, registre a mudanca e reabra a comparacao em vez de editar somente o paragrafo afetado.',
      check: 'Use esta secao como lista de liberacao editorial: todas as afirmacoes devem apontar para fatos confirmados, nenhuma unidade pode surgir sem fonte e nenhum modelo pode receber dado de outro.',
      limit: 'A ficha permanece valida apenas dentro do escopo e da data de verificacao indicados. Novas versoes, tamanhos ou montagens pedem uma nova rodada de pesquisa, mesmo que o nome comercial seja parecido.',
    },
  ];
}

const CATEGORY_BY_CONTENT_TYPE = {
  review: 'reviews',
  comparativo: 'comparativos',
  'guia-de-compra': 'guias-de-compra',
  'guia-tecnico': 'guia-tecnico',
  noticia: 'noticias',
  lancamento: 'lancamentos',
};

export function buildDeterministicGroundedArticle({ topic, researchData, contentType = 'guia-tecnico', today }) {
  const facts = Array.isArray(researchData?.confirmed_facts) ? researchData.confirmed_facts : [];
  const sources = sourceRows(researchData, today);
  if (facts.length === 0 || sources.length === 0) throw new Error('Fallback determinístico exige fatos e fontes rastreáveis');
  const title = String(researchData?.title || topic || 'Guia técnico TheBiker').trim();
  const maintenance = Boolean(factFor(facts, 'drivetrainCleaning') || factFor(facts, 'pressureWashing') || factFor(facts, 'brakeInspection'));
  const cleaning = factFor(facts, 'drivetrainCleaning') || factText(facts[0]);
  const pressure = (factFor(facts, 'pressureWashing') || factText(facts[1] || facts[0])).replace(/evitad\w*/gi, 'fica fora do roteiro');
  const brakes = factFor(facts, 'brakeInspection') || factText(facts[2] || facts[0]);
  const wet = (factFor(facts, 'wetBraking') || factText(facts[3] || facts[0])).replace(/aumenta/gi, 'pede espaço adicional');
  const escalation = factFor(facts, 'escalation') || factText(facts[4] || facts[0]);
  const blocks = maintenance ? [
    { lead: `A ficha registra a limpeza da transmissão assim: ${cleaning}`, action: 'Separe cassete, coroas e corrente como partes do mesmo roteiro, mas não trate a descrição de uma delas como autorização para outra.', check: 'Compare a frase da fonte com o estado observado após o uso em condição adversa.', limit: 'O registro não informa prazo universal, quantidade ou resultado garantido.' },
    { lead: 'A preparação do conjunto vem antes do contato com qualquer produto', action: 'Estabilize a bicicleta, identifique o sistema e deixe o manual aberto na página do componente.', check: 'Confirme a identidade do conjunto e retire apenas o que a documentação descreve.', limit: 'Não complete lacunas com uma prática de oficina que não esteja na fonte.' },
    { lead: 'O produto citado na documentação define o alcance da limpeza', action: 'Use somente o limpador descrito e aplique a sequência de enxágue e secagem que aparece no registro.', check: 'Observe cada parte da transmissão sem misturar produtos ou atribuir compatibilidade não declarada.', limit: 'A ficha não autoriza solvente alternativo, diluição ou frequência inventada.' },
    { lead: 'A secagem encerra uma etapa antes da lubrificação', action: 'Depois do enxágue, espere a condição descrita pelo manual e só então leia a instrução da corrente.', check: 'Retire o excesso conforme o documento do produto utilizado e anote qualquer alteração percebida.', limit: 'Sem tempo ou volume registrado, o texto não cria número nem intervalo.' },
    { lead: `A orientação sobre pressão direta é esta: ${pressure}`, action: 'Mantenha o jato afastado de componentes, vedações e rolamentos e siga o método aceito pela documentação.', check: 'Examine a área atingida e registre sinais que peçam nova consulta ao manual.', limit: 'A fonte não apresenta um valor universal de pressão, distância ou duração.' },
    { lead: `A inspeção visual dos freios aparece assim na pesquisa: ${brakes}`, action: 'Observe pastilhas, rotores, comando, vazamentos e ruídos com a bicicleta parada.', check: 'Compare o conjunto com o manual e anote qualquer mudança sem convertê-la em diagnóstico.', limit: 'Uma inspeção visual não é certificado definitivo para todos os cenários.' },
    { lead: `O piso molhado pede atenção adicional porque ${wet}`, action: 'Leia a condição do piso junto das instruções de frenagem e comece qualquer retorno ao uso com cautela.', check: 'Registre a resposta dos comandos e interrompa a decisão se algo fugir do padrão documentado.', limit: 'A ficha não quantifica distância, velocidade ou força de acionamento.' },
    { lead: 'Sinais fora do padrão mudam o próximo passo', action: 'Danos, vazamentos, ruídos e comandos irregulares devem ser separados do simples roteiro de limpeza.', check: 'Preserve a identificação do componente e descreva o sintoma para a consulta seguinte.', limit: 'Não há diagnóstico remoto, troca de peça ou ajuste interno definido nesta pesquisa.' },
    { lead: `O encaminhamento profissional registrado é: ${escalation}`, action: 'Leve o histórico, o manual e a identificação da peça à loja ou ao mecânico que possa examinar o conjunto.', check: 'Explique qual etapa foi feita e qual sinal permaneceu sem resposta.', limit: 'A avaliação presencial pertence ao profissional que terá acesso à bicicleta.' },
    { lead: 'O histórico fecha o procedimento sem apagar as dúvidas', action: 'Guarde as fontes, a data de acesso, a condição do conjunto e o que foi observado em cada etapa.', check: 'Reabra os documentos antes de repetir o roteiro em outro modelo ou sistema.', limit: 'O cache curado conserva trechos oficiais, mas não substitui a revalidação futura.' },
  ] : genericBlocks(facts, { contentType, title });
  const headings = maintenance ? [
    'O registro oficial que orienta o procedimento',
    'Preparação do conjunto antes da limpeza',
    'Produto, enxágue e limite de compatibilidade',
    'Secagem e lubrificação sem preencher lacunas',
    'Por que a pressão direta fica fora do roteiro',
    'Inspeção dos freios com a bicicleta parada',
    'Leitura do piso molhado e retorno ao uso',
    'Sinais que pedem pausa e nova consulta',
    'Quando levar o conjunto para avaliação',
    'Revalidação editorial antes do próximo pedal',
  ] : contentType === 'comparativo' ? [
    'Escopo e identificacao dos modelos',
    'Como separar as fichas consultadas',
    'Quadro e geometria registrados',
    'Suspensao e campos de ajuste',
    'Transmissao descrita nas fontes',
    'Freios, rodas e pneus',
    'Campos comuns e campos exclusivos',
    'Diferencas que podem ser auditadas',
    'Lacunas que permanecem abertas',
    'Checklist para revalidar a comparacao',
  ] : [
    'Identidade e escopo da ficha',
    'Como conferir o modelo consultado',
    'Quadro e materiais localizados',
    'Suspensao e componentes descritos',
    'Transmissao e montagem registrada',
    'Freios, rodas e pneus informados',
    'Tamanhos, cores e campos comuns',
    'O que a documentacao nao responde',
    'Limites de uma leitura sem teste',
    'Revalidacao antes de qualquer decisao',
  ];
  const sections = blocks.map((block, index) => ({
    heading: headings[index],
    content: maintenance ? sectionContentLegacy(block) : sectionContent(block, index),
  }));
  const description = 'Método documental para limpar a transmissão após chuva e lama, inspecionar freios e reconhecer limites antes de voltar a pedalar.';
  const directAnswer = 'Use apenas o limpador documentado, enxágue e seque a transmissão, evite jato direto, confira pastilhas e rotores e interrompa o uso se houver dano, vazamento ou funcionamento irregular.';
  const articleDescription = maintenance
    ? description
    : `Leitura documental de ${title.slice(0, 100)}, organizada por registros oficiais, limites e lacunas que precisam permanecer visiveis.`;
  const articleDirectAnswer = maintenance
    ? directAnswer
    : 'Use esta ficha como roteiro documental: confronte cada dado com a fonte oficial, registre lacunas e nao trate a leitura como teste presencial ou promessa de desempenho.';
  const faq = maintenance
    ? [
      { question: 'Posso usar jato de alta pressão na transmissão depois da chuva?', answer: 'Não. A orientação confirmada é evitar pressão direta para proteger componentes, vedações e rolamentos; consulte o manual para completar o procedimento do conjunto instalado.' },
      { question: 'O que deve ser conferido antes de voltar a pedalar?', answer: 'Confira a limpeza e a secagem da transmissão, o estado de pastilhas e rotores, o funcionamento dos freios e qualquer sinal de dano, vazamento ou ruído anormal.' },
    ]
    : [
      { question: 'Como usar esta ficha técnica sem extrapolar os dados?', answer: 'Leia cada registro junto da fonte oficial, confirme a identificação do item e mantenha como lacuna tudo o que não estiver explicitamente documentado.' },
      { question: 'A leitura documental substitui um teste presencial?', answer: 'Não. O artigo organiza dados rastreáveis e limites de consulta; a decisão final deve considerar a documentação específica e a avaliação apropriada.' },
    ];
  const methodologyNotice = maintenance
    ? 'Como este artigo foi produzido: análise documental baseada em orientações oficiais e trechos rastreáveis. A equipe não realizou teste presencial.'
    : 'Como este artigo foi produzido: leitura documental de fontes oficiais e registros rastreáveis. A equipe não realizou teste presencial.';
  return {
    editorial_format: 'full-article-v1',
    title: title.slice(0, 120),
    description: articleDescription,
    direct_answer: articleDirectAnswer,
    faq,
    slug: slugFor(title),
    category: CATEGORY_BY_CONTENT_TYPE[contentType] || 'guia-tecnico',
    content_type: contentType === 'guia-tecnico' ? 'guia-tecnico' : contentType,
    audience_segment: 'core_technical_cyclists',
    audience_intent: 'solve_problem',
    experience_level_target: 'intermediate_advanced',
    review_method: 'desk-research',
    tested_by_thebikerblog: false,
    methodologyNotice,
    brand: '',
    product_name: '',
    market: String(researchData?.market || 'Brasil'),
    weight: 'Não informado',
    weight_source: 'Não informado',
    price_min: 0,
    price_max: 0,
    price_currency: 'BRL',
    affiliate_links: false,
    editorial_scope: 'portfolio',
    promoted_brands: ['TheBiker'],
    context_only_brands: [],
    portfolio_evidence_url: String(researchData?.portfolio_evidence_url || 'https://thebikershop.com.br/componentes/'),
    portfolio_verified_at: String(researchData?.portfolio_verified_at || today),
    tags: maintenance ? ['ciclismo', 'guia-tecnico', 'manutencao'] : ['ciclismo', 'dados', 'ficha-tecnica'],
    sections,
    imagePlan: [{
      position: 'hero',
      purpose: 'Capa técnica para orientar a leitura do método de limpeza e inspeção.',
      assetType: 'technical-diagram',
      editorialUse: 'publishable',
      factualSubject: 'conceptual',
      brief: 'Diagrama editorial abstrato de transmissão e inspeção, sem representar produto exato.',
      sourceRequired: true,
      avoid: ['produto inventado', 'marca concorrente em destaque', 'texto embutido'],
      aspectRatio: '16:9',
      altSuggestion: 'Capa técnica sobre limpeza e inspeção de transmissão de bicicleta',
      allowedSource: 'own-photo',
      aiGeneratedAllowed: false,
    }],
    claimsRequiringReview: [],
    sources,
    frontmatter: {
      author: 'Equipe TheBiker',
      image: '',
      thumbnail: '',
      image_alt: 'Capa técnica sobre limpeza e inspeção da transmissão',
      image_caption: 'Capa técnica produzida para o guia editorial.',
      image_credit: 'TheBiker',
      image_license: 'Uso editorial da TheBiker',
    },
  };
}
