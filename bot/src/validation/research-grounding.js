function text(value) {
  return String(value ?? "").trim();
}

function factEntries(research) {
  const facts = research?.confirmed_facts;
  if (Array.isArray(facts)) return facts;
  if (facts && typeof facts === "object") return Object.values(facts);
  return [];
}

function factReferences(fact) {
  if (!fact || typeof fact !== "object") return [];
  const values = [
    fact.source_id,
    fact.sourceId,
    fact.source,
    ...(Array.isArray(fact.source_ids) ? fact.source_ids : []),
    ...(Array.isArray(fact.sourceIds) ? fact.sourceIds : []),
  ];
  return [...new Set(values.map(text).filter(Boolean))];
}

export function researchGroundingErrors(research, { requireFactReferences = false } = {}) {
  if (!research || research.status !== "pesquisa_concluida") return [];
  const errors = [];
  const sources = Array.isArray(research.sources) ? research.sources : [];
  const sourceIds = sources.map((source) => text(source?.id)).filter(Boolean);
  const sourceNames = sources.map((source) => text(source?.name)).filter(Boolean);
  const knownReferences = new Set([...sourceIds, ...sourceNames]);

  if (sources.length === 0) errors.push("pesquisa concluída sem fontes rastreáveis");
  if (requireFactReferences && sourceIds.length !== sources.length) {
    errors.push("todas as fontes precisam de ID único para rastreabilidade");
  }
  if (new Set(sourceIds).size !== sourceIds.length) errors.push("IDs de fontes duplicados");
  if (research.grounding?.sourceCount !== undefined
      && Number(research.grounding.sourceCount) !== sources.length) {
    errors.push(`grounding.sourceCount=${research.grounding.sourceCount} diverge de sources.length=${sources.length}`);
  }

  const facts = factEntries(research);
  for (const [index, fact] of facts.entries()) {
    const references = factReferences(fact);
    if (requireFactReferences && references.length === 0) {
      errors.push(`fato ${index + 1} sem referência explícita`);
      continue;
    }
    for (const reference of references) {
      if (!knownReferences.has(reference)) errors.push(`fato ${index + 1} referencia fonte inexistente: ${reference}`);
    }
  }
  return errors;
}

export function assertResearchGrounding(research, options) {
  const errors = researchGroundingErrors(research, options);
  if (errors.length > 0) throw new Error(`Pesquisa bloqueada por integridade de fontes: ${errors.join("; ")}`);
  return research;
}
