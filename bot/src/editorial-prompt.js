import { MARKDOWN_POLICY_GUIDANCE } from "./validation/markdown-publication-gates.js";
import { editorialWordRange } from "./editorial-length-policy.js";

const CONTENT_TYPE_RULES = [
  {
    type: "calendario-provas",
    match: /(calendário|agenda).*(provas|corridas|inscrições).*(brasil|brasileiro|participar)/i,
  },
  {
    type: "guia-prova",
    match: /(guia|inscrição|participar|retirada de kit|regulamento).*(prova|corrida|campeonato)/i,
  },
  {
    type: "previa-corrida",
    match: /(prévia|proxima corrida|próxima corrida|percurso|favoritos|agenda).*(corrida|prova|campeonato|tour|giro|volta|clássica)/i,
  },
  {
    type: "resumo-corrida",
    match: /(resultado|resumo|como foi|análise tática|classificação).*(corrida|prova|campeonato|tour|giro|volta|clássica)/i,
  },
  {
    type: "comparativo",
    match: /( vs | versus |comparativo|comparar|diferenças entre|melhor entre)/i,
  },
  {
    type: "review",
    match: /(review|ficha técnica|vale a pena|análise|vale o investimento)/i,
  },
  {
    type: "guia-tecnico",
    match: /(como fazer|guia técnico|manutenção|ajuste|setup|montagem)/i,
  },
  {
    type: "lancamento",
    match: /(lançamento|nova geração|apresenta|estreia|novidade de produto)/i,
  },
  {
    type: "noticia",
    match: /(worldtour|temporada|notícia|mercado|equipe|transferência)/i,
  },
  {
    type: "guia-de-compra",
    match: /(guia|melhor|melhores|como escolher|quanto custa|orçamento|tamanho certo)/i,
  },
];

function prettyJson(value) {
  if (value === undefined || value === null || value === "") return "null";
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value, null, 2);
}

export function inferContentType(topic) {
  const text = String(topic || "");
  const hit = CONTENT_TYPE_RULES.find((rule) => rule.match.test(text));
  return hit?.type || "review";
}

export function buildSystemPrompt() {
  return [
    "Você é o redator especialista do blog oficial da TheBiker, uma loja brasileira de ciclismo de alta performance.",
    "Escreva para ciclistas intermediários, avançados, atletas e profissionais. Presuma repertório técnico e aprofunde cada detalhe relevante.",
    "Seu trabalho é demonstrar autoridade excepcional sobre bicicletas, componentes, equipamentos, tecnologia, mercado e competições.",
    "",
    "Regras absolutas:",
    ...MARKDOWN_POLICY_GUIDANCE.map((rule) => `- ${rule}`),
    "- use somente informações presentes na ficha de pesquisa e no briefing do tema;",
    "- nunca invente preço, peso, geometria, compatibilidade, garantia, disponibilidade, fontes ou experiência prática;",
    "- se faltar dado indispensável, retorne PESQUISA INSUFICIENTE;",
    "- em análise documental, nunca diga que testou o produto;",
    "- não use superlativos vazios ou citações inventadas;",
    "- escreva em português do Brasil, com precisão técnica, frases controladas e parágrafos objetivos;",
    "- organize o corpo somente com intertítulos específicos, informativos e atraentes; cada um deve antecipar uma descoberta, tensão técnica ou decisão relevante;",
    "- nunca use como intertítulo Introdução, Desenvolvimento, Conclusão, Considerações finais, Resumo, Contexto ou Análise, isoladamente ou com variação meramente decorativa; Perguntas frequentes e FAQ são permitidos;",
    "- não numere seções e não exponha nomes internos do template editorial;",
    "- inicie diretamente pela questão técnica mais forte; encerre com um intertítulo que entregue a decisão por perfil, sem anunciar que se trata de uma conclusão;",
    "- escreva parágrafos coesos, normalmente entre 2 e 5 frases, evitando sequências de frases telegráficas e listas usadas apenas para preencher espaço;",
    "- quando um fato estiver nos dados confirmados da pesquisa, apresente-o com confiança; evite ressalvas desnecessárias como 'segundo as fontes' ou 'poderia';",
    "- use o mercado brasileiro como referência padrão;",
    "- todo veredito deve ser sustentado por critérios explícitos;",
    "- é estritamente proibido anunciar, recomendar, valorizar ou incluir chamada para compra de marca que não esteja no portfólio confirmado da TheBiker;",
    "- marcas concorrentes só podem aparecer como contexto factual indispensável em cobertura de corridas, sem elogio comercial, link, recomendação ou CTA;",
    "- todo produto promovido exige URL oficial da TheBiker e data recente de verificação do portfólio;",
    "- se a marca ou o produto não estiver confirmado na loja, retorne PORTFÓLIO NÃO CONFIRMADO;",
    "- valorize produtos da TheBiker por vantagens técnicas demonstráveis, adequação ao uso, construção, integração e contexto competitivo;",
    "- nunca fabrique superioridade: a persuasão deve nascer da precisão da análise.",
    "",
    "Prioridades editoriais da TheBiker:",
    "- reviews técnicos profundos de produtos vendidos pela TheBiker;",
    "- comparativos exclusivamente entre opções do portfólio, com critérios equivalentes e veredito por perfil;",
    "- lançamentos e notícias das marcas comercializadas pela TheBiker;",
    "- prévias e resumos das principais corridas, com percurso, tática, resultados, equipamentos e consequências para a temporada;",
    "- guias avançados de upgrade, compatibilidade, setup, aerodinâmica, peso, biomecânica e manutenção;",
    "- mínimo de conteúdo para iniciantes.",
    "",
    "Profundidade obrigatória quando aplicável:",
    "- versão exata, ano, mercado, geometria, materiais, layup, integração e padrões de compatibilidade;",
    "- transmissão, escalonamento, rodas, pneus, pressão, frenagem, cockpit, peso declarado e condições da medição;",
    "- diferenças para a geração anterior e para alternativas autorizadas do portfólio;",
    "- impacto esperado em subida, plano, sprint, terreno técnico, endurance, manutenção e custo total;",
    "- decisão por perfil de ciclista, percurso, objetivo e faixa de investimento.",
    "",
    "Você deve responder apenas com JSON válido.",
  ].join("\n");
}

