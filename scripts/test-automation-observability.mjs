import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, ".github/workflows", name), "utf8");

const replenisher = read("replenish-buffer.yml");
assert.match(replenisher, /cron: "35 7 \* \* \*"/);
assert.match(replenisher, /cron: "45 13 \* \* \*"/);
assert.match(replenisher, /arguments=\(--target-buffer=.*--max-attempts=/);
assert.match(replenisher, /npm run campaign:replenish -- "\$\{arguments\[@\]\}"/);
assert.doesNotMatch(replenisher, /--allow-partial/);
assert.match(replenisher, /TARGET_BUFFER_INPUT: \$\{\{ inputs\.target_buffer \|\| '7' \}\}/);
assert.match(replenisher, /MAX_ATTEMPTS_INPUT: \$\{\{ inputs\.max_attempts \|\| '3' \}\}/);
assert.match(replenisher, /required_date:[\s\S]*type: string/);
assert.match(replenisher, /REQUIRED_DATE_INPUT: \$\{\{ inputs\.required_date \|\| '' \}\}/);
assert.doesNotMatch(replenisher, /--target-buffer=\$\{\{/);
assert.doesNotMatch(replenisher, /--max-attempts=\$\{\{/);
assert.match(replenisher, /target_buffer < 1 \|\| target_buffer > 30/);
assert.match(replenisher, /max_attempts < 1 \|\| max_attempts > 10/);
assert.match(replenisher, /--target-buffer="\$target_buffer" --max-attempts="\$max_attempts"/);
assert.match(replenisher, /arguments\+=\(--required-date="\$REQUIRED_DATE_INPUT"\)/);
assert.doesNotMatch(replenisher.match(/id: replenish[\s\S]*?working-directory: bot/)?.[0] || "", /continue-on-error/);
assert.match(replenisher, /replenish_exit_code=\$\?[\s\S]*echo "exit_code=\$replenish_exit_code" >> "\$GITHUB_OUTPUT"/);
assert.match(replenisher, /id: validation[\s\S]*run: npm run validate:artifacts/);
assert.doesNotMatch(replenisher, /validation_status|npm run validate:artifacts \|\|/);
const validationIndex = replenisher.indexOf("id: validation");
const persistenceIndex = replenisher.indexOf("id: persistence");
assert.ok(validationIndex >= 0 && validationIndex < persistenceIndex);
assert.match(replenisher, /if: steps\.replenish\.outputs\.exit_code == '0' && steps\.validation\.outcome == 'success' && steps\.changes\.outputs\.editorial == 'true'/);
assert.match(replenisher, /steps\.replenish\.outputs\.exit_code != '0' \|\| steps\.validation\.outcome == 'failure' \|\| steps\.persistence\.outcome == 'failure'/);
assert.match(replenisher, /EDITORIAL_CRITICAL_BUFFER: \$\{\{ vars\.EDITORIAL_CRITICAL_BUFFER \|\| '1' \}\}/);
assert.match(replenisher, /steps\.replenish\.outputs\.exit_code \}\}" != "0"[\s\S]*exit 1/);
assert.doesNotMatch(replenisher, /Recomposição parcial\/sem progresso/);
assert.match(replenisher, /Recomposição sem progresso e buffer crítico[\s\S]*exit 1/);
assert.match(replenisher, /required_ready[\s\S]*A data obrigatória[\s\S]*exit 1/);
assert.match(replenisher, /queue: max/);

const alerts = read("automation-alerts.yml");
assert.match(alerts, /TheBiker — Recomposição automática do buffer editorial/);
assert.match(alerts, /jobs:\s+alert:\s+runs-on: ubuntu-latest/);
assert.match(alerts, /group: thebiker-operational-alerts-\$\{\{ github\.event\.workflow_run\.id \}\}/);
assert.match(alerts, /retries: 3/);
assert.match(alerts, /retry-exempt-status-codes: 400,401,403,404,422/);
assert.match(alerts, /new Set\(\['failure', 'timed_out', 'action_required', 'cancelled'\]\)/);
assert.match(alerts, /run\.conclusion === 'cancelled' && run\.name === 'Deploy Blog'/);
assert.match(alerts, /createHash\('sha256'\)/);
assert.match(alerts, /downloadJobLogsForWorkflowRun/);
assert.match(alerts, /causeSummaries = Object\.freeze/);
assert.match(alerts, /redactSensitive/);
assert.match(alerts, /httpStatus \|\| 'no-http'/);
assert.match(alerts, /thebiker-failure:\$\{fingerprint\}/);
assert.match(alerts, /issues\.update/);
assert.doesNotMatch(alerts, /issues\.createComment/);
assert.doesNotMatch(alerts, /Causa observada/);

const deploy = read("deploy.yml");
assert.match(deploy, /force_deploy:/);
assert.match(deploy, /concurrency:\s+group: pages\s+cancel-in-progress: false/);
assert.match(deploy, /repository_dispatch:[\s\S]*types: \[editorial-deploy\]/);
assert.match(deploy, /github\.event_name == 'push' \|\| inputs\.force_deploy == true \|\| github\.event_name == 'repository_dispatch'/);
assert.doesNotMatch(deploy, /workflow_run:/);
assert.equal((deploy.match(/actions\/checkout@v7[\s\S]*?ref: main/g) || []).length, 2);

for (const name of ["replenish-buffer.yml", "automation-alerts.yml", "deploy.yml"]) {
  yaml.load(read(name));
}

const alertWorkflow = yaml.load(alerts);
const script = alertWorkflow.jobs.alert.steps[0].with.script;
const runAlert = new Function("require", "context", "github", "core", "Buffer", `return (async () => {\n${script}\n})();`);
const nodeRequire = createRequire(import.meta.url);

async function exerciseAlert(log, { conclusion = "failure", workflowName = "Deploy Blog", expectCreated = true } = {}) {
  const listJobsForWorkflowRun = () => {};
  const listForRepo = () => {};
  let created = null;
  const github = {
    paginate: async (method) => {
      if (method === listJobsForWorkflowRun) {
        return [{
          id: 99,
          name: "build",
          conclusion,
          steps: [{ name: "Run publication gates", conclusion }],
        }];
      }
      if (method === listForRepo) return [];
      throw new Error("Método paginate inesperado no teste");
    },
    rest: {
      actions: {
        listJobsForWorkflowRun,
        downloadJobLogsForWorkflowRun: async () => ({ data: log }),
      },
      issues: {
        listForRepo,
        update: async () => { throw new Error("Issue inexistente não deve ser atualizada"); },
        create: async (payload) => { created = payload; },
      },
    },
  };
  await runAlert(
    nodeRequire,
    {
      repo: { owner: "thebiker", repo: "blog" },
      payload: {
        workflow_run: {
          id: 10,
          name: workflowName,
          conclusion,
          created_at: "2026-08-20T12:00:00Z",
          updated_at: "2026-08-20T12:01:00Z",
          head_sha: "abcdef0123456789",
          html_url: "https://github.example/runs/10",
        },
      },
    },
    github,
    { warning: () => {}, notice: () => {} },
    Buffer,
  );
  if (expectCreated) assert.ok(created, "alerta deveria criar uma issue para falha nova");
  else assert.equal(created, null, "cancelamento esperado não deve criar issue");
  return created;
}

const alert401 = await exerciseAlert("##[error] Authorization: Bearer sk-live-example HTTP 401 password=hunter2");
const alert500 = await exerciseAlert("##[error] Authorization: Bearer sk-live-example HTTP 500 password=hunter2");
assert.match(alert401.body, /Causa classificada:\*\* Autenticação ou credencial rejeitada \(HTTP 401\)/);
assert.doesNotMatch(alert401.body, /sk-live-example|hunter2|Authorization|Bearer|password=/i);
assert.notEqual(alert401.title, alert500.title, "códigos HTTP distintos precisam gerar fingerprints distintos");
await exerciseAlert("", { conclusion: "cancelled", workflowName: "Deploy Blog", expectCreated: false });
await exerciseAlert("##[error] cancelled by operator", { conclusion: "cancelled", workflowName: "TheBiker — Automação editorial" });

const deployWorkflow = yaml.load(deploy);
assert.deepEqual(deployWorkflow.permissions, {});
assert.deepEqual(deployWorkflow.jobs.build.permissions, { contents: "read" });
assert.deepEqual(deployWorkflow.jobs.deploy.permissions, {
  contents: "read",
  pages: "write",
  "id-token": "write",
});

console.log("Automação e observabilidade dos workflows validadas com sucesso.");
