function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function unique(values) {
  return [...new Set(values.map(normalize).filter(Boolean))];
}

function promotedBrands(article) {
  const declared = Array.isArray(article?.promoted_brands) ? article.promoted_brands : [];
  return unique([article?.brand, ...declared]).filter((brand) => brand !== "thebiker");
}

export function imageArticleConsistencyErrors({ article = {}, manifest = {}, campaignItem = null, catalog = null } = {}) {
  const errors = [];
  const factualSubject = String(manifest.factualSubject || "");
  const visualPolicy = campaignItem?.heroImage || null;
  const subjectId = String(article.image_subject_id || "").trim();

  if (visualPolicy) {
    const expectedSubject = visualPolicy.mode === "exact-product"
      ? "exact-product"
      : visualPolicy.mode === "race-context" ? "real-event" : "conceptual";
    if (factualSubject !== expectedSubject) {
      errors.push(`política visual ${visualPolicy.mode} não corresponde ao manifesto ${factualSubject || "indefinido"}`);
    }
  }

  if (factualSubject === "exact-product") {
    const matchedId = String(manifest.matchedProduct?.id || "").trim();
    if (!matchedId) errors.push("imagem de produto exato exige matchedProduct.id");
    if (!subjectId) errors.push("imagem de produto exato exige image_subject_id no post");
    if (matchedId && subjectId && matchedId !== subjectId) {
      errors.push(`produto visual ${matchedId} não corresponde ao image_subject_id ${subjectId}`);
    }
    if (visualPolicy?.mode === "exact-product" && matchedId && matchedId !== visualPolicy.productId) {
      errors.push(`produto visual ${matchedId} não corresponde ao heroImage.productId ${visualPolicy.productId}`);
    }

    const depicted = unique(manifest.depictedBrands || []);
    if (depicted.length === 0) errors.push("imagem de produto exato exige depictedBrands");
    const promoted = promotedBrands(article);
    if (promoted.length > 0 && depicted.length > 0 && !depicted.some((brand) => promoted.includes(brand))) {
      errors.push(`marca da imagem (${(manifest.depictedBrands || []).join(", ")}) não corresponde à marca promovida (${promoted.join(", ")})`);
    }

    if (catalog && matchedId) {
      const product = (catalog.products || []).find((candidate) => candidate.id === matchedId);
      if (!product) {
        errors.push(`produto visual ${matchedId} não existe no catálogo editorial`);
      } else {
        const catalogBrand = normalize(product.brand);
        if (catalogBrand && depicted.length > 0 && !depicted.includes(catalogBrand)) {
          errors.push(`marca declarada na imagem (${depicted.join(", ")}) não corresponde à marca do catálogo (${catalogBrand})`);
        }
      }
    }
  } else {
    if (subjectId) errors.push(`image_subject_id ${subjectId} só é permitido para imagem de produto exato`);
    if (factualSubject === "conceptual") {
      if ((manifest.depictedBrands || []).length > 0) errors.push("capa conceitual não pode declarar marca retratada");
      if ((manifest.depictedProducts || []).length > 0) errors.push("capa conceitual não pode declarar produto retratado");
    }
  }

  return errors;
}

export function assertImageArticleConsistency(options) {
  const errors = imageArticleConsistencyErrors(options);
  if (errors.length > 0) throw new Error(`Imagem incompatível com o artigo: ${errors.join("; ")}`);
  return options.manifest;
}
