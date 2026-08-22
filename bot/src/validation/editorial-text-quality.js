const MOJIBAKE = /(?:Ã[-¿]|Â[-¿]|â€|�)/u;

const PLACEHOLDER_PATTERNS = [
  /o segundo modelo listado na pesquisa/iu,
  /o documento consultado registra dados sobre o tema/iu,
  /\b(?:primeira|segunda) ficha (?:nomeia|registra)\b/iu,
  /\bEste ficha\b/u,
];

const INTERNAL_INSTRUCTION_PATTERNS = [
  /\bComece pela p[aá]gina oficial\b/iu,
  /\bAbra o registro de identidade\b/iu,
  /\b(?:anote|copie|guarde) (?:qual fonte|a grafia|URLs?)/iu,
  /\bAo redigir a tabela final\b/iu,
  /\bUse esta se[cç][aã]o como lista de libera[cç][aã]o editorial\b/iu,
  /\bplanilha de consulta\b/iu,
  /\b(?:comece|abra|anote|registre|confronte|confira|verifique|consulte|copie|guarde|separe|use)\b[^.!?\n]{0,120}\b(?:fontes?|fichas?|registros?|documentos?|URLs?|data de acesso|pesquisa|planilha)\b/iu,
];

const PROCESS_HEADINGS = /^(?:identidade e escopo da ficha|como (?:conferir|validar|consultar|separar) .*(?:ficha|fonte|registro|documento)|revalida[cç][aã]o antes de qualquer decis[aã]o|lacunas? (?:que permanecem )?abertas?|checklist para revalidar|como separar as fichas consultadas|metodologia(?: da pesquisa)?|processo editorial|trilha documental)$/iu;

const METHOD_ONLY_DIRECT_ANSWER = /^(?:Use esta ficha como roteiro documental|Leia cada registro junto da fonte oficial|Confronte cada dado com a fonte oficial)/iu;

const PUBLIC_BACKSTAGE_DISCLOSURE = [
  /\bcomo este artigo foi produzido\b/iu,
  /\b(?:conte[uú]do|artigo|texto) (?:elaborado|produzido|gerado|escrito) com (?:o )?aux[ií]lio (?:de|da) (?:ia|intelig[eê]ncia artificial)\b/iu,
  /\b(?:a equipe|n[oó]s) n[aã]o (?:realizou|realizamos) (?:um )?teste presencial\b/iu,
  /\b(?:o produto|a bicicleta|a bike|este modelo) n[aã]o foi testad[oa](?: presencialmente)? (?:pela|por nossa) equipe\b/iu,
  /\b(?:esta|este artigo) (?:é|e) (?:uma )?an[aá]lise documental\b/iu,
  /\bleitura documental de fontes\b/iu,
];

const PUBLIC_SOURCE_CONFLICT = [
  /\b(?:diverg[eê]ncias?|inconsist[eê]ncias?)\b/iu,
  /\b(?:diverg[eê]ncias?|inconsist[eê]ncias?|conflitos?) (?:entre|nas?|de) (?:as? )?(?:fontes|fichas|p[aá]ginas|cadastros?|especifica[cç][oõ]es)\b/iu,
  /\b(?:a loja|o fabricante) informa\b[^.!?]{0,180}\b(?:enquanto|mas)\b[^.!?]{0,180}\b(?:a loja|o fabricante)\b/iu,
  /\b(?:adotamos|esta an[aá]lise adota) (?:a ficha|o valor|a especifica[cç][aã]o) do fabricante\b/iu,
  /\b(?:as? informa[cç][oõ]es|os valores|as especifica[cç][oõ]es) (?:n[aã]o coincidem|divergem|s[aã]o diferentes)\b/iu,
  /\buma (?:fonte|ficha|p[aá]gina)\b[^.!?]{0,180}\b(?:outra|enquanto)\b[^.!?]{0,180}\b(?:fonte|ficha|p[aá]gina)\b/iu,
  /\b(?:segundo|conforme) (?:a )?(?:loja|revendedor|marketplace)\b[^.!?]{0,180}\b(?:segundo|conforme) (?:o )?fabricante\b/iu,
  /\b(?:a |o )?(?:loja|revendedor|marketplace)\b[^.!?]{0,180}\b(?:corrig(?:e|iu|ido)|desment(?:e|iu)|contradiz)\b/iu,
];

const UNSUPPORTED_CERTAINTY = [
  /\b(?:garante|comprova|assegura)\b[^.!?]{0,100}\b(?:desempenho|durabilidade|seguran[cç]a|conforto|efici[eê]ncia|resist[eê]ncia)\b/iu,
  /\b(?:nunca|sempre)\b[^.!?]{0,100}\b(?:falha|quebra|desgasta|escorrega|perde|mant[eé]m)\b/iu,
  /\b(?:sem risco|risco zero|100% seguro|totalmente seguro)\b/iu,
];

const PROCESS_VOCABULARY = /\b(?:documental|documenta[cç][aã]o|documentos?|fontes?|registros?|pesquisa|fichas?|consulta(?:da|do|das|dos|r)?|lacunas?|rastre[aá]ve(?:l|is)|trilha documental|data de acesso|revalid(?:ar|a[cç][aã]o|ado|ada))\b/giu;
const PROCESS_OPENING = /^(?:a fonte|as fontes|o registro|os registros|a ficha|as fichas|a pesquisa|o documento|a documenta[cç][aã]o)\b/iu;
const BACKSTAGE_PRODUCT_BRIEF = [
  /\b(?:roteiro|checklist|resumo|leitura|an[aá]lise|compara[cç][aã]o) (?:t[eé]cnic[ao] )?documental\b/iu,
  /\bcomo ler (?:a |uma )?ficha\b/iu,
  /\bo que (?:a |uma )?ficha\b[^.!?]{0,80}\bpermite afirmar\b/iu,
  /\b(?:fontes?|registros?) (?:atuais?|aceit[ao]s?|recuperad[ao]s?|rastre[aá]ve(?:l|is))\b/iu,
  /\b(?:sem extrapolar|al[eé]m do que (?:est[aá] )?rastreado|lacunas? documentais?)\b/iu,
];

