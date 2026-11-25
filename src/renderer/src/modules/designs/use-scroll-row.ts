import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A horizontal row of tiles that scrolls by pages: arrows in the header instead of a scrollbar.
 * `scroller` is the callback ref of the scroller (`overflow-x-auto`, snap points on the items), `track` of its content
 * (`w-max`): its size changes when tiles come or go, the scroller's own size doesn't.
 * The scroller stays native on purpose — a horizontal touchpad swipe and Shift+wheel scroll it as is.
 */
export function useScrollRow(): {
  scroller: (el: HTMLDivElement | null) => void
  track: (el: HTMLDivElement | null) => void
  canPrev: boolean
  canNext: boolean
  scrollPage: (dir: -1 | 1) => void
  onKeyDown: (e: KeyboardEvent) => void
} {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [track, setTrack] = useState<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({ canPrev: false, canNext: false })

  useEffect(() => {
    if (!el) return
    const update = (): void => {
      // 1px slack: fractional widths at 125% / 150% screen scaling never reach the exact end.
      const canPrev = el.scrollLeft > 1
      const canNext = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setEdges((s) => (s.canPrev === canPrev && s.canNext === canNext ? s : { canPrev, canNext }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (track) ro.observe(track)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [el, track])

  const scrollPage = useCallback(
    (dir: -1 | 1) => {
      // A page minus a tile's tail: the half-visible tile at the edge becomes the first one, not skipped.
      el?.scrollBy({
        left: dir * el.clientWidth * 0.85,
        behavior: reducedMotion() ? 'auto' : 'smooth'
      })
    },
    [el]
  )
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      scrollPage(e.key === 'ArrowLeft' ? -1 : 1)
    },
    [scrollPage]
  )
  // Unmounted (the row collapsed): nothing to scroll, whatever was measured last.
  return {
    scroller: setEl,
    track: setTrack,
    canPrev: !!el && edges.canPrev,
    canNext: !!el && edges.canNext,
    scrollPage,
    onKeyDown
  }
}
