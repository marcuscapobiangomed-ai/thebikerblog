# Runbook das próximas campanhas editoriais — 17 de agosto de 2026

## O que aconteceu

As pautas de 23 a 30 de agosto chegaram à produção sem duas pré-condições explícitas: pesquisa rastreável em cache e uma rota visual real. A indisponibilidade de Groq/Gemini também foi registrada de forma imprecisa como falha de imagem quando o fallback de pesquisa não encontrou evidência.

## Correções aplicadas

- As pautas de 23 a 30/08 receberam fichas de pesquisa baseadas em fontes oficiais e contrato `campaign-research-cache-v1`.
- Cada pauta recebeu um produto de contexto visual real, com imagem oficial TheBiker validada, sem transformar esse produto em objeto do artigo.
- A pauta Scott Scale 940 foi substituída por uma pauta-reserva de cockpit. O ativo exclusivo do Scale 940 continua bloqueado até existir uma imagem nova, autorizada e não duplicada.
- Quota, 429 e indisponibilidade de provedor agora geram `TRANSIENT_PROVIDER`, permitindo recuperação limitada; ausência de fontes continua `RESEARCH_INSUFFICIENT`.
- O verificador de claims ignora frontmatter e URLs ao procurar unidades, evitando que IDs, legendas e `%20` sejam lidos como fatos do artigo.

## Rotina segura

Antes de consumir IA:

```powershell
npm --prefix bot run campaign:preflight -- --lead-days=7
```

Se houver bloqueios já registrados, recuperar somente o que tiver caminho seguro:

```powershell
npm --prefix bot run campaign:recover
```

Depois, produzir e finalizar uma pauta por vez. Nunca desabilitar o gate visual, o contrato de evidência ou a checagem de claims para aumentar o buffer.

Ao final:

```powershell
npm run validate:artifacts
```

O workflow diário e o workflow de recomposição executam o preflight automaticamente antes das chamadas de IA.
