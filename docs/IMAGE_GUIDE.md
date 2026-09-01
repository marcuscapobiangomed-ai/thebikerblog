# Guia de Imagens — TheBiker Blog

> O contrato atual é o Sistema Editorial de Imagens v2, documentado em
> `docs/editorial/image-system-v2.md`. A estrutura abaixo descreve o acervo
> legado e não autoriza novas publicações no formato v1.

## Estrutura

```
assets/img/posts/<slug>/
├── hero-1600.webp
├── hero-800.webp
├── card-640.webp
└── image-manifest.json

assets/img/system/covers/<tipo>/
├── hero.webp
├── thumb-480.webp
└── image-manifest.json
```

O manifesto v2 registra arquivos, origem, licença, fidelidade factual, uso de IA,
marcas e produtos retratados, ponto focal e aprovação pelo gate automatizado.

## Requisitos

- **Hero**: 1600×900px, WebP, < 300 KB
- **Mobile**: 800×450px, WebP, < 160 KB
- **Card**: 640×360px, WebP, < 100 KB
- **Alt text**: descritivo, ≥ 10 caracteres, sem "imagem de" ou "foto de"
- **Licença**: sempre registrada no hero do manifest
- **Crédito**: obrigatório para imagens de terceiros
- **sourceUrl**: obrigatório para imagem externa

## Fallback visual do site

Quando um rascunho não tiver imagem própria, o bot usa um cover editorial temporário por tipo:

- `comparativo` → capa com duas bikes em composição comparativa
- `review` → capa com uma bike em destaque técnico
- `guia-de-compra`, `guia-tecnico` e `noticia` → capa de estrada/guia editorial

Esses covers ficam em `assets/img/system/covers/` e não podem permanecer em posts publicados.

## Bloqueios

A publicação falha se:
- imagem sem crédito
- alt ausente ou genérico
- arquivo > 300 KB
- proporção diferente de 16:9
