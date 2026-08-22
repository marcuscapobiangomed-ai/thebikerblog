import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as yaml from "js-yaml";

const root = process.cwd();
const sourceOnly = process.argv.includes("--source-only");
const siteDir = path.join(root, "_site");
const errors = [];
const forbiddenEditorialBackstage = [
  /como este artigo foi produzido/iu,
  /use esta ficha como roteiro documental/iu,
  /segundo modelo listado na pesquisa/iu,
  /identidade e escopo da ficha/iu,
  /conte[uú]do (?:foi )?elaborado com aux[ií]lio de IA/iu,
  /(?:nenhum|o|a|os|as|este|esta)?\s*(?:produto|bicicleta|bike|modelo|equipamento|aplicativo)?\s*n[aã]o (?:foi|foram) testad[oa]s? presencialmente/iu,
  /(?:a equipe|n[oó]s) n[aã]o (?:realizou|realizamos) (?:um )?teste presencial/iu,
  /(?:este|esta) artigo (?:é|e) (?:uma )?an[aá]lise documental/iu,
  /ofertas em revis[aã]o/iu,
  /(?:pre[cç]os e disponibilidade|variantes e URLs) (?:est[aã]o|passam por) (?:em )?verifica[cç][aã]o editorial/iu,
  /geometria n[aã]o dispon[ií]vel/iu,
  /configura[cç][aã]o pendente de confirma[cç][aã]o/iu,
  /n[aã]o completamos lacunas/iu,
  /bloqueia o snapshot se a fonte ficar inconsistente/iu,
  /distingue experi[eê]ncia pr[aá]tica, pesquisa documental/iu,
  /layout:\s*default\s+title:/iu,
  /agenda em conting[eê]ncia/iu,
  /data-calendar-status=/iu,
];

function normalized(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory() && [".git", "node_modules", "vendor", "_site"].includes(entry.name)) return [];
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function frontmatter(file) {
  const content = fs.readFileSync(file, "utf8");
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  if (!match) return {};
  return yaml.load(match[1]) || {};
}

function outputForPermalink(permalink) {
  const clean = String(permalink).replace(/^\//, "");
  return clean.endsWith("/")
    ? path.join(siteDir, clean, "index.html")
    : path.join(siteDir, clean);
}

function outputCandidatesFor(file, data) {
  if (data.permalink) return [outputForPermalink(data.permalink)];

  const relative = normalized(path.relative(root, file));
  const post = path.basename(file).match(/^(\d{4})-(\d{2})-\d{2}-(.+)\.(?:md|markdown|html)$/i);
  if (relative.startsWith("_posts/") && post) {
    return [path.join(siteDir, post[1], post[2], post[3], "index.html")];
  }

  const withoutExtension = relative.replace(/\.(?:md|markdown)$/i, ".html");
  return [path.join(siteDir, withoutExtension)];
}

const config = yaml.load(fs.readFileSync(path.join(root, "_config.yml"), "utf8")) || {};
const exclusions = new Set((config.exclude || []).map(normalized));
for (const required of ["content", "_posts/drafts", "_posts/archived"]) {
  if (!exclusions.has(required)) errors.push(`_config.yml não exclui estruturalmente ${required}`);
}

for (const file of walk(root).filter((candidate) => /\.(?:md|markdown|html)$/iu.test(candidate))) {
  const relative = normalized(path.relative(root, file));
  if ([...exclusions].some((excluded) => relative === excluded || relative.startsWith(`${excluded}/`))) continue;
  const source = fs.readFileSync(file, "utf8");
  if (/\r?\n---\r?\n(?:layout|title|description|permalink):/iu.test(source)) {
    errors.push(`segundo bloco de frontmatter exposto no corpo: ${relative}`);
  }
}

if (!sourceOnly) {
  if (!fs.existsSync(siteDir)) {
    errors.push("_site não existe; execute o teste após o build do Jekyll");
  } else {
    for (const forbidden of ["content", "_posts/drafts", "_posts/archived", "quarantine"]) {
      if (fs.existsSync(path.join(siteDir, forbidden))) {
        errors.push(`diretório privado presente no artefato: _site/${forbidden}`);
      }
    }

    const sourceFiles = walk(root).filter((file) => /\.(?:md|markdown|html)$/i.test(file));

    for (const file of sourceFiles) {
      const data = frontmatter(file);
      if (data.published !== false) continue;
      for (const candidate of outputCandidatesFor(file, data)) {
        if (fs.existsSync(candidate)) {
          errors.push(`conteúdo com published: false foi gerado: ${normalized(path.relative(root, candidate))}`);
        }
      }
    }

    const forbiddenArtifactNames = new Set(["ledger.json", "editorial-quality-hold.json"]);
    for (const file of walk(siteDir)) {
      if (forbiddenArtifactNames.has(path.basename(file))) {
        errors.push(`arquivo de governança presente no artefato: ${normalized(path.relative(root, file))}`);
      }
      if (!/\.(?:html?|xml|json|txt)$/iu.test(file)) continue;
      const publicContent = fs.readFileSync(file, "utf8");
      const backstage = forbiddenEditorialBackstage.find((pattern) => pattern.test(publicContent));
      if (backstage) {
        errors.push(`bastidor editorial exposto em ${normalized(path.relative(root, file))}: ${publicContent.match(backstage)?.[0]}`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Limites de publicação reprovados:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(sourceOnly
  ? "Limites estruturais de publicação configurados."
  : "Artefato público sem rascunhos, arquivados, quarentena ou páginas despublicadas.");
