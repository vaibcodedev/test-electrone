import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A horizontal row of tiles that scrolls by pages: arrows in the header instead of a scrollbar.
 * `scroller` is the callback ref of the scroller (`overflow-x-auto`, snap points on the items), `track` of its content
 * (`w-max`): its size changes when tiles come or go, the scroller's own size doesn't.
 * The scroller stays native on purpose — a horizontal touchpad swipe and Shift+wheel scroll it as is. For a mouse
 * it also takes a plain wheel (sideways, until the row's end — then the page scrolls) and a drag: grab, swipe,
 * let go — it coasts on and settles on a tile; a click that ended a drag doesn't open the tile.
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

  useEffect(() => {
    if (!el) return
    // Wheel: vertical turns sideways while the row can still move that way; at its end the page gets it.
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 1) return
      const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY))
      if (Math.abs(next - el.scrollLeft) < 1) return
      e.preventDefault()
      el.scrollBy({ left: e.deltaY, behavior: 'auto' })
    }

    // Drag (mouse only — touch and pen scroll natively). Snapping is off while the hand holds the row, or every
    // scrollLeft write would jump to a tile; back on at release, the browser settles on the nearest one.
    let start: { x: number; left: number } | null = null
    let dragged = false
    let samples: { x: number; t: number }[] = []
    const onDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      start = { x: e.clientX, left: el.scrollLeft }
      dragged = false
      samples = [{ x: e.clientX, t: e.timeStamp }]
    }
    const onMove = (e: PointerEvent): void => {
      if (!start) return
      const dx = e.clientX - start.x
      if (!dragged) {
        // A few pixels of slack: a click with a shaky hand stays a click.
        if (Math.abs(dx) < 6) return
        dragged = true
        el.setPointerCapture(e.pointerId)
        el.style.scrollSnapType = 'none'
        el.style.cursor = 'grabbing'
        el.style.userSelect = 'none'
      }
      el.scrollLeft = start.left - dx
      samples = [...samples.slice(-4), { x: e.clientX, t: e.timeStamp }]
    }
    const onUp = (e: PointerEvent): void => {
      if (!start) return
      start = null
      if (!dragged) return
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      el.style.cursor = ''
      el.style.userSelect = ''
      // Coast: the speed of the last moves, about a fifth of a second more travel, then snap to a tile.
      const first = samples[0]
      const last = samples[samples.length - 1]
      const dt = Math.max(1, last.t - first.t)
      const velocity = (last.x - first.x) / dt
      el.style.scrollSnapType = ''
      if (!reducedMotion() && Math.abs(velocity) > 0.2)
        el.scrollBy({ left: -velocity * 220, behavior: 'smooth' })
    }
    // The click that ends a drag must not open the tile under the pointer (capture: before React's handler).
    const onClick = (e: MouseEvent): void => {
      if (!dragged) return
      dragged = false
      e.preventDefault()
      e.stopPropagation()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('click', onClick, true)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('click', onClick, true)
    }
  }, [el])

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