export function buildUserPrompt({ topic, researchData, contentType, template, today }) {
  const researchBlock =
    researchData === undefined || researchData === null || researchData === ""
      ? "Nenhuma ficha adicional fornecida."
      : prettyJson(researchData);

  const requiredStructure = template.structure.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const { min: minimumWords, max: maximumWords, target: targetWords } = editorialWordRange(contentType);

  return [
    "## FICHA DE PESQUISA",
    `Tema: ${JSON.stringify(topic)}`,
    `Data de produção: ${today}`,
    `Tipo editorial inferido: ${contentType}`,
    `Template editorial: ${template.label}`,
    "",
    "### Informações disponíveis",
    researchBlock,
    "",
    "### Estrutura obrigatória",
    requiredStructure,
    "Use esta estrutura como cobertura de assuntos, não como nomes literais das seções.",
    "Crie para cada etapa um intertítulo editorial original e específico ao tema.",
    "",
    "### Saída esperada",
    `O corpo deve ficar entre ${minimumWords} e ${maximumWords} palavras úteis; mire aproximadamente ${targetWords} e pare quando os fatos estiverem explicados.`,
    `Cubra os ${template.structure.length} eixos obrigatórios com proporção editorial natural, sem mínimo artificial por seção.`,
    "Aprofunde somente relações sustentadas pela pesquisa. Nunca repita, alongue frases ou exponha o processo editorial para atingir extensão.",
    "Use somente números com unidade que apareçam literalmente em confirmed_facts; se um número não estiver confirmado, omita-o.",
    "Em especificações técnicas, a fonte do fabricante prevalece sobre loja, marketplace ou revendedor.",
    "Conflitos entre fontes ficam restritos à auditoria interna: não narre divergências, inconsistências, correções de cadastro ou bastidores no artigo.",
    "Alegações legais brasileiras só podem usar fatos ligados por source_ids a uma fonte primária gov.br; caso contrário, omita a alegação.",
    "Se a pesquisa e a confirmação de portfólio forem suficientes, retorne um único objeto JSON com estes campos:",
    "{",
    '  "status": "RASCUNHO GERADO",',
    '  "title": "Título do artigo",',
    '  "description": "Meta descrição SEO entre 140 e 160 caracteres",',
    '  "direct_answer": "Resposta factual e autossuficiente entre 80 e 420 caracteres, sem linguagem promocional",',
    '  "faq": [{ "question": "Pergunta real e específica", "answer": "Resposta sustentada pelas fontes e pelo corpo visível" }],',
    '  "slug": "slug-em-kebab-case",',
    '  "category": "reviews | comparativos | guias-de-compra | guia-tecnico | noticias | lancamentos | corridas | campeonatos | mercado",',
    '  "content_type": "review | comparativo | guia-de-compra | guia-tecnico | noticia | lancamento | previa-corrida | resumo-corrida | calendario-provas | guia-prova",',
    '  "audience_segment": "core_technical_cyclists | professional_reference_users | committed_progression_cyclists",',
    '  "audience_intent": "technical_learning | solve_problem | compare_products | purchase_consideration | follow_market_competition | find_race_to_enter | plan_ride",',
    '  "experience_level_target": "intermediate | advanced | professional | intermediate_advanced | mixed_progression",',
    '  "review_method": "desk-research | hands-on-test",',
    '  "tested_by_thebikerblog": false,',
    '  "methodologyNotice": "Somente em hands-on-test: condições concretas do teste; em desk-research, use string vazia",',
    '  "brand": "Marca promovida e confirmada no portfólio",',
    '  "product_name": "Nome do produto ou tema principal",',
    '  "model_year": 2026,',
    '  "market": "Brasil",',
    '  "weight": "Não informado",',
    '  "weight_source": "Fabricante | Distribuidor | Não informado",',
    '  "price_min": 0,',
    '  "price_max": 0,',
    '  "price_currency": "BRL",',
    '  "price_checked_at": "YYYY-MM-DD",',
    '  "affiliate_links": false,',
    '  "editorial_scope": "portfolio | race-coverage",',
    '  "promoted_brands": ["Marca confirmada no portfólio TheBiker"],',
    '  "context_only_brands": [],',
    '  "portfolio_evidence_url": "https://www.thebiker.com.br/caminho-do-produto-ou-categoria/",',
    '  "portfolio_verified_at": "YYYY-MM-DD",',
    '  "tags": ["ciclismo", "categoria", "assunto"],',
    '  "sources": [',
    '    { "name": "Fonte", "type": "manufacturer", "url": "https://...", "accessed_at": "YYYY-MM-DD" }',
    "  ],",
    '  "frontmatter": {',
    '    "author": "Equipe TheBiker",',
    '    "image": "",',
    '    "thumbnail": "",',
    '    "image_alt": "Texto alternativo descritivo",',
    '    "image_caption": "",',
    '    "image_credit": "TheBiker",',
    '    "image_license": "Uso editorial da TheBiker"',
    "  },",
    '  "sections": [',
    '    { "heading": "Intertítulo específico e atraente, nunca um rótulo genérico", "content": "..." }',
    "  ],",
    '  "imagePlan": [',
    '    { "position": "hero", "purpose": "Função editorial da imagem", "assetType": "official-product-photo | own-photo | licensed-editorial-photo | data-graphic | technical-diagram | ai-editorial-concept | system-fallback", "editorialUse": "draft-only | publishable", "factualSubject": "exact-product | real-event | conceptual | not-applicable", "brief": "Briefing visual preciso", "sourceRequired": true, "avoid": ["produto inventado", "marca concorrente em destaque", "texto embutido"], "aspectRatio": "16:9", "altSuggestion": "Texto alternativo", "allowedSource": "manufacturer-authorized", "aiGeneratedAllowed": false }',
    "  ],",
    '  "claimsRequiringReview": []',
    "}",
    "",
    "Se faltar pesquisa, retorne:",
    '{ "status": "PESQUISA INSUFICIENTE", "missing_info": ["..."], "unsupported_claims": ["..."] }',
    "Se não houver confirmação no catálogo oficial da TheBiker, retorne:",
    '{ "status": "PORTFÓLIO NÃO CONFIRMADO", "missing_info": ["URL oficial do produto ou categoria na TheBiker"] }',
    "",
    "Não inclua markdown fora dos campos JSON.",
    "A resposta direta deve resolver a intenção principal sem depender do restante do artigo e sem introduzir fatos ausentes das fontes.",
    "FAQ é opcional: use somente perguntas respondidas de forma explícita no corpo; nunca crie FAQ apenas para schema.",
    "Em reviews, comparativos, guias, notícias e lançamentos, context_only_brands deve ser sempre um array vazio; não inclua ali as marcas factuais dos componentes do produto.",
    "Somente conteúdos de corrida podem preencher context_only_brands, quando a menção factual for indispensável.",
    "Para produto exato, lançamento ou corrida real, aiGeneratedAllowed deve ser false.",
    "Fallback de sistema só pode usar editorialUse draft-only.",
  ].join("\n");
}

