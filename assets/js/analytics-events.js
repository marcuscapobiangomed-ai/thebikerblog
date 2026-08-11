;(function() {
  'use strict'

  window.TheBikerBlog = window.TheBikerBlog || {}
  if (window.TheBikerBlog.track) return

  var config = window.TheBikerTrackingConfig || {}
  var sessionEvents = []
  var maxSessionEvents = 200
  var contextTracked = false

  function audienceIntent() {
    if (config.audienceIntent) return config.audienceIntent
    var contentType = String(config.contentType || '').toLowerCase()
    if (contentType === 'comparativo') return 'compare_products'
    if (contentType === 'review' || contentType === 'guia-de-compra' || config.pageType === 'product/bike') return 'purchase_consideration'
    if (['noticia', 'lancamento', 'previa-corrida', 'resumo-corrida'].includes(contentType)) return 'follow_market_competition'
    if (contentType === 'guia-turistico') return 'plan_ride'
    if (contentType === 'guia-tecnico') return 'solve_problem'
    return 'technical_learning'
  }

  function hasConsent() {
    return Boolean(window.TheBikerConsent && window.TheBikerConsent.hasAnalyticsConsent())
  }

  function aiAssistantSource() {
    var candidates = []
    try { candidates.push(new URLSearchParams(window.location.search).get('utm_source') || '') } catch {}
    try { candidates.push(new URL(document.referrer).hostname) } catch {}
    var value = candidates.join(' ').toLowerCase()
    if (/chatgpt|openai/.test(value)) return 'chatgpt'
    if (/perplexity/.test(value)) return 'perplexity'
    if (/claude|anthropic/.test(value)) return 'claude'
    if (/gemini|bard\.google/.test(value)) return 'gemini'
    if (/copilot\.microsoft/.test(value)) return 'microsoft_copilot'
    if (/meta\.ai/.test(value)) return 'meta_ai'
    if (/poe\.com/.test(value)) return 'poe'
    return 'none'
  }

  function safeKey(key) {
    return String(key)
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase()
      .slice(0, 40)
  }

  function safeMeta(meta) {
    var result = {}
    var blockedKeys = /email|e_mail|name|nome|phone|telefone|address|endereco|cpf|document/i
    Object.keys(meta || {}).forEach(function(key) {
      if (blockedKeys.test(key)) return
      var value = meta[key]
      if (value === undefined || value === null || value === '') return
      var normalizedKey = safeKey(key)
      if (Array.isArray(value)) {
        if (normalizedKey === 'items') result[normalizedKey] = value
        else result[normalizedKey] = value.join('|').slice(0, 500)
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[normalizedKey] = typeof value === 'string' ? value.slice(0, 500) : value
      }
    })
    return result
  }

  function pageContext() {
    var assistantSource = aiAssistantSource()
    return {
      page_path: window.location.pathname,
      page_type: config.pageType || 'page',
      content_id: config.contentId || window.location.pathname,
      content_type: config.contentType || config.pageType || 'page',
      content_category: config.contentCategory || 'sem-categoria',
      audience_segment: config.audienceSegment || 'core_technical_cyclists',
      audience_intent: audienceIntent(),
      experience_level_target: config.experienceLevelTarget || 'intermediate_advanced',
      traffic_source_type: assistantSource === 'none' ? 'standard' : 'ai_assistant',
      ai_assistant_source: assistantSource
    }
  }

  function setClarityContext() {
    if (typeof window.clarity !== 'function') return
    var context = pageContext()
    ;['page_type', 'content_type', 'content_category', 'audience_segment', 'audience_intent', 'experience_level_target', 'traffic_source_type', 'ai_assistant_source'].forEach(function(key) {
      try { window.clarity('set', key, String(context[key])) } catch {}
    })
  }

  function track(category, action, label, value, meta) {
    if (!hasConsent()) return false

    var params = Object.assign({}, pageContext(), safeMeta(meta), {
      event_category: category,
      event_label: label || ''
    })
    if (value !== undefined && value !== null) params.value = value

    if (typeof window.gtag === 'function') {
      try { window.gtag('event', action, params) } catch {}
    }
    if (typeof window.clarity === 'function') {
      try { window.clarity('event', action) } catch {}
    }

    var event = {
      category: category,
      action: action,
      label: label || '',
      value: value === undefined ? null : value,
      meta: safeMeta(meta),
      timestamp: new Date().toISOString(),
      page: window.location.pathname
    }
    sessionEvents.push(event)
    if (sessionEvents.length > maxSessionEvents) sessionEvents = sessionEvents.slice(-maxSessionEvents)

    ;(window.TheBikerBlog._eventListeners || []).forEach(function(listener) {
      try { listener(event) } catch {}
    })
    return true
  }

  function onTrack(callback) {
    window.TheBikerBlog._eventListeners = window.TheBikerBlog._eventListeners || []
    window.TheBikerBlog._eventListeners.push(callback)
  }

  function getEvents(options) {
    var events = sessionEvents.slice()
    if (!options) return events
    if (options.category) events = events.filter(function(event) { return event.category === options.category })
    if (options.action) events = events.filter(function(event) { return event.action === options.action })
    if (options.since) events = events.filter(function(event) { return new Date(event.timestamp) >= new Date(options.since) })
    if (options.limit) events = events.slice(-options.limit)
    return events
  }

  function getSummary() {
    var summary = { total: sessionEvents.length, byCategory: {}, byAction: {}, today: 0, todayEvents: [] }
    var today = new Date().toISOString().slice(0, 10)
    sessionEvents.forEach(function(event) {
      summary.byCategory[event.category] = (summary.byCategory[event.category] || 0) + 1
      summary.byAction[event.action] = (summary.byAction[event.action] || 0) + 1
      if (event.timestamp.slice(0, 10) === today) {
        summary.today++
        summary.todayEvents.push(event)
      }
    })
    return summary
  }

  function clearEvents() {
    sessionEvents = []
  }

  function trackAffiliateClick(partner, productId, placement, clickMeta) {
    return track('conversion', 'store_click', partner || 'TheBiker Shop', null, Object.assign({
      partner: partner || 'TheBiker Shop',
      product_id: productId || 'nao-informado',
      placement: placement || 'nao-informado'
    }, safeMeta(clickMeta)))
  }

  function trackProductView(productId, brand, model) {
    return track('product', 'view_item', [brand, model].filter(Boolean).join(' '), null, {
      product_id: productId,
      product_brand: brand,
      product_model: model,
      items: [{ item_id: productId, item_name: model, item_brand: brand }]
    })
  }

  function trackCompareAdd(productId, brand, model) {
    return track('product', 'comparison_add', [brand, model].filter(Boolean).join(' '), null, {
      product_id: productId,
      product_brand: brand,
      product_model: model
    })
  }

  function trackCompareComplete(ids) {
    return track('product', 'comparison_complete', ids.join(' vs '), ids.length, {
      product_ids: ids,
      product_count: ids.length
    })
  }

  function placementFor(link) {
    if (link.dataset.placement) return link.dataset.placement
    if (link.closest('.site-header')) return 'site_header'
    if (link.closest('.mobile-nav')) return 'mobile_navigation'
    if (link.closest('.primary-nav, .nav-bar')) return 'primary_navigation'
    if (link.closest('.site-footer')) return 'site_footer'
    if (link.closest('.brand-shop-cta')) return 'home_shop_cta'
    if (link.closest('.answer-block')) return 'answer_block'
    if (link.closest('.affiliate-links')) return 'affiliate_links'
    if (link.closest('.catalog-bike-card, .product-card')) return 'product_card'
    if (link.closest('.comparison-container, .comparator-shell')) return 'comparison'
    if (link.closest('.calculator-shell, .calculator-card')) return 'calculator'
    if (link.closest('.post-content')) return 'article_body'
    return 'page'
  }

  function elementName(element) {
    var explicit = element.getAttribute('data-analytics-label') || element.getAttribute('aria-label') || element.id || ''
    var visible = explicit || element.textContent || element.getAttribute('title') || ''
    return safeKey(String(visible).trim().replace(/\s+/g, ' ')) || element.tagName.toLowerCase()
  }

  function safeDestination(link) {
    var meta = { element_type: 'link', element_name: elementName(link), placement: placementFor(link) }
    try {
      var url = new URL(link.href, window.location.href)
      meta.destination_host = url.hostname.toLowerCase()
      if (url.origin === window.location.origin || isStoreLink(link)) meta.destination_path = url.pathname
      if (link.hasAttribute('download')) meta.link_type = 'download'
      else if (/^(mailto:|tel:)/i.test(link.getAttribute('href') || '')) meta.link_type = 'contact'
      else if (isStoreLink(link)) meta.link_type = 'store'
      else if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.hash) meta.link_type = 'anchor'
      else if (url.origin === window.location.origin) meta.link_type = 'internal'
      else meta.link_type = 'external'
    } catch {
      meta.link_type = 'invalid'
    }
    return meta
  }

  function shouldIgnoreClick(element) {
    if (!element || element.closest('[data-analytics-ignore]')) return true
    if (element.matches('[disabled], [aria-disabled="true"]')) return true
    if (element.closest('[data-consent-accept], [data-consent-reject], [data-open-privacy-preferences]')) return true
    if (element.closest('form')) return true
    return false
  }

  function isStoreLink(link) {
    try {
      return /(^|\.)thebikershop\.com\.br$/i.test(new URL(link.href, window.location.href).hostname)
    } catch {
      return false
    }
  }

  function decorateStoreLink(link) {
    if (!isStoreLink(link)) return
    try {
      var url = new URL(link.href, window.location.href)
      if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source', 'thebikerblog')
      if (!url.searchParams.has('utm_medium')) url.searchParams.set('utm_medium', 'referral')
      if (!url.searchParams.has('utm_campaign')) url.searchParams.set('utm_campaign', 'editorial')
      if (!url.searchParams.has('utm_content')) url.searchParams.set('utm_content', placementFor(link))
      link.href = url.toString()
    } catch {}
  }

  function trackContentContext() {
    if (contextTracked || !hasConsent()) return
    contextTracked = true
    setClarityContext()
    if (config.pageType === 'post') {
      track('content', 'content_view', config.contentTitle || document.title, null, {
        content_id: config.contentId,
        content_type: config.contentType,
        content_category: config.contentCategory
      })
    } else if (config.pageType === 'product/bike') {
      trackProductView(config.contentId, config.productBrand, config.productModel)
    }
    var assistantSource = aiAssistantSource()
    if (assistantSource !== 'none') {
      track('acquisition', 'ai_referral_visit', assistantSource, null, { ai_assistant_source: assistantSource })
    }
  }

  function initScrollTracking() {
    if (config.pageType !== 'post') return
    var reached = {}
    window.addEventListener('scroll', function() {
      if (!hasConsent()) return
      var available = document.documentElement.scrollHeight - window.innerHeight
      if (available <= 0) return
      var percent = Math.round(window.scrollY / available * 100)
      ;[25, 50, 75, 90].forEach(function(threshold) {
        if (percent >= threshold && !reached[threshold]) {
          reached[threshold] = true
          track('engagement', 'scroll_depth', String(threshold), threshold, { percent_scrolled: threshold })
          if (threshold === 75) track('engagement', 'qualified_read', '75_percent', null, { percent_scrolled: threshold })
        }
      })
    }, { passive: true })
  }

  function initGlobalTracking() {
    document.querySelectorAll('a[href]').forEach(decorateStoreLink)

    document.addEventListener('click', function(event) {
      var link = event.target.closest('a[href]')
      if (link && !shouldIgnoreClick(link)) {
        var linkMeta = safeDestination(link)
        if (isStoreLink(link)) {
          decorateStoreLink(link)
          trackAffiliateClick(
            link.getAttribute('data-partner') || 'TheBiker Shop',
            link.getAttribute('data-product') || config.contentId || 'sitewide',
            placementFor(link),
            linkMeta
          )
          return
        }
        if (linkMeta.link_type === 'internal' || linkMeta.link_type === 'anchor') {
          track('navigation', 'internal_link_click', linkMeta.element_name, null, linkMeta)
        } else if (linkMeta.link_type === 'external' || linkMeta.link_type === 'download' || linkMeta.link_type === 'contact') {
          track('navigation', 'external_link_click', linkMeta.element_name, null, linkMeta)
        }
        return
      }

      var button = event.target.closest('button, [role="button"]')
      if (!button || shouldIgnoreClick(button)) return
      track('interaction', 'button_click', elementName(button), null, {
        element_type: 'button',
        element_name: elementName(button),
        placement: placementFor(button),
        button_type: button.getAttribute('type') || 'button'
      })
    })

    trackContentContext()
    initScrollTracking()

    window.addEventListener('thebiker:consent-change', function(event) {
      if (event.detail && event.detail.analytics) trackContentContext()
    })
  }

  window.TheBikerBlog.track = track
  window.TheBikerBlog.onTrack = onTrack
  window.TheBikerBlog.getEvents = getEvents
  window.TheBikerBlog.getEventSummary = getSummary
  window.TheBikerBlog.clearEvents = clearEvents
  window.TheBikerBlog.trackAffiliateClick = trackAffiliateClick
  window.TheBikerBlog.trackProductView = trackProductView
  window.TheBikerBlog.trackCompareAdd = trackCompareAdd
  window.TheBikerBlog.trackCompareComplete = trackCompareComplete
  window.TheBikerBlog.getAiAssistantSource = aiAssistantSource

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGlobalTracking)
  else initGlobalTracking()
})()
