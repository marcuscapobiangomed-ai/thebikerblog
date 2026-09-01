import { z } from "zod";
import { assertPortfolioPromotion } from "../portfolio-policy.js";

export const ALLOWED_CATEGORIES = [
  "reviews",
  "comparativo",
  "comparativos",
  "guias-de-compra",
  "guia-tecnico",
  "componentes",
  "manutencao",
  "treinamento",
  "noticia",
  "noticias",
  "tecnologia",
  "corridas",
  "campeonatos",
  "lancamentos",
  "mercado",
];

export const ALLOWED_CONTENT_TYPES = [
  "review",
  "comparativo",
  "guia-de-compra",
  "guia-tecnico",
  "noticia",
  "lancamento",
  "previa-corrida",
  "resumo-corrida",
  "calendario-provas",
  "guia-prova",
];

export const ALLOWED_AUDIENCE_SEGMENTS = [
  "core_technical_cyclists",
  "professional_reference_users",
  "committed_progression_cyclists",
];

export const ALLOWED_AUDIENCE_INTENTS = [
  "technical_learning",
  "solve_problem",
  "compare_products",
  "purchase_consideration",
  "follow_market_competition",
  "find_race_to_enter",
  "plan_ride",
];

export const ALLOWED_EXPERIENCE_LEVELS = [
  "intermediate",
  "advanced",
  "professional",
  "intermediate_advanced",
  "mixed_progression",
];

export const ALLOWED_TAGS = [
  "scott", "specialized", "trek", "cervelo", "cannondale",
  "road-bike", "endurance", "aero",
  "carbono", "aluminio",
  "shimano", "sram", "campagnolo",
  "iniciantes", "avancado",
  "custo-beneficio",
];

const ImagePlanSchema = z.object({
  position: z.enum(["hero", "spec-detail", "comparison", "lifestyle"]),
  purpose: z.string().min(10, "Informe o propósito da imagem"),
  assetType: z.enum([
    "official-product-photo",
    "own-photo",
    "licensed-editorial-photo",
    "data-graphic",
    "technical-diagram",
    "ai-editorial-concept",
    "system-fallback",
  ]),
  editorialUse: z.enum(["draft-only", "publishable"]),
  factualSubject: z.enum(["exact-product", "real-event", "conceptual", "not-applicable"]),
  brief: z.string().min(30, "O briefing visual precisa ter ao menos 30 caracteres"),
  sourceRequired: z.boolean(),
  avoid: z.array(z.string()).default([]),
  aspectRatio: z.string().default("16:9"),
  altSuggestion: z.string().min(10, "altSuggestion precisa ter ao menos 10 caracteres"),
  allowedSource: z.enum(["manufacturer-authorized", "own-photo", "ai-generated", "public-domain"]),
  aiGeneratedAllowed: z.boolean().default(false),
});

const SectionClaimSchema = z.object({
  statement: z.string().min(10, "Claim must be explicit"),
  source_ids: z.array(z.string().min(1)).min(1, "Claim needs at least one source"),
  evidence_quote: z.string().min(12, "Evidence quote is too short"),
  confidence: z.enum(["high", "medium", "limited"]).default("high"),
});

const InternalLinkSchema = z.object({
  url: z.string().min(1, "Internal URL is required"),
  anchor: z.string().min(3, "Anchor text is too short"),
  reason: z.string().min(10, "Explain why the link helps the reader"),
});

const SectionSchema = z.object({
  heading: z.string().min(1),
  content: z.string().min(1),
  target_question: z.string().min(10).optional(),
  claims: z.array(SectionClaimSchema).default([]),
  internal_links: z.array(InternalLinkSchema).max(3).default([]),
});

const GENERIC_SECTION_HEADING = /^(?:\d+[.)-]?\s*)?(?:introdu[cç][aã]o|desenvolvimento|conclus[aã]o|considera[cç][oõ]es finais|resumo(?: inicial)?|contexto|an[aá]lise|aviso de metodologia|fontes|refer[eê]ncias|fontes e (?:metodologia|refer[eê]ncias))\s*[.!?:-]*$/iu;

const SourceSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1, "source.name é obrigatório"),
  type: z.string().min(1, "source.type é obrigatório"),
  url: z.string().url().optional().or(z.literal("")),
  accessed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "source.accessed_at precisa ser YYYY-MM-DD"),
});

const FaqItemSchema = z.object({
  question: z.string().min(20, "A pergunta precisa ter ao menos 20 caracteres").max(180, "Pergunta muito longa"),
  answer: z.string().min(60, "A resposta precisa ter ao menos 60 caracteres").max(600, "Resposta muito longa"),
});

