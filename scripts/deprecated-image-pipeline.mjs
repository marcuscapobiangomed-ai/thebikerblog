const command = process.argv[2] || "pipeline de imagens legado";

console.error(
  `${command} foi desativado porque dependia de um checkout externo e podia alterar o repositório errado.\n`
  + "Use media:recalibrate-campaign para pautas da campanha, media:recalibrate-active para o conjunto legado aprovado "
  + "e audit:images para uma verificação somente leitura.",
);
process.exitCode = 1;
