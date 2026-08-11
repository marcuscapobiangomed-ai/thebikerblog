(() => {
  const page = document.querySelector('[data-race-details-page]')

  function revealHashTarget() {
    if (!page || !window.location.hash) return
    const id = decodeURIComponent(window.location.hash.slice(1))
    const target = document.getElementById(id)
    if (!target?.matches('[data-race-detail-card]')) return

    const selectedSection = target.closest('section')
    page.classList.add('is-focused')
    for (const card of page.querySelectorAll('[data-race-detail-card]')) card.hidden = card !== target
    for (const section of page.querySelectorAll('.race-details-content > section')) section.hidden = section !== selectedSection
    selectedSection?.querySelector('.race-details-section-heading')?.setAttribute('hidden', '')

    const positionTarget = () => window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'auto', block: 'start' })
      target.focus({ preventScroll: true })
    }))
    positionTarget()
    if (document.readyState !== 'complete') window.addEventListener('load', positionTarget, { once: true })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', revealHashTarget, { once: true })
  else revealHashTarget()
  window.addEventListener('hashchange', revealHashTarget)
  window.addEventListener('pageshow', revealHashTarget)
})()
