/**
 * Marks an element with `data-scrolling` while it scrolls and for `idleMs` after, so the scrollbar thumb shows
 * only then (globals.css). One capturing listener for the whole window: scroll events don't bubble, but they
 * do pass the document on the way down, so every scroll area is covered without wiring each one.
 */
export function installScrollActivity(idleMs = 900): void {
  // `data-scroll-hover` areas also show the thumb while the pointer is over them. Marked from here, not with CSS
  // `:hover`: Chromium doesn't repaint a scrollbar when only its owner's hover state changes. Neither event
  // bubbles, but the capturing document listener gets one for every element entered or left.
  const hover = (e: Event): void => {
    if (e.target instanceof Element && e.target.hasAttribute('data-scroll-hover'))
      e.target.toggleAttribute('data-hovered', e.type === 'pointerenter')
  }
  document.addEventListener('pointerenter', hover, true)
  document.addEventListener('pointerleave', hover, true)
  const timers = new WeakMap<Element, number>()
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target === document ? document.scrollingElement : e.target
      if (!(el instanceof Element)) return
      window.clearTimeout(timers.get(el))
      // Only the first event of a gesture changes the DOM; the rest just push the timer back.
      if (!el.hasAttribute('data-scrolling')) el.setAttribute('data-scrolling', '')
      timers.set(
        el,
        window.setTimeout(() => el.removeAttribute('data-scrolling'), idleMs)
      )
    },
    { capture: true, passive: true }
  )
}
