import { productKnowledgeCollection } from "./knowledge/product-knowledge.js";

export const LEGACY_GITHUB_PUBLISHER_FLAG = "THEBIKER_ENABLE_LEGACY_GITHUB_PUBLISHER";

export class GitHubPublisher {
  constructor({ env = process.env, warn = console.warn } = {}) {
    this.token = env.GITHUB_TOKEN;
    this.user = env.GITHUB_USER;
    this.repo = env.GITHUB_REPO;
    this.branch = env.GITHUB_BRANCH || "main";
    this.baseUrl = env.BLOG_URL;
    this.legacyWriteEnabled = env[LEGACY_GITHUB_PUBLISHER_FLAG] === "true";
    this.warn = warn;
    this.apiBase = `https://api.github.com/repos/${this.user}/${this.repo}`;
    if (!this.token || !this.user || !this.repo) {
      throw new Error("GitHubPublisher exige GITHUB_TOKEN, GITHUB_USER e GITHUB_REPO");
    }
  }

  _assertLegacyWriteEnabled() {
    if (!this.legacyWriteEnabled) {
      throw new Error(
        `GitHubPublisher depreciado: use a campanha transacional; para compatibilidade explícita defina ${LEGACY_GITHUB_PUBLISHER_FLAG}=true`,
      );
    }
    this.warn(`AVISO: GitHubPublisher e um caminho legado habilitado por ${LEGACY_GITHUB_PUBLISHER_FLAG}.`);
  }

  async findOpenPullRequest(branchName) {
    const head = encodeURIComponent(`${this.user}:${branchName}`);
    const pulls = await this._api("GET", `/pulls?state=open&head=${head}&base=${encodeURIComponent(this.branch)}`);
    return pulls[0] || null;
  }

  async _api(method, urlPath, body) {
    const url = `${this.apiBase}${urlPath}`;
    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "thebikerblog-bot",
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitHub API ${res.status}: ${err}`);
    }
    return res.json();
  }

  async _createBranch(branchName) {
    const refData = await this._api("GET", `/git/refs/heads/${this.branch}`);
    const baseSha = refData.object.sha;
    try {
      await this._api("POST", "/git/refs", {
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      });
    } catch (err) {
      if (!err.message.includes("422")) throw err;
    }
  }

  async _commitFile(branchName, pathInRepo, content, message) {
    let sha = null;
    try {
      const existing = await this._api("GET", `/contents/${pathInRepo}?ref=${branchName}`);
      sha = existing.sha;
    } catch { /* novo arquivo */ }

    const body = {
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch: branchName,
    };
    if (sha) body.sha = sha;
    await this._api("PUT", `/contents/${pathInRepo}`, body);
  }

  async publishPost({ postContent, slug, researchData, productKnowledge, imageManifest, imageProductionPlan, checklist }) {
    this._assertLegacyWriteEnabled();
    const today = new Date().toISOString().split("T")[0];
    const fileName = `${today}-${slug}.md`;
    const branchName = `content/${slug}`;

    const openPullRequest = await this.findOpenPullRequest(branchName);
    if (openPullRequest) {
      console.log(`PR já existe: ${openPullRequest.html_url}`);
      return openPullRequest.html_url;
    }

    console.log(`🌿 Criando branch: ${branchName}`);
    await this._createBranch(branchName);

    // 1. Post em _posts/drafts/
    console.log(`📝 Commitando artigo`);
    await this._commitFile(branchName, `_posts/drafts/${fileName}`, postContent, `📝 Draft: ${slug}`);

    // 2. Ficha de pesquisa
    if (researchData) {
      console.log(`📊 Commitando ficha de pesquisa`);
      await this._commitFile(
        branchName,
        `content/research/${slug}.json`,
        JSON.stringify(researchData, null, 2),
        `📊 Research: ${slug}`
      );
    }

    // 3. Image manifest
    if (imageManifest) {
      console.log(`🖼️  Commitando plano de imagens`);
      await this._commitFile(
        branchName,
        `assets/img/posts/${slug}/image-manifest.json`,
        JSON.stringify(imageManifest, null, 2),
        `🖼️  Images: ${slug}`
      );
    }

    if (productKnowledge) {
      console.log(`Commitando memória técnica do produto`);
      await this._commitFile(
        branchName,
        `_data/product-knowledge/${productKnowledgeCollection(productKnowledge.type)}/${productKnowledge.id}.json`,
        JSON.stringify(productKnowledge, null, 2),
        `Product knowledge: ${productKnowledge.id}`,
      );
    }

    if (imageProductionPlan) {
      console.log(`🖼️ Commitando plano de produção de imagens`);
      await this._commitFile(
        branchName,
        `assets/img/posts/${slug}/image-plan.json`,
        JSON.stringify(imageProductionPlan, null, 2),
        `🖼️ Image plan: ${slug}`,
      );
    }

    // 4. Cria PR
    console.log(`🔀 Criando PR: ${branchName} → ${this.branch}`);
    let prBody = `## ${slug.replace(/-/g, " ")}\n\n### Método\n`;
    prBody += researchData
      ? `- ${researchData.testedByTheBikerBlog ? "[x] Teste presencial" : "[ ] Teste presencial"}\n- ${researchData.reviewMethod === "desk-research" ? "[x]" : "[ ]"} Análise documental\n`
      : "- [ ] Método não informado\n";

    // Fontes
    if (researchData?.sources) {
      prBody += "\n### Fontes\n";
      for (const src of researchData.sources) {
        prBody += `- [${src.type === "manufacturer" ? "x" : " "}] ${src.name} (${src.type})\n`;
      }
    }

    // Imagens
    if (imageManifest) {
      prBody += "\n### Imagens\n";
      if (imageManifest.hero) {
        prBody += `- [ ] hero: ${imageManifest.hero.alt || "sem descrição"}\n`;
      }
      if (imageManifest.variants) {
        for (const [key, img] of Object.entries(imageManifest.variants)) {
          prBody += `- [ ] ${key}: ${img.file || "sem arquivo"}\n`;
        }
      }
    }

    // Checklist genérico
    prBody += `
### Revisão
- [ ] Especificações confirmadas
- [ ] Preços confirmados
- [ ] Texto revisado
- [ ] Links testados
- [ ] Build aprovado
- [ ] status: draft → status: published

> 🤖 PR gerado automaticamente pelo The Biker Blog Bot.
`;

    if (checklist && checklist.length > 0) {
      prBody += `\n### Pontos que precisam de atenção\n`;
      for (const item of checklist) {
        prBody += `- [ ] ${item}\n`;
      }
    }

    const prData = await this._api("POST", "/pulls", {
      title: `[Draft] ${slug.replace(/-/g, " ")}`,
      head: branchName,
      base: this.branch,
      body: prBody,
    });

    console.log(`✅ PR criado: ${prData.html_url}`);
    return prData.html_url;
  }

  /**
   * Cria o PR direto de um post já gerado (modo legado / WhatsApp)
   */
  async publishSimple(postContent, slug) {
    return this.publishPost({ postContent, slug, researchData: null, imageManifest: null, checklist: [] });
  }
}
