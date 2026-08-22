import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { isPortfolioBrand } from "../portfolio-policy.js";

const AssetFileSchema = z.object({
  file: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  maxKB: z.number().positive(),
});

const SourceSchema = z.object({
  type: z.enum([
    "manufacturer",
    "thebiker",
    "own-production",
    "photographer",
    "organizer",
    "agency",
    "generated",
  ]),
  name: z.string().min(2),
  url: z.string().url().optional().or(z.literal("")),
  obtainedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  license: z.string().min(3),
  licenseEvidence: z.string().min(3),
  fileUrl: z.string().url().optional(),
  localFile: z.string().regex(/^source\.(?:avif|jpe?g|png|webp)$/i).optional(),
  rightsPolicyId: z.string().min(3).optional(),
});

export const ImageManifestV2Schema = z.object({
  schemaVersion: z.literal(2),
  status: z.enum(["planned", "pending-approval", "approved"]),
  editorialUse: z.enum(["draft-only", "publishable"]),
  assetType: z.enum([
    "official-product-photo",
    "own-photo",
    "licensed-editorial-photo",
    "data-graphic",
    "technical-diagram",
    "ai-editorial-concept",
    "system-fallback",
  ]),
  factualSubject: z.enum(["exact-product", "real-event", "conceptual", "not-applicable"]),
  editorialScope: z.enum(["portfolio", "race-context"]).default("portfolio"),
  purpose: z.string().min(10),
  alt: z.string().min(10),
  caption: z.string().min(3),
  credit: z.string().min(2),
  containsText: z.boolean(),
  aiGenerated: z.boolean(),
  assetId: z.string().min(8).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  perceptualHash: z.string().regex(/^[01]{64}$/).optional(),
  preserveFullProduct: z.boolean().default(false),
  outputFormat: z.enum(["webp", "png"]).default("webp"),
  qualityTier: z.enum(["standard", "high-definition"]).default("standard"),
  composition: z.object({
    strategy: z.literal("trim-contain-safe-area"),
    safeArea: z.number().min(0.8).max(0.95),
    trimThreshold: z.number().int().min(1).max(50),
    sourceWidth: z.number().int().positive(),
    sourceHeight: z.number().int().positive(),
    subjectWidth: z.number().int().positive(),
    subjectHeight: z.number().int().positive(),
  }).optional(),
  matchedProduct: z.object({
    id: z.string().min(3),
    name: z.string().min(3),
    sku: z.string().nullable().optional(),
    matchLevel: z.enum(["exact-id", "deterministic-topic"]),
  }).optional(),
  depictedBrands: z.array(z.string()).default([]),
  depictedProducts: z.array(z.string()).default([]),
  focalPoint: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  source: SourceSchema,
  files: z.object({
    hero: AssetFileSchema,
    mobile: AssetFileSchema,
    card: AssetFileSchema,
  }),
  approval: z.object({
    reviewedBy: z.string().min(2),
    approvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.enum(["human", "automated-editorial-gate"]).default("human"),
    checks: z.array(z.string()).default([]),
  }).optional(),
}).superRefine((manifest, ctx) => {
  if (manifest.preserveFullProduct && !manifest.composition) {
    ctx.addIssue({
      code: "custom",
      path: ["composition"],
      message: "Foto de produto precisa registrar o reenquadramento e a área segura.",
    });
  }
  if (manifest.qualityTier === "high-definition") {
    const longEdge = Math.max(manifest.composition?.sourceWidth || 0, manifest.composition?.sourceHeight || 0);
    const subjectLongEdge = Math.max(manifest.composition?.subjectWidth || 0, manifest.composition?.subjectHeight || 0);
    if (manifest.outputFormat !== "png") {
      ctx.addIssue({ code: "custom", path: ["outputFormat"], message: "Imagem HD de produto deve usar PNG sem perdas." });
    }
    if (longEdge < 1600 || subjectLongEdge < 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["composition"],
        message: "Fonte insuficiente para imagem HD: exigidos 1600 px na fonte e 1000 px no produto útil.",
      });
    }
  }
  if (manifest.aiGenerated && ["exact-product", "real-event"].includes(manifest.factualSubject)) {
    ctx.addIssue({
      code: "custom",
      path: ["aiGenerated"],
      message: "Imagem gerada por IA não pode representar produto exato ou evento real.",
    });
  }
  if (manifest.assetType === "system-fallback" && manifest.editorialUse !== "draft-only") {
    ctx.addIssue({
      code: "custom",
      path: ["editorialUse"],
      message: "Fallback é exclusivo para rascunhos.",
    });
  }
  if (manifest.editorialUse === "publishable") {
    if (manifest.status !== "approved" || !manifest.approval) {
      ctx.addIssue({
        code: "custom",
        path: ["approval"],
        message: "Imagem publicável precisa de aprovação editorial rastreável.",
      });
    }
    if (manifest.assetType === "system-fallback") {
      ctx.addIssue({
        code: "custom",
        path: ["assetType"],
        message: "Post publicado não pode usar fallback.",
      });
    }
  }
  if (["manufacturer", "thebiker", "photographer", "organizer", "agency"].includes(manifest.source.type) && !manifest.source.url) {
    ctx.addIssue({
      code: "custom",
      path: ["source", "url"],
      message: "Imagem externa precisa de URL de origem.",
    });
  }
  if (manifest.editorialScope !== "race-context") {
    manifest.depictedBrands.forEach((brand, index) => {
      if (!isPortfolioBrand(brand)) {
        ctx.addIssue({
          code: "custom",
          path: ["depictedBrands", index],
          message: `Marca visual fora do portfólio TheBiker: ${brand}`,
        });
      }
    });
  }
});

