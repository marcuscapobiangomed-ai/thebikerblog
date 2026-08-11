import { z } from "zod";
import { ProductKnowledgeInputSchema } from "./product-knowledge.schema.js";

export const SourceSchema = z.object({
  id: z.string().min(1, "source.id é obrigatório"),
  name: z.string().min(1, "source.name é obrigatório"),
  type: z.enum(["manufacturer", "distributor", "store", "official-website", "import-data"]),
  url: z.string().url().optional().or(z.literal("")),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "accessedAt precisa ser YYYY-MM-DD"),
});

export const PriceSchema = z.object({
  store: z.string().min(1),
  price: z.number().positive("Preço precisa ser positivo"),
  currency: z.string().length(3).default("BRL"),
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  url: z.string().url().optional().or(z.literal("")),
});

export const SpecSchema = z.object({
  value: z.string().nullable().default(null),
  sourceId: z.string().optional(),
  status: z.enum(["confirmed", "not-confirmed", "estimated"]).default("not-confirmed"),
});

export const ProductResearchSchema = z.object({
  topic: z.string().min(3, "topic precisa ter ao menos 3 caracteres"),
  contentType: z.enum(["review", "comparativo", "guia-de-compra", "componentes", "manutencao", "treinamento", "noticias"]),
  reviewMethod: z.enum(["desk-research", "field-review", "editorial"]),
  testedByTheBikerBlog: z.boolean(),
  market: z.string().default("Brasil"),
  product: z.object({
    brand: z.string().min(1),
    name: z.string().min(1),
    modelYear: z.number().int().min(2020).max(2030),
  }),
  specifications: z.record(SpecSchema).optional().default({}),
  prices: z.array(PriceSchema).default([]),
  sources: z.array(SourceSchema).min(1, "Pelo menos uma fonte é obrigatória"),
  affiliateLinks: z.boolean().default(false),
});

const EditorialSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional().or(z.literal("")),
  accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accessed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).passthrough();

export const EditorialResearchSchema = z.object({
  slug: z.string().min(3),
  title: z.string().min(3),
  content_type: z.enum(["review", "comparativo", "guia-de-compra", "guia-tecnico", "guia-turistico", "noticia", "lancamento", "previa-corrida", "resumo-corrida", "calendario-provas", "guia-prova"]),
  review_method: z.enum(["desk-research", "field-review", "editorial"]),
  tested_by_thebikerblog: z.boolean(),
  market: z.string().min(2),
  generated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["pesquisa_pendente", "pesquisa_concluida"]),
  sources: z.array(EditorialSourceSchema).optional(),
  product_knowledge: ProductKnowledgeInputSchema.optional(),
}).passthrough();

export const ResearchQueueItemSchema = z.object({
  slug: z.string().min(3),
  title: z.string().min(3),
  status: z.literal("pesquisa_pendente"),
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(2020).max(2030),
  category: z.string().min(1),
  created_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).passthrough();

export const ResearchSchema = z.union([
  ProductResearchSchema,
  EditorialResearchSchema,
  ResearchQueueItemSchema,
]);

export function validateResearch(data) {
  const result = ResearchSchema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Ficha de pesquisa inválida:\n${errors.join("\n")}`);
  }
  return result.data;
}
