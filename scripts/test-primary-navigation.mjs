import assert from "node:assert/strict";
import fs from "node:fs";

const desktop = fs.readFileSync(new URL("../_layouts/default.html", import.meta.url), "utf8");
const mobile = fs.readFileSync(new URL("../_includes/header.html", import.meta.url), "utf8");
const footer = fs.readFileSync(new URL("../_includes/footer.html", import.meta.url), "utf8");
const racePage = fs.readFileSync(new URL("../corridas.md", import.meta.url), "utf8");
const devServer = fs.readFileSync(new URL("./dev-server.js", import.meta.url), "utf8");

for (const [surface, content] of Object.entries({ desktop, mobile })) {
  assert.match(content, /href="{{ site\.baseurl }}\/corridas\/"[^>]*>Corridas</, `${surface}: Corridas ausente`);
  assert.doesNotMatch(content, />Comparativos</, `${surface}: Comparativos ainda aparece na navegação principal`);
}

assert.match(mobile, /href="{{ site\.baseurl }}\/comparar\/"[^>]*>Comparador</, "o Comparador deve permanecer disponível");
assert.match(footer, /href="{{ site\.baseurl }}\/corridas\/"[^>]*>Corridas</, "rodapé: Corridas ausente");
assert.match(racePage, /permalink:\s*\/corridas\//);
assert.match(racePage, /id="profissional"/);
assert.match(racePage, /id="participar"/);
assert.match(devServer, /\["\/corridas\/", await renderPage\("corridas\.md", "\/corridas\/"\)\]/);

console.log("Navegação principal validada: Corridas disponível, Comparativos removido e Comparador preservado.");
