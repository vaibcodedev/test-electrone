import { useEffect, useEffectEvent, useRef } from 'react'
import type { Design } from '@shared/domain/designs'
import { invalidateAll } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { fillPalette, isVideoPath } from './media'

/**
 * Background catch-up for designs saved without a palette (older records, the browser extension):
 * one image per idle slot, each id tried once per session, then the gallery refreshes.
 */
export function usePaletteBackfill(items: Design[]): void {
  const tried = useRef(new Set<string>())
  const missing = items.filter((d) => !d.colors.length && d.imagePath && !isVideoPath(d.imagePath))
  // The list array is rebuilt on every render: restart only when the set of designs without colours changes.
  const key = missing.map((d) => d.id).join(',')
  const untried = useEffectEvent(() => missing.filter((d) => !tried.current.has(d.id)))

  useEffect(() => {
    const queue = untried()
    if (!queue.length) return
    for (const d of queue) tried.current.add(d.id)
    let cancelled = false
    let handle = 0
    let filled = 0
    const flush = (): void => {
      if (filled) invalidateAll()
      filled = 0
    }
    const next = (): void => {
      if (cancelled) return
      const d = queue.shift()
      if (!d) return flush()
      fillPalette(d)
        .then((colors) => {
          if (colors.length) filled++
        })
        .catch((e) => reportError(e, 'designs:palette'))
        .finally(() => {
          if (!cancelled) handle = requestIdleCallback(next)
        })
    }
    handle = requestIdleCallback(next)
    return () => {
      cancelled = true
      cancelIdleCallback(handle)
      // Whatever wasn't reached gets another try on the next run.
      for (const d of queue) tried.current.delete(d.id)
      flush()
    }
  }, [key])
}