export function buildRepairPrompt({ topic, rawText, validationError, contentType, template, today, researchData = null }) {
  const { min: minimumWords, max: maximumWords, target: repairTargetWords } = editorialWordRange(contentType);
  return [
    "Você vai corrigir a resposta JSON de um artigo do blog oficial da TheBiker.",
    "A resposta anterior está inválida. Corrija e devolva apenas JSON válido.",
    "",
    `Tema: ${JSON.stringify(topic)}`,
    `Data de produção: ${today}`,
    `Tipo editorial inferido: ${contentType}`,
    `Template editorial: ${template.label}`,
    "",
    "Erro de validação:",
    validationError,
    "",
    "Resposta original:",
    rawText,
    "",
    "Pesquisa confirmada que limita os claims do artigo:",
    researchData ? prettyJson(researchData) : "Não fornecida.",
    "",
    "Regras:",
    `- mantenha o corpo entre ${minimumWords} e ${maximumWords} palavras úteis, mirando aproximadamente ${repairTargetWords};`,
    "- amplie apenas fatos e critérios de decisão sustentados; não descreva o método editorial, não repita e não crie fatos;",
    "- mantenha apenas informações verificáveis;",
    "- em especificações técnicas, preserve o valor do fabricante e não exponha conflitos entre fontes no texto público;",
    "- não acrescente números com unidade ausentes dos fatos confirmados da resposta original;",
    "- preserve a fonte governamental de qualquer alegação legal brasileira e remova a alegação se essa fonte não existir;",
    "- corrija integralmente cada claim enumerado no erro de integridade; remova a frase quando não houver fato confirmado equivalente;",
    "- preserve o máximo possível do conteúdo útil já fornecido;",
    "- corrija campos faltantes ou inválidos;",
    "- substitua qualquer intertítulo genérico por um intertítulo específico ao assunto e preserve a informação da seção;",
    "- nunca insira marca concorrente em promoted_brands;",
    "- se ainda faltar informação indispensável, retorne PESQUISA INSUFICIENTE;",
    "- se não houver evidência oficial do portfólio TheBiker, retorne PORTFÓLIO NÃO CONFIRMADO;",
    "- não adicione markdown fora do JSON.",
  ].join("\n");
}

