#!/usr/bin/env node

console.error(
  "generate-pages.js foi bloqueado: ele ativava páginas sem executar os gates atuais. "
    + "Use npm run sync:product-pages e npm run check:product-pages.",
);
process.exitCode = 1;