const COMMON_UNACCENTED_PT_BR = /\b(?:nao|pagina|titulo|preco|tambem|secao|comparacao|tecnica|tecnico|transmissao|suspensao|documentacao|identificacao|especificacao|afirmacao|evidencia|codigo|proxima|historico|revalidacao|decisao|descricao|informacao|configuracao|avaliacao|medicao|versao|caracteristica|diferenca|ausencia|referencia|pratica|pressao|potencia|seguranca)\b/giu;

function readableText(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/`[^`]*`/gu, " ");
}

function processLanguageErrors(value) {
  const paragraphs = String(value || "")
    .split(/\n\s*\n/gu)
    .map((paragraph) => readableText(paragraph).replace(/^#+\s*/u, "").trim())
    .filter((paragraph) => paragraph.length >= 45 && !/^[-*]\s/u.test(paragraph));
  const allTerms = paragraphs.flatMap((paragraph) => paragraph.match(PROCESS_VOCABULARY) || []);
  const words = paragraphs.join(" ").match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || [];
  const processDominant = paragraphs.filter((paragraph) => (paragraph.match(PROCESS_VOCABULARY) || []).length >= 4);
  const backstageOpenings = paragraphs.filter((paragraph) => PROCESS_OPENING.test(paragraph));
  const errors = [];
  if (processDominant.length >= 2 || (allTerms.length >= 14 && allTerms.length * 1000 / Math.max(words.length, 1) >= 12)) {
    errors.push("texto dominado por bastidores de pesquisa, documentação ou conferência");
  }
  if (backstageOpenings.length >= 3) {
    errors.push("parágrafos repetem aberturas burocráticas sobre fontes, fichas ou registros");
  }
  return errors;
}

export function editorialBriefQualityErrors({ title = "", summary = "", category = "" }) {
  if (!["review", "comparativo", "lancamentos", "lancamento"].includes(String(category))) return [];
  const value = readableText(`${title}\n${summary}`);
  return BACKSTAGE_PRODUCT_BRIEF.some((pattern) => pattern.test(value))
    ? ["pauta de produto descreve bastidores documentais em vez do produto e da decisão do leitor"]
    : [];
}

export function editorialTextQualityErrors({ body, contentType = "", directAnswer = "", title = "", description = "", headings = [] }) {
  const errors = [];
  const text = readableText(body);
  const metadata = readableText(`${title}\n${description}\n${directAnswer}`);
  const publicText = `${metadata}\n${text}`;

  const backstageDisclosure = PUBLIC_BACKSTAGE_DISCLOSURE.find((pattern) => pattern.test(publicText));
  if (backstageDisclosure) {
    errors.push(`disclosure de bastidor editorial exposto ao leitor: ${publicText.match(backstageDisclosure)?.[0]}`);
  }

  const placeholder = PLACEHOLDER_PATTERNS.find((pattern) => pattern.test(publicText));
  if (placeholder) errors.push(`placeholder ou erro gramatical publicado: ${publicText.match(placeholder)?.[0]}`);

  if (MOJIBAKE.test(publicText)) {
    errors.push("texto com caracteres corrompidos (mojibake)");
  }

  const unaccented = text.match(COMMON_UNACCENTED_PT_BR) || [];
  if (unaccented.length >= 4) {
    const samples = [...new Set(unaccented.map((token) => token.toLocaleLowerCase("pt-BR")))].slice(0, 6);
    errors.push(`português sem acentuação: ${samples.join(", ")}`);
  }

  const internalInstructions = INTERNAL_INSTRUCTION_PATTERNS
    .map((pattern) => publicText.match(pattern)?.[0])
    .filter(Boolean);
  if (internalInstructions.length >= 1) {
    errors.push(`instrução interna exposta ao leitor: ${internalInstructions[0]}`);
  }
  errors.push(...processLanguageErrors(text));

  const processHeading = headings.find((heading) => PROCESS_HEADINGS.test(String(heading || "").trim()));
  if (processHeading) errors.push(`intertítulo de processo editorial: ${processHeading}`);

  if (METHOD_ONLY_DIRECT_ANSWER.test(String(directAnswer || "").replace(/^['"]|['"]$/g, "").trim())) {
    errors.push("resposta direta descreve o processo editorial, não o produto ou a decisão do leitor");
  }

  if (["review", "comparativo", "guia-de-compra", "lancamento"].includes(String(contentType))) {
    const sourceConflict = PUBLIC_SOURCE_CONFLICT.find((pattern) => pattern.test(publicText));
    if (sourceConflict) errors.push("conflito entre fontes exposto no conteúdo público; aplique internamente a precedência do fabricante");

    const certainty = UNSUPPORTED_CERTAINTY.find((pattern) => pattern.test(publicText));
    if (certainty) errors.push(`alegação absoluta de desempenho ou segurança: ${publicText.match(certainty)?.[0]}`);
  }

  return errors;
}
