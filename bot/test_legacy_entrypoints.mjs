import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const pipelineTest = read("scripts/pipeline-test.ps1");
assert.match(pipelineTest, /npm run validate:ci/);
assert.doesNotMatch(pipelineTest, /Set-Content|_posts\\drafts|Como este artigo foi produzido/);

const batch = read("bot/src/batch.js");
assert.match(batch, /Batch legado bloqueado permanentemente/);
assert.doesNotMatch(batch, /publishPost\s*\(/);

const manual = read("bot/src/manual.js");
assert.match(manual, /assertMarkdownPublicationGates\(post\.content\)/);
assert.ok(manual.includes("/^published:\\s*false\\s*$/mu"));
assert.match(manual, /_posts", "drafts/);

assert.match(read("scripts/generate-pages.js"), /foi bloqueado/);
assert.doesNotMatch(read("scripts/generate-pages.js"), /published:\s*true/);
assert.match(read("scripts/import-thebiker-catalog.js"), /Importador legado bloqueado/);
assert.match(read("bot/src/cron_post.js"), /Entrypoint automation:run legado bloqueado/);

console.log("Entrypoints legados permanecem bloqueados ou restritos a rascunhos validados.");
