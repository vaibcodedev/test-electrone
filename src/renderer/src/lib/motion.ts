import type { DropAnimation } from '@dnd-kit/core'

/**
 * Motion that runs from JS (Web Animations, dnd-kit) — docs/design-system.md §13 «Движение». The CSS rule for
 * «reduce motion» in globals.css reaches CSS animations and transitions only: `element.animate()` and dnd-kit's
 * drop animation ignore it, so every JS animation asks `reducedMotion()` itself.
 */

/** `--ease-soft` of globals.css, for APIs that take an easing string. */
export const EASE_SOFT = 'cubic-bezier(0.22, 1, 0.36, 1)'

export const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Neighbours of a dragged item make room on the house curve (dnd-kit's default was 250ms `ease`). */
export const SORTABLE_TRANSITION = { duration: 200, easing: EASE_SOFT } as const

/**
 * The dragged copy (DragOverlay) settling into its place after the drop; none with reduced motion (dnd-kit plays
 * it through `element.animate`, which the CSS rule doesn't reach). Pass the result, not the function:
 * `<DragOverlay dropAnimation={dropAnimation()}>`.
 */
export function dropAnimation(): DropAnimation | null {
  return reducedMotion() ? null : { duration: 160, easing: EASE_SOFT }
}
