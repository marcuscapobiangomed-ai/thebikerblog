import assert from "node:assert/strict";
import { markdownPublicationErrors } from "./src/validation/markdown-publication-gates.js";
import { researchEvidenceContractErrors } from "./src/validation/research-grounding.js";
import { getTemplate } from "./src/templates.js";

function reviewMarkdown({ title = "Scott Addict RC Pro 2026: montagem confirmada", body }) {
  return `---
title: "${title}"
description: "Quadro, transmissão, rodas, peso e preço reunidos para orientar a escolha da Scott Addict RC Pro 2026 no mercado brasileiro."
content_type: "review"
review_method: "desk-research"
tested_by_thebikerblog: false
direct_answer: "A Scott Addict RC Pro usa quadro HMX, transmissão Dura-Ace Di2 e rodas Syncros Capital 1.0S de 40 mm."
tags: ["scott", "road-bike"]
sources:
  - name: "Scott"
    type: "manufacturer"
    url: "https://www.scott-sports.com/"
---

${body}`;
}

const cleanReview = reviewMarkdown({
  body: `## Quadro e montagem

O quadro Addict RC HMX utiliza geometria Road Race, passagem interna dos cabos e gancheira substituível.

## Transmissão

O grupo Shimano Dura-Ace Di2 combina pedivela 52x36 e cassete 11-34.

## Rodas

As rodas Syncros Capital 1.0S têm perfil de 40 mm e recebem pneus Schwalbe PRO ONE 700x30C.

## Peso

O peso aproximado declarado pela Scott é de 6,7 kg.

## Fontes

- [Scott](https://www.scott-sports.com/)`,
});
assert.deepEqual(markdownPublicationErrors(cleanReview), []);

const adversarialBodies = [
  `## Controle do material consultado

A documentação reúne a ficha, o registro, a pesquisa e as fontes recuperadas para consulta.

O documento preserva a fonte, a ficha, o registro e a lacuna encontrada durante a pesquisa.

A pesquisa organiza os documentos, as fichas, as fontes e os registros antes da redação.`,
  `## Dados do produto

Verifique a URL da fonte e registre a data de acesso antes de usar a especificação no texto.`,
  `## Peso do sistema

Os valores não coincidem nas especificações publicadas pelas páginas consultadas.`,
  `## Identificação

Uma ficha registra 120 kg, enquanto outra ficha apresenta 128 kg para o mesmo limite.`,
];

for (const body of adversarialBodies) {
  assert.ok(markdownPublicationErrors(reviewMarkdown({ body })).length > 0, `contaminação não bloqueada: ${body}`);
}

assert.match(
  markdownPublicationErrors(reviewMarkdown({
    title: "Scott Addict RC Pro 2026: especificações, preço e divergências entre fontes",
    body: "## Montagem\n\nO modelo usa quadro HMX e transmissão Dura-Ace Di2.",
  })).join(" | "),
  /conflito entre fontes exposto/,
);

assert.match(markdownPublicationErrors(`---
title: "Review de produto"
description: "Descrição técnica suficientemente clara para o artigo."
content_type: "review"
review_method: "desk-research"
tested_by_thebikerblog: false
direct_answer: "O produto reúne os componentes listados na especificação comercial disponível."
tags: ["ciclismo"]
sources:
  - name: "Loja"
    type: "store"
    url: "https://example.com/produto"
---

## Montagem

Texto técnico.
`).join(" | "), /sem fonte técnica do fabricante/);

function productResearch(overrides = {}) {
  const manufacturerFacts = Array.from({ length: 10 }, (_, index) => ({
    fact: `technical.field${index + 1}: valor confirmado ${index + 1}`,
    source_ids: ["manufacturer-1"],
    evidence_quote: `Trecho oficial verificável para o campo técnico número ${index + 1}.`,
  }));
  return {
    content_type: "review",
    status: "pesquisa_concluida",
    sources: [{
      id: "manufacturer-1",
      name: "Fabricante oficial",
      type: "manufacturer",
      url: "https://manufacturer.example/product",
    }],
    confirmed_facts: manufacturerFacts,
    grounding: {
      evidenceContract: "retrieved-excerpt-v1",
      verifiedAt: "2026-08-21T12:00:00-03:00",
    },
    ...overrides,
  };
}

assert.deepEqual(researchEvidenceContractErrors(productResearch()), []);
assert.match(researchEvidenceContractErrors(productResearch({
  sources: [{ id: "store-1", name: "Loja", type: "store", url: "https://store.example/product" }],
})).join(" | "), /exige fonte técnica do fabricante/);
assert.match(researchEvidenceContractErrors(productResearch({
  grounding: {
    evidenceContract: "campaign-research-cache-v1",
    verifiedAt: "2026-08-21T12:00:00-03:00",
  },
})).join(" | "), /cache offline não é publicável/);
assert.match(researchEvidenceContractErrors(productResearch({
  confirmed_facts: productResearch().confirmed_facts.slice(0, 4),
})).join(" | "), /cobertura factual insuficiente|base técnica do fabricante insuficiente/);

for (const type of ["review", "comparativo", "guia-de-compra"]) {
  const structure = getTemplate(type).structure.join(" | ");
  assert.doesNotMatch(structure, /metodologia|como este artigo foi produzido|processo editorial/i);
}

console.log("Editorial integrity adversarial tests passed.");
