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
assert.match(page, /site\.data\["race-events"\]/, 'página pública precisa consumir o snapshot oficial de corridas')
assert.match(page, /public_calendar\.today/)
assert.match(page, /id="hoje"/)
assert.match(page, /Em disputa hoje/)
assert.doesNotMatch(page, /Acontecendo agora/, 'agenda por data não pode alegar transmissão ao vivo')
assert.doesNotMatch(page, /Últimos resultados/, 'agenda recente não pode alegar resultado sem consultar classificações')
assert.match(page, /data-race-calendar/)
assert.match(page, /data-race-outbound/)
assert.match(page, /public_calendar\.recent/)
assert.match(page, /public_calendar\.upcoming/)
assert.match(page, /Ficha oficial UCI/)
assert.doesNotMatch(page, /em preparação/i, 'página pronta não pode continuar exibindo estado genérico de preparação')
assert.match(devServer, /\["\/corridas\/", await renderPage\("corridas\.md", "\/corridas\/"\)\]/, 'prévia local precisa renderizar a página de corridas')
assert.match(devServer, /"race-events": JSON\.parse/, 'prévia local precisa carregar os dados do calendário oficial')

console.log('Navegação e página pública de corridas validadas em desktop, mobile e rodapé.')
