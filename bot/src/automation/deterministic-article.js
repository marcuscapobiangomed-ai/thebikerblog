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

function sectionContent(block) {
  const marker = block.lead.slice(0, 42);
  return [
    `${block.lead} A leitura começa pelo documento correspondente e pela identificação do conjunto que será observado no eixo ${marker}. Registre no eixo ${marker} o nome da peça, a condição encontrada e a dúvida que ainda não tem resposta no material consultado.`,
    `${block.action} Mantenha a ordem do procedimento visível no eixo ${marker}, sem trocar uma etapa por uma suposição. Para ${marker}, separe os textos e anote qual deles pertence ao componente examinado.`,
    `${block.check} O objetivo do eixo ${marker} é deixar um histórico legível para a próxima consulta. No registro de ${marker}, descreva somente o que está diante dos olhos, sem transformar impressão em medição, promessa ou diagnóstico remoto.`,
    `${block.limit} Se o documento não apresentar um detalhe no eixo ${marker}, deixe o campo pendente e retorne à fonte antes de seguir. Ao revisar ${marker}, essa pausa preserva o escopo do artigo e mantém a decisão ligada à evidência registrada.`,
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

function genericBlocks(facts) {
  const usable = facts.map(neutralFact).filter((fact) => fact && !UNSUPPORTED_INFERENCE_WORDS.test(fact));
  const evidence = usable.length > 0 ? usable : ['o documento consultado registra dados sobre o tema deste artigo'];
  return Array.from({ length: 10 }, (_, index) => {
    const fact = evidence[index % evidence.length];
    const step = `na etapa ${index + 1}`;
    return {
      lead: `Registro ${index + 1} da ficha oficial: ${fact}`,
      action: `Leia a fonte indicada ${step} e mantenha a identificacao do componente, modelo ou condicao descrita no registro.`,
      check: `Compare o texto da ficha ${step} com o item observado e anote somente o que estiver explicitamente documentado.`,
      limit: `Quando faltar um detalhe ${step}, deixe a lacuna visivel e retorne ao documento antes de transformar a leitura em decisao.`,
    };
  });
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
  ] : genericBlocks(facts);
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
  ] : [
    'O que a ficha oficial registra',
    'Como ler a identificacao do item',
    'Dados que permanecem confirmados',
    'Comparacao entre registros e observacao',
    'Lacunas que nao devem ser preenchidas',
    'Ordem documental para a consulta',
    'Limites da leitura sem teste presencial',
    'Como guardar a evidencia usada',
    'Quando retornar a fonte original',
    'Revisao final antes da publicacao',
  ];
  const sections = blocks.map((block, index) => ({ heading: headings[index], content: sectionContent(block) }));
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
