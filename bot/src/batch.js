#!/usr/bin/env node
/**
 * Gera os primeiros N posts do blog automaticamente via DeepSeek/Gemini.
 * Uso: node src/batch.js
 */
import "dotenv/config";

const TOPICOS = [
  // Bloco 1: Guias de compra
  "Guia completo: melhor bike de estrada para iniciantes em 2026, com opções de R$ 3.000 a R$ 8.000",
  "Comparativo: 5 melhores bikes de estrada até R$ 5.000 em 2026, com prós e contras de cada uma",
  "Comparativo: 5 melhores bikes de estrada até R$ 10.000 em 2026, análise detalhada de cada modelo",
  "Scott Addict vs Cervélo Caledonia: comparativo completo para quem vai comprar bike de estrada em 2026",
  "Trek Émonda vs Specialized Tarmac: qual a melhor bike de escalada? Comparativo técnico e de preço",
  "Quadro de carbono vs alumínio em bike de estrada: vale a pena pagar mais? Análise para o mercado brasileiro",
  "Shimano 105 vs Ultegra: a diferença de preço justifica? Guia para escolher o grupo de transmissão ideal",
  "Como escolher o tamanho certo de bike de estrada: guia completo com tabela de medidas por altura",
  "Bike de estrada nova vs usada: prós e contras de cada opção, quanto vale comprar seminova no Brasil",
  "Guia de compra: seu orçamento ideal para primeira bike de estrada em 2026, incluindo acessórios essenciais",

  // Bloco 2: Marcas
  "Scott Addict 2026: ficha técnica completa, preço no Brasil e para quem é indicada",
  "Scott Foil 2026: review completo do modelo aero, o que mudou em relação à geração anterior",
  "Cervélo: por que é a marca preferida dos profissionais do WorldTour? História e modelos principais",
  "Specialized Tarmac SL8: vale o investimento? Review completo para o mercado brasileiro",
  "Trek Madone vs Trek Émonda: entenda as diferenças entre as linhas aero e leve da Trek",
  "Cannondale SuperSix Evo vs SystemSix: qual escolher em 2026? Comparativo completo",

  // Bloco 3: Lançamentos e tendências
  "Lançamentos de bikes de estrada 2026: o que esperar das principais marcas para o próximo ano",
  "Tendências em bikes de estrada 2026: aero está vencendo as leves? O que os dados mostram",
  "O que as equipes do WorldTour estão usando em 2026: equipamentos, bikes e componentes",
  "Inovações em componentes de bike 2026: grupos eletrônicos, rodas de carbono e sensores de potência",

  // Bloco 4: Componentes e acessórios
  "Melhores rodas de carbono custo-benefício para bike de estrada em 2026: guia completo",
  "Melhores pedais clipless para iniciantes em ciclismo de estrada: qual escolher em 2026",
  "Melhores capacetes de ciclismo de estrada 2026: de R$ 200 a R$ 2.000, review e comparação",
  "Sensores de potência para bike: vale a pena para ciclista amador? Guia completo 2026",
  "Melhores apps de treino para ciclismo 2026: Zwift, TrainerRoad, TrainingPeaks, MyWhoosh comparados",
  "Guia de manutenção básica para bike de estrada: o que todo ciclista precisa saber fazer",

  // Bloco 5: Brasil-específico
  "Onde comprar bike de estrada importada no Brasil em 2026: lojas, sites e cuidados",
  "Quanto custa importar uma bike de estrada em 2026: impostos, frete e burocracia",
  "Melhores estradas e rotas para ciclismo de estrada no Brasil: guia por região",
  "Bicicletarias especializadas em bike de estrada: como encontrar a melhor perto de você",
];

async function main() {
  throw new Error(
    `Batch legado bloqueado permanentemente: as ${TOPICOS.length} pautas não possuem fichas individuais `
      + "nem recibos editoriais. Use campaign:produce e campaign:finalize.",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
