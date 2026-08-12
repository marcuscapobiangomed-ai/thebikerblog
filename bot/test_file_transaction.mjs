import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStagedWorkspace, discardStagedWorkspace, promoteStagedPaths } from "./src/automation/file-transaction.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "thebiker-file-transaction-"));
try {
  await fs.mkdir(path.join(root, "state"), { recursive: true });
  await fs.writeFile(path.join(root, "state/a.txt"), "original-a");
  await fs.writeFile(path.join(root, "state/b.txt"), "original-b");

  const failed = await createStagedWorkspace(root, ["state/a.txt", "state/b.txt"], { transactionId: "rollback" });
  await fs.writeFile(path.join(failed.workspaceRoot, "state/a.txt"), "candidate-a");
  await fs.writeFile(path.join(failed.workspaceRoot, "state/b.txt"), "candidate-b");
  await assert.rejects(promoteStagedPaths(failed, ["state/a.txt", "state/b.txt"], {
    beforePromote: ({ index }) => { if (index === 1) throw new Error("falha induzida durante promoção"); },
  }), /falha induzida/);
  assert.equal(await fs.readFile(path.join(root, "state/a.txt"), "utf8"), "original-a");
  assert.equal(await fs.readFile(path.join(root, "state/b.txt"), "utf8"), "original-b");
  await discardStagedWorkspace(failed);

  await fs.writeFile(path.join(root, "state/delete-a.txt"), "delete-a");
  await fs.writeFile(path.join(root, "state/delete-b.txt"), "delete-b");
  const deleteRollback = await createStagedWorkspace(root, ["state/a.txt"], { transactionId: "delete-rollback" });
  await fs.writeFile(path.join(deleteRollback.workspaceRoot, "state/a.txt"), "candidate-after-delete");
  await assert.rejects(promoteStagedPaths(deleteRollback, ["state/a.txt"], {
    deletions: ["state/delete-a.txt", "state/delete-b.txt"],
    beforePromote: ({ index }) => { if (index === 2) throw new Error("falha induzida entre remoções"); },
  }), /falha induzida entre remoções/);
  assert.equal(await fs.readFile(path.join(root, "state/a.txt"), "utf8"), "original-a");
  assert.equal(await fs.readFile(path.join(root, "state/delete-a.txt"), "utf8"), "delete-a");
  assert.equal(await fs.readFile(path.join(root, "state/delete-b.txt"), "utf8"), "delete-b");
  await discardStagedWorkspace(deleteRollback);

  const successful = await createStagedWorkspace(root, ["state/a.txt", "state/b.txt"], { transactionId: "success" });
  await fs.writeFile(path.join(successful.workspaceRoot, "state/a.txt"), "candidate-a");
  await fs.writeFile(path.join(successful.workspaceRoot, "state/b.txt"), "candidate-b");
  await promoteStagedPaths(successful, ["state/a.txt", "state/b.txt"]);
  assert.equal(await fs.readFile(path.join(root, "state/a.txt"), "utf8"), "candidate-a");
  assert.equal(await fs.readFile(path.join(root, "state/b.txt"), "utf8"), "candidate-b");
  await discardStagedWorkspace(successful);

  await assert.rejects(createStagedWorkspace(root, ["../fora"]), /Caminho transacional inseguro/);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log("Transação de arquivos validada com rollback integral.");
