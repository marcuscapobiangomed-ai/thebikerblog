import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, ".github/workflows", name), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.match(packageJson.scripts["prepare:derived"], /catalog:public.*build:machine-readable/);

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
assert.match(publication, /Validar integralmente o artefato publicado[\s\S]*id: publication_validation[\s\S]*npm run validate:artifacts/);
assert.match(publication, /Registrar publicação[\s\S]*id: persistence[\s\S]*steps\.publication_validation\.outcome == 'success'/);
assert.match(publication, /Solicitar deploy do SHA publicado[\s\S]*steps\.publication_validation\.outcome == 'success'[\s\S]*steps\.persistence\.outcome == 'success'[\s\S]*repos\/\$\{\{ github\.repository \}\}\/dispatches[\s\S]*event_type=editorial-deploy/);
assert.match(publication, /CAMPAIGN_CURATED_OFFLINE_FALLBACK: "true"[\s\S]*AI_DETERMINISTIC_CURATED_FALLBACK: "false"/);
assert.match(publication, /AI_DETERMINISTIC_CACHE_FIRST: "false"/);

const editorial = read("cron-post.yml");
assert.match(editorial, /CAMPAIGN_RESEARCH_MAX_ATTEMPTS: "2"/);
assert.match(editorial, /AI_DETERMINISTIC_CACHE_FIRST: "false"/);
assert.equal((editorial.match(/npm run catalog:revalidate/g) || []).length, 2);
assert.ok((editorial.match(/npm run validate:ci/g) || []).length >= 2);
assert.ok(editorial.indexOf("npm run validate:ci", editorial.indexOf("generate-draft:")) < editorial.indexOf("npm run campaign:produce"));
assert.match(editorial, /Verificar links TheBiker[^]*if: steps\.automation\.outcome == 'success' \|\| steps\.automation_retry\.outcome == 'success'/);
assert.match(editorial, /Substituir artigo reprovado e tentar pauta-reserva[^]*npm run campaign:recover && npm run campaign:produce/);
assert.doesNotMatch(editorial, /Persistir candidato revisado para retomar finaliza\u00e7\u00e3o/);
assert.doesNotMatch(editorial, /steps\.finalization\.outcome == 'failure'[^\n]*(?:git add|_posts\/drafts|editorial-campaign)/);
assert.match(editorial, /Persistir somente diagn\u00f3stico seguro da falha[^]*git add -- bot\/operational-state\/editorial-exceptions\.json/);
assert.doesNotMatch(editorial, /Persistir somente diagn\u00f3stico seguro da falha[^]*git add --[^\n]*(?:bot\/editorial-campaign\.json|_data\/editorial-calendar\.json)/);
assert.match(editorial, /id: finalization_retry[\s\S]*campaign:retry-finalization/);
assert.match(editorial, /id: finalization_retry[\s\S]*CAMPAIGN_FINALIZATION_MAX_ATTEMPTS: "3"[\s\S]*campaign:retry-finalization/);
assert.match(editorial, /steps\.finalization\.outcome == 'success' \|\| steps\.finalization_retry\.outcome == 'success'/);
assert.match(editorial, /Validar artefatos produzidos[\s\S]*npm run validate:artifacts/);
assert.match(editorial, /Propagar falha da produção[\s\S]*EDITORIAL_MIN_SAFE_BUFFER[\s\S]*buffer protegido/);
assert.match(editorial, /Propagar falha de finalização[\s\S]*EDITORIAL_MIN_SAFE_BUFFER[\s\S]*buffer protegido/);
assert.equal((editorial.match(/EDITORIAL_MIN_SAFE_BUFFER: \$\{\{ vars\.EDITORIAL_MIN_SAFE_BUFFER \|\| '1' \}\}/g) || []).length, 2);
assert.equal((editorial.match(/AI_DETERMINISTIC_CURATED_FALLBACK: "false"/g) || []).length, 3);

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
assert.match(renewal, /Validar plano mensal[^]*id: validation/);
assert.match(renewal, /Persistir campanha e fila de atualiza\u00e7\u00e3o[^]*steps\.validation\.outcome == 'success'/);
assert.match(renewal, /Iniciar produ\u00e7\u00e3o do novo buffer[^]*steps\.persistence\.outcome == 'success'[^]*replenish-buffer\.yml[^]*target_buffer=7[^]*max_attempts=7[^]*required_date=/);
assert.doesNotMatch(renewal, /gh workflow run cron-post\.yml/);
assert.match(renewal, /queue: max/);

const auditBuffer = read("audit-buffer.yml");
assert.match(auditBuffer, /Validar integralmente notas e bloqueios[^]*if: steps\.audit\.outcome == 'success'[^]*npm run validate/);
assert.match(auditBuffer, /Persistir somente auditoria aprovada[^]*steps\.audit\.outcome == 'success' && steps\.validation\.outcome == 'success'/);
assert.doesNotMatch(auditBuffer, /Persistir[^\n]*\n\s*if: always\(\)/);

const repairBuffer = read("repair-buffer.yml");
assert.match(repairBuffer, /Validar integralmente o reparo[^]*if: steps\.repair\.outcome == 'success'[^]*npm run validate/);
assert.match(repairBuffer, /Persistir somente reparo aprovado[^]*steps\.repair\.outcome == 'success' && steps\.validation\.outcome == 'success'/);
assert.doesNotMatch(repairBuffer, /Persistir[^\n]*\n\s*if: always\(\)/);

const replenish = read("replenish-buffer.yml");
assert.match(replenish, /Detectar avan\u00e7o editorial validado[^]*steps\.replenish\.outputs\.exit_code == '0' && steps\.validation\.outcome == 'success'/);
assert.match(replenish, /Persistir somente avan\u00e7o validado[^]*steps\.replenish\.outputs\.exit_code == '0' && steps\.validation\.outcome == 'success'/);
assert.match(replenish, /if \[ "\$\{\{ steps\.replenish\.outputs\.exit_code \}\}" != "0" \][^]*exit 1/);

const raceCalendar = read("update-race-calendar.yml");
assert.match(raceCalendar, /Registrar snapshot verificado[^]*steps\.validation\.outcome == 'success'/);
assert.match(raceCalendar, /Solicitar deploy do snapshot persistido[^]*steps\.persistence\.outcome == 'success'/);

const workflowDirectory = path.join(root, ".github/workflows");
const protectedGitAdd = /git add[^\n]*(?:_posts|assets\/img\/posts|bot\/editorial-campaign\.json|_data\/editorial-calendar\.json|_data\/editorial-refresh-queue\.json|_data\/race-events\.json|_data\/catalog-public\.json|api\/products\.json)/;
for (const workflowName of fs.readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/i.test(name))) {
  const workflow = yaml.load(fs.readFileSync(path.join(workflowDirectory, workflowName), "utf8"));
  for (const [jobName, job] of Object.entries(workflow?.jobs || {})) {
    for (const step of job?.steps || []) {
      if (!protectedGitAdd.test(String(step?.run || ""))) continue;
      const condition = String(step?.if || "");
      assert.match(
        condition,
        /steps\.[a-z_]*validation\.outcome == 'success'/,
        `${workflowName}:${jobName}:${step.name || "etapa sem nome"} precisa exigir validação aprovada antes de git add`,
      );
      assert.doesNotMatch(
        condition,
        /always\(\)|\.outcome == 'failure'/,
        `${workflowName}:${jobName}:${step.name || "etapa sem nome"} não pode persistir conteúdo após falha`,
      );
    }
  }
}

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
