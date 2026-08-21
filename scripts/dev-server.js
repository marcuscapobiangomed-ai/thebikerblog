import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import * as yaml from "js-yaml";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const host = valueAfter("--host", "0.0.0.0");
const port = Number(valueAfter("--port", process.env.PORT || "4173"));

const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
const parseDocument = (source) => {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  return match ? { data: yaml.load(match[1]) || {}, body: match[2] } : { data: {}, body: source };
};
const slugFromFilename = (filename) => filename.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
const posts = fs.readdirSync(path.join(projectRoot, "_posts"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => {
    const { data } = parseDocument(read(path.join("_posts", entry.name)));
    return { ...data, url: `/${slugFromFilename(entry.name)}/`, date: new Date(data.date || entry.name.slice(0, 10)) };
  })
  .filter((post) => post.status !== "draft")
  .sort((a, b) => b.date - a.date);

const findPost = (fragment) => posts.find((post) => String(post.title || "").includes(fragment));
const guidePosts = posts
  .filter((post) => ["guia-de-compra", "guias-de-compra", "guia-tecnico"].includes(post.category))
  .slice(0, 4);
const config = yaml.load(read("_config.yml"));
const data = {
  "race-events": JSON.parse(read(path.join("_data", "race-events.json"))),
  "countries-pt": JSON.parse(read(path.join("_data", "countries-pt.json")))
};
const site = { ...config, baseurl: "", posts, data, time: new Date() };
const page = { ...parseDocument(read("index.html")).data, url: "/" };
const context = {
  site,
  page,
  recent_posts: posts.slice(0, 4),
  guide_posts: guidePosts,
  hero_post: findPost("Tendências em Bikes"),
  carbon_post: findPost("Carbono vs Alumínio"),
  wheels_post: findPost("Rodas de Carbono Custo-Benefício"),
  routes_post: findPost("Melhores Estradas e Rotas"),
  pedals_post: findPost("Pedais Clipless para Iniciantes"),
  groups_post: findPost("Shimano 105 vs Ultegra"),
  helmets_post: findPost("Melhores Capacetes"),
  maintenance_post: findPost("Manutenção Básica")
};

const engine = new Liquid({
  strictVariables: false,
  strictFilters: false,
  jekyllInclude: true,
  root: [path.join(projectRoot, "_includes")],
  extname: ".html"
});
engine.registerFilter("date_to_xmlschema", (value) => new Date(value).toISOString());

function expandIncludes(source) {
  return source.replace(/{%\s*include\s+([^\s%]+)[^%]*%}/g, (_, includeName) => {
    const includePath = path.join("_includes", includeName);
    return fs.existsSync(path.join(projectRoot, includePath)) ? expandIncludes(read(includePath)) : "";
  });
}

async function renderHome() {
  let homeSource = parseDocument(read("index.html")).body;
  homeSource = homeSource.replace(/^{%\s*assign[^%]*%}\s*$/gm, "");
  const content = await engine.parseAndRender(homeSource, context);
  let layout = expandIncludes(read("_layouts/default.html"));
  layout = layout.replace(/{%\s*seo\s*%}/g, "");
  return engine.parseAndRender(layout, { ...context, content });
}

async function renderPage(relativePath, url) {
  const document = parseDocument(read(relativePath));
  const currentPage = { ...document.data, url };
  const content = await engine.parseAndRender(document.body, { ...context, page: currentPage });
  let layout = expandIncludes(read("_layouts/default.html"));
  layout = layout.replace(/{%\s*seo\s*%}/g, "");
  return engine.parseAndRender(layout, { ...context, page: currentPage, content });
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const homeHtml = await renderHome();
const pageRoutes = new Map([
  ["/corridas/", await renderPage("corridas.md", "/corridas/")],
  ["/corridas/detalhes/", await renderPage("corridas-detalhes.md", "/corridas/detalhes/")],
  ["/calculadoras/", await renderPage("calculadoras.html", "/calculadoras/")],
  ["/calculadoras/tamanho-road-bike/", await renderPage("calculadora-tamanho.html", "/calculadoras/tamanho-road-bike/")],
  ["/calculadoras/relacao-marchas/", await renderPage("calculadora-marchas.html", "/calculadoras/relacao-marchas/")],
]);
const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (requestPath === "/" || requestPath === "/index.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(homeHtml);
    return;
  }
  if (pageRoutes.has(requestPath)) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(pageRoutes.get(requestPath));
    return;
  }
  const absolutePath = path.resolve(projectRoot, `.${requestPath}`);
  if (!absolutePath.startsWith(`${projectRoot}${path.sep}`) || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Página não encontrada");
    return;
  }
  response.writeHead(200, { "content-type": mimeTypes[path.extname(absolutePath).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(absolutePath).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`TheBiker Blog preview running at http://${host}:${port}\n`);
});
