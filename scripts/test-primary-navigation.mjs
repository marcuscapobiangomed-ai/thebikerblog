import assert from "node:assert/strict";
import fs from "node:fs";

const desktop = fs.readFileSync(new URL("../_layouts/default.html", import.meta.url), "utf8");
const mobile = fs.readFileSync(new URL("../_includes/header.html", import.meta.url), "utf8");
const footer = fs.readFileSync(new URL("../_includes/footer.html", import.meta.url), "utf8");
const devServer = fs.readFileSync(new URL("./dev-server.js", import.meta.url), "utf8");

for (const [surface, content] of Object.entries({ desktop, mobile, footer })) {
  assert.doesNotMatch(content, /href="{{ site\.baseurl }}\/corridas\/"/, `${surface}: link de Corridas ainda presente`);
  assert.doesNotMatch(content, />Corridas</, `${surface}: rótulo Corridas ainda presente`);
  assert.doesNotMatch(content, />Comparativos</, `${surface}: Comparativos ainda aparece na navegação principal`);
}

assert.match(mobile, /href="{{ site\.baseurl }}\/comparar\/"[^>]*>Comparador</, "o Comparador deve permanecer disponível");
assert.doesNotMatch(devServer, /corridas/, "dev-server.js: rota de corridas ainda registrada");

console.log("Navegação principal validada: Corridas removido e Comparador preservado.");
