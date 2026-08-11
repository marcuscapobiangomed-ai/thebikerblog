(() => {
  const filters = document.querySelector('[data-race-filters]')
  if (!filters) return

  const items = [...document.querySelectorAll('[data-race-filter-item]')]
  const buttons = [...filters.querySelectorAll('[data-race-filter]')]
  const count = filters.querySelector('[data-race-filter-count]')
  const empty = document.querySelector('[data-race-filter-empty]')

  function applyFilter(value) {
    let visible = 0
    for (const item of items) {
      const show = value === 'all'
        || (value === 'brazil' && item.dataset.countryCode === 'BRA')
        || (value === 'guide' && item.dataset.hasGuide === 'true')
      item.hidden = !show
      if (show) {
        visible += 1
        const position = item.querySelector('.race-upcoming-position')
        if (position) position.textContent = String(visible).padStart(2, '0')
      }
    }

    for (const button of buttons) {
      const active = button.dataset.raceFilter === value
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    }
    if (count) count.textContent = String(visible)
    if (empty) empty.hidden = visible !== 0
  }

  filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-race-filter]')
    if (button) applyFilter(button.dataset.raceFilter)
  })
})()
