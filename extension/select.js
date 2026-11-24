// Content script injected on demand: lets the user drag a rectangle over the page.
// After the drag it removes itself (so the overlay is not in the screenshot) and
// sends the rectangle (CSS pixels, viewport-relative) to the service worker.
;(() => {
  if (window.__vaultSelecting) return
  window.__vaultSelecting = true

  const root = document.createElement('div')
  root.setAttribute('data-vault-overlay', '')
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'rgba(20, 22, 15, 0.35)'
  })
  const box = document.createElement('div')
  Object.assign(box.style, {
    position: 'fixed',
    border: '2px solid #d4f542',
    background: 'rgba(212, 245, 66, 0.12)',
    borderRadius: '6px',
    display: 'none',
    pointerEvents: 'none'
  })
  const hint = document.createElement('div')
  hint.textContent = 'Виділіть область для Vault · Esc — скасувати'
  Object.assign(hint.style, {
    position: 'fixed',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 14px',
    borderRadius: '999px',
    background: '#14160f',
    color: '#d4f542',
    font: '500 13px system-ui, -apple-system, Segoe UI, sans-serif',
    pointerEvents: 'none'
  })
  root.append(box, hint)
  document.documentElement.append(root)

  let start = null

  const cleanup = () => {
    root.remove()
    window.removeEventListener('keydown', onKey, true)
    window.__vaultSelecting = false
  }

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cleanup()
      chrome.runtime.sendMessage({ type: 'vault-area-cancel' })
    }
  }

  const rectFrom = (a, b) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  })

  root.addEventListener('mousedown', (e) => {
    e.preventDefault()
    start = { x: e.clientX, y: e.clientY }
    box.style.display = 'block'
  })
  root.addEventListener('mousemove', (e) => {
    if (!start) return
    const r = rectFrom(start, { x: e.clientX, y: e.clientY })
    Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` })
  })
  root.addEventListener('mouseup', (e) => {
    if (!start) return
    const rect = rectFrom(start, { x: e.clientX, y: e.clientY })
    start = null
    cleanup()
    if (rect.width < 8 || rect.height < 8) {
      chrome.runtime.sendMessage({ type: 'vault-area-cancel' })
      return
    }
    // Wait two frames so the overlay is gone from the rendered page before capturing.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage({ type: 'vault-area', rect, dpr: window.devicePixelRatio || 1 })
      })
    )
  })
  window.addEventListener('keydown', onKey, true)
})()
