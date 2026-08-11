import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prepareImageVariants } from "./prepare-variants.js";
import { validateImageManifestV2 } from "../validation/image-manifest-v2.js";
import { releaseAssetUse } from "./asset-library.js";

const CATEGORY_LABELS = {
  "manutencao-ajustes": "OFICINA DE PRECISÃO",
  engenharia: "ENGENHARIA APLICADA",
  review: "ANÁLISE TÉCNICA",
  comparativo: "COMPARATIVO THEBIKER",
  componentes: "COMPONENTES",
  lancamentos: "LANÇAMENTOS",
  competicoes: "COMPETIÇÕES",
};

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]);
}

function titleLines(title, max = 34) {
  const words = title.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function coverSvg(item) {
  const lines = titleLines(item.title);
  const title = lines.map((line, index) => `<text x="110" y="${355 + index * 88}" fill="#ffffff" font-family="Arial, sans-serif" font-size="66" font-weight="700">${escapeXml(line)}</text>`).join("");
  return Buffer.from(`<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="900" fill="#101419"/>
    <path d="M1040 -80 L1710 590 L1710 980 L620 -110 Z" fill="#d51f2b" opacity="0.94"/>
    <path d="M1180 80 L1630 530" stroke="#ffffff" stroke-width="3" opacity="0.28"/>
    <circle cx="1320" cy="450" r="220" fill="none" stroke="#ffffff" stroke-width="18" opacity="0.18"/>
    <circle cx="1320" cy="450" r="82" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.22"/>
    <text x="110" y="120" fill="#d51f2b" font-family="Arial, sans-serif" font-size="42" font-weight="800">THEBIKER</text>
    <text x="110" y="205" fill="#b9c0c8" font-family="Arial, sans-serif" font-size="25" font-weight="700" letter-spacing="4">${escapeXml(CATEGORY_LABELS[item.category] || "CICLISMO TÉCNICO")}</text>
    ${title}
    <line x1="110" y1="790" x2="760" y2="790" stroke="#d51f2b" stroke-width="8"/>
    <text x="110" y="840" fill="#b9c0c8" font-family="Arial, sans-serif" font-size="24">Dados, método e precisão para quem pedala sério.</text>
  </svg>`);
}

export async function produceCampaignCover({ root, item, approvedAt }) {
  const directory = path.join(root, "assets", "img", "posts", item.id);
  await fs.mkdir(directory, { recursive: true });
  const source = path.join(directory, "source.svg");
  await fs.writeFile(source, coverSvg(item));
  const baseManifest = {
    schemaVersion: 2,
    status: "approved",
    editorialUse: "publishable",
    assetType: "technical-diagram",
    factualSubject: "conceptual",
    editorialScope: item.category === "competicoes" ? "race-context" : "portfolio",
    purpose: `Identificar visualmente a pauta técnica ${item.title}.`,
    alt: `Capa técnica TheBiker para o artigo ${item.title}`,
    caption: "Capa técnica produzida para o conteúdo editorial TheBiker.",
    credit: "TheBiker",
    containsText: true,
    aiGenerated: false,
    depictedBrands: [],
    depictedProducts: [],
    focalPoint: { x: 0.5, y: 0.5 },
    source: {
      type: "own-production",
      name: "TheBiker",
      url: "",
      obtainedAt: approvedAt,
      license: "Propriedade editorial TheBiker",
      licenseEvidence: "Arte técnica original produzida pelo pipeline editorial do repositório.",
    },
    files: {},
    approval: {
      reviewedBy: "TheBiker AI Editorial Gate",
      approvedAt,
      method: "automated-editorial-gate",
      checks: ["origem-própria", "sem-marca-concorrente", "dimensões", "peso-do-arquivo"],
    },
  };
  const manifest = await prepareImageVariants({ input: source, outputDirectory: directory, manifest: baseManifest });
  await fs.writeFile(path.join(directory, "image-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  validateImageManifestV2(manifest, directory, { requirePublishable: true });
  await releaseAssetUse(root, { postId: item.id, position: "hero" });
  return { directory, manifest, publicBase: `/assets/img/posts/${item.id}` };
}
