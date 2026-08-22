function text(value) {
  return String(value || "").trim();
}

function factKey(fact) {
  return text(fact?.fact || fact?.statement).split(":", 1)[0].trim().toLocaleLowerCase("pt-BR");
}

function factReferences(fact) {
  return Array.isArray(fact?.source_ids) ? fact.source_ids.map(text).filter(Boolean) : [];
}

function internalConflictRecord(fact) {
  return /^(?:sourceconflict|source_conflict|conflict)./iu.test(factKey(fact));
}

export function researchForPublication(research) {
  if (!research || typeof research !== "object") return research;
  const sources = Array.isArray(research.sources) ? research.sources : [];
  const manufacturerIds = new Set(
    sources
      .filter((source) => ["manufacturer", "fabricante"].includes(text(source?.type).toLocaleLowerCase("pt-BR")))
      .map((source) => text(source.id))
      .filter(Boolean),
  );
  const facts = (Array.isArray(research.confirmed_facts) ? research.confirmed_facts : [])
    .filter((fact) => !internalConflictRecord(fact));
  const grouped = new Map();
  for (const fact of facts) {
    const key = factKey(fact);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(fact);
  }
  const confirmedFacts = [];
  for (const group of grouped.values()) {
    const manufacturerFacts = group.filter((fact) =>
      factReferences(fact).some((reference) => manufacturerIds.has(reference)));
    confirmedFacts.push(...(group.length > 1 && manufacturerFacts.length > 0 ? manufacturerFacts : group));
  }
  const publicResearch = structuredClone(research);
  for (const field of [
    "source_conflicts", "sourceConflicts", "errors_corrected", "notes", "decision",
    "responsible", "next_revision", "original_posts", "research_log", "audit",
  ]) delete publicResearch[field];
  publicResearch.title = text(publicResearch.title)
    .replace(/\s*[,;—:-]?\s*(?:e\s+)?(?:diverg[eê]ncias?|inconsist[eê]ncias?|conflitos?).*$/iu, "")
    .trim();
  const publicGrounding = { ...(research.grounding || {}) };
  delete publicGrounding.queries;
  return {
    ...publicResearch,
    confirmed_facts: confirmedFacts,
    limitations: (Array.isArray(research.limitations) ? research.limitations : [])
      .filter((limitation) => !/\b(?:diverg[eê]ncias?|inconsist[eê]ncias?|conflitos?)\b/iu.test(text(limitation))),
    grounding: {
      ...publicGrounding,
      publicationPolicy: "manufacturer-precedence-v1",
    },
  };
}
