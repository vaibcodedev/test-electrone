import type { QueryClient } from '@tanstack/react-query'

/** The mark has time to draw itself: a splash gone after 100 ms reads as a flicker. */
const MIN_MS = 700
/** A hung request must never keep the app behind the startup screen: the page shows its own skeleton or error. */
const MAX_MS = 8000
const TICK_MS = 60
/** The exit transition of #splash (index.html). */
const EXIT_MS = 280

/**
 * Removes the startup screen of index.html once the first screen is on the page and nothing is loading — so it is
 * followed by content, not by a skeleton. Two quiet ticks in a row: a query that starts right after the page's
 * chunk arrived is waited for too. Timers, not animation frames: a window started hidden in the tray gets no
 * frames.
 */
export function dismissSplashWhenReady(queryClient: QueryClient): void {
  const splash = document.getElementById('splash')
  if (!splash) return
  // The quick-add popup is a small transparent window: no startup screen there.
  if (window.location.hash.startsWith('#/quick-add')) {
    splash.remove()
    return
  }
  let quiet = 0
  const check = (): void => {
    const rendered = !!document.querySelector('#root main, #root [data-route-error]')
    quiet = rendered && !queryClient.isFetching() ? quiet + 1 : 0
    // Since navigation start, which is when the splash appeared.
    const elapsed = performance.now()
    if (elapsed < MAX_MS && (quiet < 2 || elapsed < MIN_MS)) {
      window.setTimeout(check, TICK_MS)
      return
    }
    splash.setAttribute('data-leaving', '')
    window.setTimeout(() => splash.remove(), EXIT_MS)
  }
  window.setTimeout(check, TICK_MS)
}