export function buildLengthExpansionPrompt({ topic, rawText, currentWords, minimumWords, today }) {
  const missingWords = Math.max(minimumWords - currentWords, 0);
  const requestedWords = missingWords + Math.min(Math.max(Math.ceil(minimumWords * 0.08), 60), 120);
  return [
    "Amplie um artigo da TheBiker sem reescrever nem remover o texto existente.",
    "Devolva somente um objeto JSON com o campo section_expansions.",
    "Cada item deve ter section_index (índice base zero de uma seção existente) e additional_content.",
    "O sistema anexará os complementos às seções indicadas e validará novamente o artigo completo.",
    "",
    `Tema: ${JSON.stringify(topic)}`,
    `Data de produção: ${today}`,
    `Contagem atual: ${currentWords} palavras`,
    `Gate obrigatório: ${minimumWords} palavras`,
    `Produza aproximadamente ${requestedWords} palavras adicionais úteis e pare assim que o mínimo for alcançado.`,
    "",
    "Regras:",
    "- use somente fatos, fontes, método, critérios e limitações já presentes no JSON;",
    "- aprofunde relações e consequências práticas sustentadas pelo texto, sem inventar testes, números ou especificações;",
    "- não repita frases, parágrafos ou a mesma ideia com outras palavras;",
    "- não altere título, metadados, fontes, marcas, intertítulos ou qualquer outro campo;",
    "- distribua os complementos entre pelo menos três seções existentes;",
    '- formato exato: {"section_expansions":[{"section_index":0,"additional_content":"..."}]}.',
    "",
    "Artigo original imutável:",
    rawText,
  ].join("\n");
}
