import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { editorialWordRange } from "../bot/src/editorial-length-policy.js";
import { markdownPublicationErrors } from "../bot/src/validation/markdown-publication-gates.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsRoot = path.join(root, "_posts");
const write = process.argv.includes("--write");
const nowArgument = process.argv.find((argument) => argument.startsWith("--now="));
const heldAt = nowArgument ? new Date(nowArgument.slice("--now=".length)) : new Date();

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files;
}

function frontmatterValue(frontmatter, field) {
  return frontmatter.match(new RegExp(`^${field}:\\s*(.*)$`, "mu"))?.[1]?.trim().replace(/^['"]|['"]$/gu, "") || "";
}

function countWords(body) {
  return (body.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []).length;
}

function setFrontmatterField(content, field, value) {
  const pattern = new RegExp(`^${field}:.*$`, "mu");
  if (pattern.test(content)) return content.replace(pattern, `${field}: ${value}`);
  return content.replace(/^---\r?\n/u, `---\n${field}: ${value}\n`);
}

const holds = [];
for (const file of await markdownFiles(postsRoot)) {
  const relative = path.relative(root, file).replace(/\\/gu, "/");
  if (relative.includes("/drafts/") || relative.includes("/archived/")) continue;
  const content = await fs.readFile(file, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u);
  if (!match) continue;
  const frontmatter = match[1];
  if (/^published:\s*false\s*$/mu.test(frontmatter)) continue;
  const body = content.slice(match[0].length);
  const contentType = frontmatterValue(frontmatter, "content_type");
  const words = countWords(body);
  const { min, max } = editorialWordRange(contentType);
  const sources = (body.match(/^[-*]\s+.*https?:\/\//gimu) || []).length;
  const headings = (body.match(/^##\s+/gmu) || []).length;
  const reasons = [];
  if (sources < 2) reasons.push(`apenas ${sources} fonte(s) visível(is); mínimo 2`);
  if (words < min) reasons.push(`${words} palavras; mínimo editorial ${min}`);
  if (words > max) reasons.push(`${words} palavras; máximo editorial ${max}`);
  if (headings < 5) reasons.push(`apenas ${headings} seções; mínimo 5`);
  reasons.push(...markdownPublicationErrors(content));
  if (reasons.length === 0) continue;
  holds.push({ path: relative, reasons: [...new Set(reasons)] });
  if (write) {
    let updated = setFrontmatterField(content, "published", "false");
    updated = setFrontmatterField(updated, "status", '"draft"');
    updated = setFrontmatterField(updated, "editorial_status", '"draft"');
    updated = setFrontmatterField(updated, "reviewed_by", '""');
    updated = setFrontmatterField(updated, "editorial_hold_reason", '"Revisão de fontes, precisão e concisão pendente"');
    await fs.writeFile(file, updated);
  }
}

if (write) {
  const ledgerPath = path.join(root, "content/quarantine/editorial-quality-hold.json");
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify({
    schemaVersion: 1,
    heldAt: heldAt.toISOString(),
    items: holds,
  }, null, 2)}\n`);
}

console.log(JSON.stringify({ write, holdCount: holds.length, holds }, null, 2));
if (!write && holds.length > 0) {
  throw new Error(`${holds.length} artigo(s) publicado(s) não atendem o contrato editorial`);
}
