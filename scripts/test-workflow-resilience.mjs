import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, ".github/workflows", name), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.match(packageJson.scripts["prepare:derived"], /catalog:public.*build:machine-readable/);

const publication = read("publish-daily.yml");
assert.ok(publication.indexOf("npm run catalog:revalidate") < publication.indexOf("npm run validate:ci"));
const baselineIndex = publication.indexOf("npm run validate:ci");
const mutationIndex = publication.indexOf("node src/publish_scheduled.js");
assert.ok(baselineIndex >= 0 && baselineIndex < mutationIndex);
assert.match(publication, /git add .*_data\/catalog-public\.json/);
assert.match(publication, /git add .*_data\/products\/bikes/);
assert.match(publication, /git add .*api\/products\.json/);
assert.match(publication, /git add .*content\/product-discovery\/thebiker-media-catalog\.json/);
assert.match(publication, /git pull --rebase --autostash origin main/);
assert.match(publication, /permissions:[\s\S]*actions: write/);
assert.equal((publication.match(/gh workflow run deploy\.yml/g) || []).length, 1);
assert.match(publication, /if: \$\{\{ steps\.publication\.outputs\.status == 'published' \}\}[\s\S]*gh workflow run deploy\.yml/);
assert.match(publication, /Garantir artigo aprovado para hoje antes da promo\u00e7\u00e3o[\s\S]*campaign:replenish[\s\S]*required-date/);
assert.match(publication, /CAMPAIGN_CURATED_OFFLINE_FALLBACK: "true"[\s\S]*AI_DETERMINISTIC_CURATED_FALLBACK: "true"/);
assert.match(publication, /AI_DETERMINISTIC_CACHE_FIRST: "true"/);

const editorial = read("cron-post.yml");
assert.match(editorial, /CAMPAIGN_RESEARCH_MAX_ATTEMPTS: "2"/);
assert.match(editorial, /AI_DETERMINISTIC_CACHE_FIRST: "true"/);
assert.equal((editorial.match(/npm run catalog:revalidate/g) || []).length, 2);
assert.ok((editorial.match(/npm run validate:ci/g) || []).length >= 2);
assert.ok(editorial.indexOf("npm run validate:ci", editorial.indexOf("generate-draft:")) < editorial.indexOf("npm run campaign:produce"));
assert.match(editorial, /Verificar links TheBiker[^]*if: steps\.automation\.outcome == 'success' \|\| steps\.automation_retry\.outcome == 'success'/);
assert.match(editorial, /Substituir artigo reprovado e tentar pauta-reserva[^]*npm run campaign:recover && npm run campaign:produce/);
assert.match(editorial, /Persistir candidato revisado para retomar finaliza\u00e7\u00e3o[^]*git add --[^\n]*_posts\/drafts[^\n]*content\/research\/campaign/);
assert.match(editorial, /\(steps\.automation\.outcome == 'success' \|\| steps\.automation_retry\.outcome == 'success'\) && steps\.finalization\.outcome == 'failure'/);
assert.match(editorial, /id: finalization_retry[\s\S]*campaign:retry-finalization/);
assert.match(editorial, /id: finalization_retry[\s\S]*CAMPAIGN_FINALIZATION_MAX_ATTEMPTS: "3"[\s\S]*campaign:retry-finalization/);
assert.match(editorial, /steps\.finalization\.outcome == 'success' \|\| steps\.finalization_retry\.outcome == 'success'/);
assert.equal((editorial.match(/AI_DETERMINISTIC_CURATED_FALLBACK: "true"/g) || []).length, 3);

const replenisher = read("replenish-buffer.yml");
assert.match(replenisher, /cron: "15 2,8,14,20 \* \* \*"/);
assert.match(replenisher, /campaign:replenish[\s\S]*target-buffer=.*max-attempts=.*allow-partial/);
assert.match(replenisher, /CAMPAIGN_RESEARCH_MAX_ATTEMPTS: "2"/);
assert.match(replenisher, /CAMPAIGN_CURATED_OFFLINE_FALLBACK: "true"/);
assert.match(replenisher, /CAMPAIGN_CURATED_OFFLINE_FALLBACK: "true"[\s\S]*AI_DETERMINISTIC_CURATED_FALLBACK: "true"/);
assert.match(replenisher, /AI_DETERMINISTIC_CACHE_FIRST: "true"/);
assert.match(replenisher, /group: thebiker-editorial-write/);
assert.match(replenisher, /git add _data\/products\/bikes/);
assert.match(replenisher, /persist_status=1[\s\S]*if git pull --rebase --autostash origin main && git push[\s\S]*Falha ao persistir/);
assert.match(replenisher, /id: validation[\s\S]*Validação\/persistência: \$\{\{ steps\.validation\.outcome \}\}/i);

assert.match(editorial, /git add _data\/products\/bikes/);
assert.match(editorial, /git add _data\/products\/bikes[^\n]*content\/product-discovery\/thebiker-media-catalog\.json/);

assert.match(read("deploy.yml"), /Run publication gates[\s\S]*npm run validate:ci/);
assert.match(read("pr-validate.yml"), /Preparar artefatos derivados temporais[\s\S]*npm run prepare:derived/);

console.log("Resili\u00eancia dos workflows editoriais validada com sucesso.");
