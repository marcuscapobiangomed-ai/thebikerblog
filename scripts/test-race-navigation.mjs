import assert from 'node:assert/strict'
import fs from 'node:fs'

const desktop = fs.readFileSync(new URL('../_layouts/default.html', import.meta.url), 'utf8')
const mobile = fs.readFileSync(new URL('../_includes/header.html', import.meta.url), 'utf8')
const footer = fs.readFileSync(new URL('../_includes/footer.html', import.meta.url), 'utf8')
const page = fs.readFileSync(new URL('../corridas.md', import.meta.url), 'utf8')
const devServer = fs.readFileSync(new URL('./dev-server.js', import.meta.url), 'utf8')

for (const [surface, content] of Object.entries({ desktop, mobile, footer })) {
  assert.match(content, /\/corridas\//, `${surface}: link para corridas ausente`)
  assert.match(content, />Corridas</, `${surface}: rótulo Corridas ausente`)
}

assert.match(page, /permalink:\s*\/corridas\//)
assert.match(page, /id="profissional"/)
assert.match(page, /id="participar"/)
assert.match(page, /previa-corrida/)
assert.match(page, /resumo-corrida/)
assert.match(page, /calendario-provas/)
assert.match(page, /guia-prova/)
assert.doesNotMatch(page, /editorial-calendar|race-events/, 'página pública não deve expor o calendário interno nem eventos ainda pendentes')
assert.match(devServer, /\["\/corridas\/", await renderPage\("corridas\.md", "\/corridas\/"\)\]/, 'prévia local precisa renderizar a página de corridas')

console.log('Navegação e página pública de corridas validadas em desktop, mobile e rodapé.')
