(() => {
  function revealHashTarget() {
    if (!window.location.hash) return
    const id = decodeURIComponent(window.location.hash.slice(1))
    const target = document.getElementById(id)
    if (!target?.matches('[data-race-detail-card]')) return
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'auto', block: 'start' })
      target.focus({ preventScroll: true })
    })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', revealHashTarget, { once: true })
  else revealHashTarget()
  window.addEventListener('hashchange', revealHashTarget)
})()
