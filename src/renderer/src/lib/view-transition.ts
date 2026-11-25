import { flushSync } from 'react-dom'

/**
 * Runs a React state change as one same-document View Transition: the browser snapshots the page, the change
 * is committed synchronously (flushSync — layout effects included, so measured layouts like useWrapGrid settle
 * in the same frame), and the old and new states are blended, elements with a `view-transition-name` gliding
 * to their new place. A reflow that would make a grid jump (a list unfolding beside it) becomes one smooth move.
 * Without the API, or with reduced motion, the change just happens.
 */
export function withViewTransition(update: () => void): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof document.startViewTransition !== 'function') {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}