export const ArticleSchema = z.object({
  editorial_format: z.enum(["full-article-v1", "full-article-v2"]).default("full-article-v1"),
  title: z.string().min(10, "Título precisa ter ao menos 10 caracteres").max(120, "Título muito longo"),
  description: z.string().min(100, "Description precisa ter ao menos 100 caracteres").max(200, "Description muito longa"),
  direct_answer: z.string().min(80, "Resposta direta precisa ter ao menos 80 caracteres").max(420, "Resposta direta muito longa"),
  faq: z.array(FaqItemSchema).max(5, "Use no máximo cinco perguntas frequentes").default([]),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug inválido"),
  category: z.enum(ALLOWED_CATEGORIES),
  content_type: z.enum(ALLOWED_CONTENT_TYPES),
  audience_segment: z.enum(ALLOWED_AUDIENCE_SEGMENTS).default("core_technical_cyclists"),
  audience_intent: z.enum(ALLOWED_AUDIENCE_INTENTS).default("technical_learning"),
  experience_level_target: z.enum(ALLOWED_EXPERIENCE_LEVELS).default("intermediate_advanced"),
  review_method: z.enum(["desk-research", "hands-on-test"]),
  tested_by_thebikerblog: z.boolean().default(false),
  methodologyNotice: z.string().optional(),
  brand: z.string().default(""),
  product_name: z.string().default(""),
  model_year: z.number().int().min(2020).max(2035).optional(),
  market: z.string().default("Brasil"),
  weight: z.string().default("Não informado"),
  weight_source: z.string().default("Não informado"),
  price_min: z.number().nonnegative().default(0),
  price_max: z.number().nonnegative().default(0),
  price_currency: z.string().length(3).default("BRL"),
  price_checked_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  affiliate_links: z.boolean().default(false),
  editorial_scope: z.enum(["portfolio", "race-coverage"]).default("portfolio"),
  promoted_brands: z.array(z.string().min(1)).default([]),
  context_only_brands: z.array(z.string().min(1)).default([]),
  portfolio_evidence_url: z.string().url("Use uma URL válida de produto ou categoria da TheBiker"),
  portfolio_verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "tag precisa usar formato canônico sem acentos")).min(1).max(6),
  sections: z.array(SectionSchema).min(2, "Mínimo de 2 seções"),
  imagePlan: z.array(ImagePlanSchema).min(1, "Pelo menos uma imagem obrigatória"),
  claimsRequiringReview: z.array(z.string()).default([]),
  sources: z.array(SourceSchema).min(1, "Pelo menos uma fonte é obrigatória"),
  frontmatter: z.object({
    weight: z.string().default("Não informado"),
    price: z.string().default("Não informado"),
    author: z.string().default("Equipe TheBiker"),
    image: z.string().default("/assets/img/logo.svg"),
    thumbnail: z.string().default(""),
    image_alt: z.string().default("Logo TheBiker"),
    image_caption: z.string().default(""),
    image_credit: z.string().default("TheBiker"),
    image_license: z.string().default("Uso editorial da TheBiker"),
  }).optional().default({}),
}).superRefine((article, ctx) => {
  if (["review", "lancamento"].includes(article.content_type)) {
    for (const field of ["brand", "product_name", "model_year"]) {
      const value = article[field];
      if (value === undefined || value === null || String(value).trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Identidade exata do produto é obrigatória para impedir mistura de modelos.",
        });
      }
    }
  }

  const promoted = [...article.promoted_brands];
  if (article.brand) promoted.push(article.brand);

  try {
    assertPortfolioPromotion(promoted);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      path: ["promoted_brands"],
      message: error.message,
    });
  }

  if (!/https?:\/\/(www\.)?(thebiker\.com\.br|thebikershop\.com\.br)\//i.test(article.portfolio_evidence_url)) {
    ctx.addIssue({
      code: "custom",
      path: ["portfolio_evidence_url"],
      message: "A evidência de portfólio deve apontar para o site oficial da TheBiker.",
    });
  }

  if (article.editorial_scope !== "race-coverage" && article.context_only_brands.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["context_only_brands"],
      message: "Marcas concorrentes só podem ser mencionadas como contexto factual em cobertura de corridas.",
    });
  }

  article.sections.forEach((section, index) => {
    if (GENERIC_SECTION_HEADING.test(section.heading.trim())) {
      ctx.addIssue({
        code: "custom",
        path: ["sections", index, "heading"],
        message: "Use um intertítulo específico e atraente; rótulos genéricos como Introdução, Conclusão, Resumo e Análise não são aceitos.",
      });
    }

    if (article.editorial_format === "full-article-v2") {
      if (!section.target_question || section.target_question.trim().length < 10) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "target_question"],
          message: "Every v2 section must declare the question or decision it answers.",
        });
      }

      const isMethodology = /fontes|referências|metodologia|limitações/i.test(section.heading);
      if (!isMethodology && section.claims.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "claims"],
          message: "Factual v2 sections must preserve at least one evidenced claim.",
        });
      }
    }
  });

  if (article.editorial_format === "full-article-v2") {
    const sourceIds = new Set(article.sources.map((source) => source.id).filter(Boolean));
    article.sources.forEach((source, index) => {
      if (!source.id) {
        ctx.addIssue({
          code: "custom",
          path: ["sources", index, "id"],
          message: "Every v2 source must have a stable id.",
        });
      }
    });
    article.sections.forEach((section, sectionIndex) => {
      section.claims.forEach((claim, claimIndex) => {
        claim.source_ids.forEach((sourceId, sourceIndex) => {
          if (!sourceIds.has(sourceId)) {
            ctx.addIssue({
              code: "custom",
              path: ["sections", sectionIndex, "claims", claimIndex, "source_ids", sourceIndex],
              message: `Unknown article source id: ${sourceId}`,
            });
          }
        });
      });
    });
  }

  article.imagePlan.forEach((image, index) => {
    if (
      image.aiGeneratedAllowed &&
      ["exact-product", "real-event"].includes(image.factualSubject)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["imagePlan", index, "aiGeneratedAllowed"],
        message: "IA generativa não pode representar produto exato ou evento real.",
      });
    }
    if (image.editorialUse === "publishable" && image.assetType === "system-fallback") {
      ctx.addIssue({
        code: "custom",
        path: ["imagePlan", index, "editorialUse"],
        message: "Fallback de sistema é exclusivo para rascunhos.",
      });
    }
  });
});

export function validateArticle(data) {
  const result = ArticleSchema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Artigo inválido:\n${errors.join("\n")}`);
  }
  return result.data;
}
