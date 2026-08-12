import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function safeRelative(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`Caminho transacional inseguro: ${relativePath}`);
  }
  return normalized;
}

async function exists(target) {
  return fs.stat(target).then(() => true).catch((error) => error?.code === "ENOENT" ? false : Promise.reject(error));
}

async function copyIfPresent(source, target) {
  if (!await exists(source)) return false;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, force: true });
  return true;
}

export async function createStagedWorkspace(root, relativePaths, { transactionId } = {}) {
  const id = transactionId || `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const transactionRoot = path.join(root, ".automation", "staging", id);
  const workspaceRoot = path.join(transactionRoot, "workspace");
  for (const relativePath of [...new Set(relativePaths.map(safeRelative))]) {
    await copyIfPresent(path.join(root, relativePath), path.join(workspaceRoot, relativePath));
  }
  return { id, root, transactionRoot, workspaceRoot };
}

export async function promoteStagedPaths(transaction, relativePaths, { beforePromote, deletions = [] } = {}) {
  const backupRoot = path.join(transaction.transactionRoot, "backup");
  const promoted = [];
  try {
    for (const [index, rawPath] of [...new Set(relativePaths)].entries()) {
      const relativePath = safeRelative(rawPath);
      const staged = path.join(transaction.workspaceRoot, relativePath);
      if (!await exists(staged)) throw new Error(`Artefato transacional ausente: ${relativePath}`);
      const target = path.join(transaction.root, relativePath);
      const backup = path.join(backupRoot, relativePath);
      await beforePromote?.({ index, relativePath, staged, target });
      const hadOriginal = await exists(target);
      if (hadOriginal) {
        await fs.mkdir(path.dirname(backup), { recursive: true });
        await fs.rename(target, backup);
      }
      try {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.rename(staged, target);
      } catch (error) {
        if (hadOriginal) await fs.rename(backup, target);
        throw error;
      }
      promoted.push({ target, backup, hadOriginal, deletion: false });
    }
    for (const [offset, rawPath] of [...new Set(deletions)].entries()) {
      const relativePath = safeRelative(rawPath);
      const target = path.join(transaction.root, relativePath);
      const backup = path.join(backupRoot, "deleted", relativePath);
      await beforePromote?.({ index: relativePaths.length + offset, relativePath, target, deletion: true });
      const hadOriginal = await exists(target);
      if (!hadOriginal) throw new Error(`Artefato a remover não existe: ${relativePath}`);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.rename(target, backup);
      promoted.push({ target, backup, hadOriginal, deletion: true });
    }
  } catch (error) {
    for (const entry of promoted.reverse()) {
      if (!entry.deletion) await fs.rm(entry.target, { recursive: true, force: true });
      if (entry.hadOriginal) {
        await fs.mkdir(path.dirname(entry.target), { recursive: true });
        await fs.rename(entry.backup, entry.target);
      }
    }
    throw error;
  }
}

export async function discardStagedWorkspace(transaction) {
  await fs.rm(transaction.transactionRoot, { recursive: true, force: true });
}
