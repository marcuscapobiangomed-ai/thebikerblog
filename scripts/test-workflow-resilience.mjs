import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, ".github/workflows", name), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const scheduledPublisher = fs.readFileSync(path.join(root, "bot/src/publish_scheduled.js"), "utf8");

assert.match(packageJson.scripts["prepare:derived"], /catalog:public.*build:machine-readable/);
assert.match(packageJson.scripts["prepare:derived"], /build:topic-ledger/);
assert.match(scheduledPublisher, /revalidateRaceSource\(item, raceProgram, now\)/, "corrida deve ser revalidada transacionalmente antes da publicação");
assert.match(scheduledPublisher, /"_data\/race-events\.json"/, "transação deve carregar o calendário oficial usado na revalidação");
assert.ok(scheduledPublisher.indexOf("await promoteStagedPaths") < scheduledPublisher.indexOf("await writeEditorialTopicLedger"), "ledger histórico deve refletir o post já promovido");

const publication = read("publish-daily.yml");
assert.ok(publication.indexOf("npm run catalog:revalidate") < publication.indexOf("npm run prepare:derived"));
const baselineIndex = publication.indexOf("npm run prepare:derived");
const mutationIndex = publication.indexOf("id: candidate_probe");
assert.ok(baselineIndex >= 0 && baselineIndex < mutationIndex);
assert.match(publication, /Preparar derivados e validar núcleo estrutural[\s\S]*npm run prepare:derived[\s\S]*npm run check:n8n/);
assert.match(publication, /git add .*_data\/catalog-public\.json/);
assert.match(publication, /git add .*_data\/products\/bikes/);
assert.match(publication, /git add .*api\/products\.json/);
assert.match(publication, /git add .*content\/product-discovery\/thebiker-media-catalog\.json/);
assert.match(publication, /git add .*_data\/editorial-topic-ledger\.json/);
assert.match(publication, /git pull --rebase --autostash origin main/);
assert.doesNotMatch(publication, /actions: write/);
assert.equal((publication.match(/gh workflow run deploy\.yml/g) || []).length, 0);
assert.match(publication, /catch_up:[\s\S]*type: boolean/);
assert.match(publication, /id: candidate_probe[\s\S]*AUTOMATION_CATCH_UP_POLICY[\s\S]*echo "status=.*\.status.*GITHUB_OUTPUT/);
assert.match(
  publication,
  /id: recovery[\s\S]*steps\.candidate_probe\.outcome == 'failure' \|\| \(steps\.candidate_probe\.outputs\.status == 'idle' && steps\.candidate_probe\.outputs\.item_id == ''\)[\s\S]*campaign:replenish[\s\S]*required-date/,
);
assert.doesNotMatch(
  publication.match(/id: recovery[\s\S]*?working-directory: bot/)?.[0] || "",
  /outputs\.status == 'already-published'/,
  "already-published deve permanecer idempotente e não acionar recovery",
);
assert.doesNotMatch(
  publication.match(/id: recovery[\s\S]*?working-directory: bot/)?.[0] || "",
  /outputs\.status == 'cycle-complete'/,
  "dia encerrado antes da nova janela deve permanecer no-op idempotente",
);
assert.match(publication, /id: candidate[\s\S]*remaining_overdue/);
assert.match(
  publication,
  /Propagar recovery sem candidato em execução real[\s\S]*\(github\.event_name == 'schedule' \|\| inputs\.dry_run == false\) && steps\.recovery\.outcome != 'skipped' && steps\.candidate\.outputs\.item_id == ''[\s\S]*exit 1/,
  "execução real não pode terminar verde depois de recovery sem candidato",
);
assert.match(publication, /AUTOMATION_EXPECTED_ITEM_ID: \$\{\{ steps\.candidate\.outputs\.item_id \}\}/);
assert.match(publication, /Validar artefato publicado sem depender da freshness global[\s\S]*npm run validate:posts[\s\S]*npm run check:thebiker-links/);
assert.match(publication, /Registrar publicação[\s\S]*steps\.publication\.outputs\.status == 'published'/);
assert.match(publication, /Solicitar deploy do SHA publicado[\s\S]*steps\.publication\.outputs\.status == 'published'[\s\S]*repos\/\$\{\{ github\.repository \}\}\/dispatches[\s\S]*event_type=editorial-deploy/);
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
assert.match(editorial, /Validar artefatos produzidos[\s\S]*npm run validate:artifacts/);
assert.match(editorial, /Propagar falha da produção[\s\S]*EDITORIAL_MIN_SAFE_BUFFER[\s\S]*buffer protegido/);
assert.match(editorial, /Propagar falha de finalização[\s\S]*EDITORIAL_MIN_SAFE_BUFFER[\s\S]*buffer protegido/);
assert.equal((editorial.match(/EDITORIAL_MIN_SAFE_BUFFER: \$\{\{ vars\.EDITORIAL_MIN_SAFE_BUFFER \|\| '1' \}\}/g) || []).length, 2);
assert.equal((editorial.match(/AI_DETERMINISTIC_CURATED_FALLBACK: "true"/g) || []).length, 3);

await import("./test-automation-observability.mjs");

assert.match(editorial, /git add _data\/products\/bikes/);
assert.match(editorial, /git add _data\/products\/bikes[^\n]*content\/product-discovery\/thebiker-media-catalog\.json/);

const deploy = read("deploy.yml");
assert.match(deploy, /Run publication gates[\s\S]*npm run validate:ci/);
assert.match(deploy, /repository_dispatch:[\s\S]*types: \[editorial-deploy\]/);
assert.match(deploy, /github\.event_name == 'repository_dispatch'/);
assert.match(deploy, /actions\/checkout@v7[\s\S]*ref: main/);
const renewal = read("renew-monthly-campaign.yml");
assert.match(renewal, /event-observed:\s+runs-on: ubuntu-latest[\s\S]*Classificar evento recebido/);
assert.match(renewal, /renew:\s+if: \$\{\{ github\.event_name == 'workflow_dispatch'/);
assert.match(renewal, /contingency:[\s\S]*type: boolean/);
assert.match(renewal, /id: renewal[\s\S]*--contingency[\s\S]*--candidate-output=/);
assert.match(renewal, /campaign:validate-monthly-plan/);
assert.doesNotMatch(renewal, /campaign:simulate/);
assert.match(renewal, /if: \$\{\{ steps\.renewal\.outputs\.status == 'renewed' \}\}[\s\S]*replenish-buffer\.yml[\s\S]*target_buffer=7[\s\S]*max_attempts=7[\s\S]*required_date=/);
assert.doesNotMatch(renewal, /gh workflow run cron-post\.yml/);
assert.match(renewal, /queue: max/);

const watchdog = read("editorial-watchdog.yml");
assert.match(watchdog, /actions: write/);
assert.match(watchdog, /id: monthly_readiness[\s\S]*check-monthly-readiness\.mjs/);
assert.match(watchdog, /outputs\.needs_renewal == 'true'[\s\S]*renew-monthly-campaign\.yml[\s\S]*contingency=true[\s\S]*dry_run=false/);

for (const name of ["update-race-calendar.yml", "replenish-buffer.yml", "publish-daily.yml", "repair-buffer.yml", "cron-post.yml", "renew-monthly-campaign.yml", "audit-buffer.yml"]) {
  assert.match(read(name), /group: thebiker-editorial-write\s+queue: max\s+cancel-in-progress: false/, `${name} deve enfileirar todos os escritores`);
}
const prValidation = read("pr-validate.yml");
assert.match(prValidation, /Preparar artefatos derivados temporais[\s\S]*npm run prepare:derived/);
assert.match(
  prValidation,
  /npm run prepare:derived[\s\S]*npm run security:secrets[\s\S]*Auditar recibos editoriais publicados[\s\S]*npm run receipts:check[\s\S]*Lint \(JS\)/,
  "PR deve bloquear recibo publicado divergente antes dos gates de conteúdo/deploy",
);

console.log("Resili\u00eancia dos workflows editoriais validada com sucesso.");
