import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, ".github/workflows", name), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.match(packageJson.scripts["prepare:derived"], /catalog:public.*build:machine-readable/,
  "o preparo deve renovar o catálogo e todos os endpoints que dependem dele");

const publication = read("publish-daily.yml");
assert.ok(publication.indexOf("npm run catalog:revalidate") < publication.indexOf("npm run validate:ci"),
  "a publicação deve renovar a evidência comercial antes dos gates temporais");
const baselineIndex = publication.indexOf("npm run validate:ci");
const mutationIndex = publication.indexOf("node src/publish_scheduled.js");
assert.ok(baselineIndex >= 0 && baselineIndex < mutationIndex, "a publicação deve validar e renovar derivados antes de alterar o post");
assert.match(publication, /git add .*_data\/catalog-public\.json/, "a publicação precisa persistir o catálogo renovado");
assert.match(publication, /git add .*api\/products\.json/, "a publicação precisa persistir o endpoint derivado renovado");
assert.match(publication, /permissions:[\s\S]*actions: write/,
  "a publicação precisa de permissão explícita para disparar o workflow de deploy");
assert.equal((publication.match(/gh workflow run deploy\.yml/g) || []).length, 1,
  "a publicação deve disparar exatamente um deploy explícito, pois pushes do GITHUB_TOKEN não iniciam workflows de push");
assert.match(publication, /if: \$\{\{ steps\.publication\.outputs\.status == 'published' \}\}[\s\S]*gh workflow run deploy\.yml/,
  "o deploy explícito só pode ocorrer apó uma publicação confirmada");

const editorial = read("cron-post.yml");
assert.equal((editorial.match(/npm run catalog:revalidate/g) || []).length, 2,
  "preflight e produção devem revalidar o catálogo em seus workspaces isolados");
assert.ok((editorial.match(/npm run validate:ci/g) || []).length >= 2,
  "a automação deve validar o baseline no preflight e novamente no workspace que consumirá IA");
assert.ok(editorial.indexOf("npm run validate:ci", editorial.indexOf("generate-draft:")) < editorial.indexOf("npm run campaign:produce"),
  "o workspace editorial deve ser validado antes de consumir provedores de IA");
assert.match(editorial, /Verificar links TheBiker[^]*if: steps\.automation\.outcome == 'success' \|\| steps\.automation_retry\.outcome == 'success'/,
  "a auditoria de links não deve criar uma segunda falha quando a produção não gerou candidato");
assert.match(editorial, /Substituir artigo reprovado e tentar pauta-reserva[^]*npm run campaign:recover && npm run campaign:produce/,
  "um artigo reprovado deve acionar uma pauta-reserva no mesmo workflow");
assert.match(editorial, /Persistir candidato revisado para retomar finalização[^]*git add --[^\n]*_posts\/drafts[^\n]*content\/research\/campaign/,
  "uma falha de finalização deve preservar draft e pesquisa revisados junto do estado que aponta para eles");
assert.match(editorial, /\(steps\.automation\.outcome == 'success' \|\| steps\.automation_retry\.outcome == 'success'\) && steps\.finalization\.outcome == 'failure'/,
  "a persistência recuperável deve ser exclusiva de candidatos produzidos e reprovados na finalização");

assert.match(read("deploy.yml"), /Run publication gates[\s\S]*npm run validate:ci/,
  "o deploy deve renovar derivados temporais antes dos gates");
assert.match(read("pr-validate.yml"), /Preparar artefatos derivados temporais[\s\S]*npm run prepare:derived/,
  "PRs não devem falhar apenas porque um derivado temporal venceu durante a revisão");

console.log("Resiliência dos workflows editoriais validada com sucesso.");