const EXPECTED = {
  hero: { width: 1600, height: 900 },
  mobile: { width: 800, height: 450 },
  card: { width: 640, height: 360 },
};

export function assertSafeRasterBuffer(buffer, fileName, outputFormat) {
  const extension = path.extname(fileName).toLowerCase();
  const expectedExtension = outputFormat === "png" ? ".png" : ".webp";
  if (extension !== expectedExtension) {
    throw new Error(`extensão ${extension || "ausente"} incompatível com outputFormat ${outputFormat}`);
  }
  const isPng = buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if ((outputFormat === "png" && !isPng) || (outputFormat === "webp" && !isWebp)) {
    throw new Error(`assinatura binária inválida para ${outputFormat}`);
  }
}

export function safeRasterDimensions(buffer, outputFormat) {
  if (outputFormat === "png") {
    if (buffer.length < 24 || buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
      throw new Error("PNG sem cabeçalho IHDR válido");
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.length < 30) throw new Error("WebP truncado antes do cabeçalho de dimensões");
  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  if (chunk === "VP8L") {
    if (buffer[20] !== 0x2f) throw new Error("WebP lossless sem assinatura VP8L válida");
    const width = 1 + (((buffer[22] & 0x3f) << 8) | buffer[21]);
    const height = 1 + (((buffer[24] & 0x0f) << 10) | (buffer[23] << 2) | ((buffer[22] & 0xc0) >> 6));
    return { width, height };
  }
  if (chunk === "VP8 ") {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      throw new Error("WebP lossy sem assinatura VP8 válida");
    }
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  throw new Error(`subformato WebP não suportado: ${chunk || "ausente"}`);
}

export function validateImageManifestV2(manifest, directory, { requirePublishable = false } = {}) {
  const parsed = ImageManifestV2Schema.parse(manifest);
  const errors = [];

  if (requirePublishable && parsed.editorialUse !== "publishable") {
    errors.push("manifesto não está marcado como publishable");
  }

  for (const [variant, expected] of Object.entries(EXPECTED)) {
    const declared = parsed.files[variant];
    const filePath = path.resolve(directory, declared.file);
    if (!filePath.startsWith(path.resolve(directory) + path.sep)) {
      errors.push(`${variant}: caminho fora do diretório da imagem`);
      continue;
    }
    if (!fs.existsSync(filePath)) {
      errors.push(`${variant}: arquivo ausente (${declared.file})`);
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    try {
      assertSafeRasterBuffer(buffer, declared.file, parsed.outputFormat);
    } catch (error) {
      errors.push(`${variant}: ${error.message}`);
      continue;
    }
    let measured;
    try {
      measured = safeRasterDimensions(buffer, parsed.outputFormat);
    } catch (error) {
      errors.push(`${variant}: ${error.message}`);
      continue;
    }
    if (measured.width !== expected.width || measured.height !== expected.height) {
      errors.push(
        `${variant}: dimensão ${measured.width}x${measured.height}; esperado ${expected.width}x${expected.height}`,
      );
    }
    if (declared.width !== measured.width || declared.height !== measured.height) {
      errors.push(`${variant}: dimensões declaradas não correspondem ao arquivo`);
    }
    const sizeKB = fs.statSync(filePath).size / 1024;
    if (sizeKB > declared.maxKB) {
      errors.push(`${variant}: ${sizeKB.toFixed(1)} KB excede ${declared.maxKB} KB`);
    }
  }

  if (errors.length > 0) throw new Error(`Manifesto de imagem v2 inválido: ${errors.join("; ")}`);
  return parsed;
}
