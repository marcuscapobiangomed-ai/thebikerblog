#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
  }
  return files;
}

function scalar(frontmatter, name) {
  const match = frontmatter.match(new RegExp(`^${name}:\\s*["']?([^"'\\r\\n]+)`, 'm'));
  return String(match?.[1] || '').trim().toLowerCase();
}

function classification(frontmatter) {
  const contentType = scalar(frontmatter, 'content_type');
  const title = scalar(frontmatter, 'title').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const progression = /iniciante|primeira bike|comecar|primeiro upgrade/.test(title);
  const audienceSegment = progression ? 'committed_progression_cyclists' : 'core_technical_cyclists';
  const experienceLevelTarget = progression ? 'mixed_progression' : 'intermediate_advanced';
  let audienceIntent = 'technical_learning';
  if (contentType === 'comparativo') audienceIntent = 'compare_products';
  else if (['review', 'guia-de-compra'].includes(contentType)) audienceIntent = 'purchase_consideration';
  else if (['calendario-provas', 'guia-prova'].includes(contentType)) audienceIntent = 'find_race_to_enter';
  else if (['noticia', 'lancamento', 'previa-corrida', 'resumo-corrida'].includes(contentType)) audienceIntent = 'follow_market_competition';
  else if (contentType === 'guia-turistico') audienceIntent = 'plan_ride';
  else if (contentType === 'guia-tecnico') audienceIntent = 'solve_problem';
  return { audienceSegment, audienceIntent, experienceLevelTarget };
}

function normalizePost(content, file) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${file}: frontmatter ausente`);
  const frontmatter = match[1];
  const fields = ['audience_segment', 'audience_intent', 'experience_level_target'];
  const present = fields.filter((field) => new RegExp(`^${field}:`, 'm').test(frontmatter));
  if (present.length === fields.length) return { content, changed: false };
  if (present.length > 0) throw new Error(`${file}: taxonomia de público parcial (${present.join(', ')})`);
  const values = classification(frontmatter);
  const block = [
    `audience_segment: "${values.audienceSegment}"`,
    `audience_intent: "${values.audienceIntent}"`,
    `experience_level_target: "${values.experienceLevelTarget}"`,
  ].join('\n');
  const anchor = /^content_type:.*$/m.test(frontmatter) ? /^content_type:.*$/m : /^author:.*$/m;
  if (!anchor.test(frontmatter)) throw new Error(`${file}: sem ponto seguro para inserir taxonomia de público`);
  const nextFrontmatter = frontmatter.replace(anchor, (line) => `${line}\n${block}`);
  return { content: content.replace(frontmatter, nextFrontmatter), changed: true };
}

const files = await markdownFiles(path.join(root, '_posts'));
let changed = 0;
for (const file of files) {
  const content = await fs.readFile(file, 'utf8');
  const result = normalizePost(content, path.relative(root, file));
  if (!result.changed) continue;
  changed += 1;
  if (write) await fs.writeFile(file, result.content, 'utf8');
}

if (!write && changed > 0) {
  throw new Error(`${changed} post(s) sem taxonomia explícita de público; execute npm run normalize:audience`);
}
console.log(`${files.length} post(s) verificados; ${write ? changed + ' atualizado(s)' : 'taxonomia completa'}.`);
