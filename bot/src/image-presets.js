const DEFAULT_COVER = {
  hero: "/assets/img/system/covers/guia/hero.webp",
  mobile: "/assets/img/system/covers/guia/hero.webp",
  thumbnail: "/assets/img/system/covers/guia/thumb-480.webp",
};

const CONTENT_TYPE_PRESETS = {
  comparativo: {
    hero: "/assets/img/system/covers/comparativo/hero.webp",
    mobile: "/assets/img/system/covers/comparativo/hero.webp",
    thumbnail: "/assets/img/system/covers/comparativo/thumb-480.webp",
  },
  review: {
    hero: "/assets/img/system/covers/review/hero.webp",
    mobile: "/assets/img/system/covers/review/hero.webp",
    thumbnail: "/assets/img/system/covers/review/thumb-480.webp",
  },
  "guia-de-compra": {
    hero: "/assets/img/system/covers/guia/hero.webp",
    mobile: "/assets/img/system/covers/guia/hero.webp",
    thumbnail: "/assets/img/system/covers/guia/thumb-480.webp",
  },
  "guia-tecnico": {
    hero: "/assets/img/system/covers/guia/hero.webp",
    mobile: "/assets/img/system/covers/guia/hero.webp",
    thumbnail: "/assets/img/system/covers/guia/thumb-480.webp",
  },
  noticia: {
    hero: "/assets/img/system/covers/guia/hero.webp",
    mobile: "/assets/img/system/covers/guia/hero.webp",
    thumbnail: "/assets/img/system/covers/guia/thumb-480.webp",
  },
  lancamento: {
    hero: "/assets/img/system/covers/lancamento-v2/hero-1600.webp",
    mobile: "/assets/img/system/covers/lancamento-v2/hero-800.webp",
    thumbnail: "/assets/img/system/covers/lancamento-v2/card-640.webp",
  },
  "previa-corrida": {
    hero: "/assets/img/system/covers/corrida-v2/hero-1600.webp",
    mobile: "/assets/img/system/covers/corrida-v2/hero-800.webp",
    thumbnail: "/assets/img/system/covers/corrida-v2/card-640.webp",
  },
  "resumo-corrida": {
    hero: "/assets/img/system/covers/corrida-v2/hero-1600.webp",
    mobile: "/assets/img/system/covers/corrida-v2/hero-800.webp",
    thumbnail: "/assets/img/system/covers/corrida-v2/card-640.webp",
  },
  "calendario-provas": {
    hero: "/assets/img/system/covers/corrida-v2/hero-1600.webp",
    mobile: "/assets/img/system/covers/corrida-v2/hero-800.webp",
    thumbnail: "/assets/img/system/covers/corrida-v2/card-640.webp",
  },
  "guia-prova": {
    hero: "/assets/img/system/covers/corrida-v2/hero-1600.webp",
    mobile: "/assets/img/system/covers/corrida-v2/hero-800.webp",
    thumbnail: "/assets/img/system/covers/corrida-v2/card-640.webp",
  },
};

export function getCoverPreset(contentType = "guia-de-compra") {
  return CONTENT_TYPE_PRESETS[contentType] || DEFAULT_COVER;
}
