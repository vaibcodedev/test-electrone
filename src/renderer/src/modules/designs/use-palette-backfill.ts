import { useEffect, useEffectEvent } from 'react'
import type { Design } from '@shared/domain/designs'
import { reportError } from '@/lib/error-reporting'
import { fillPalette, isVideoPath, paletteTried } from './media'

/**
 * Background catch-up for designs saved without a palette (older records, the browser extension):
 * one image per idle slot, each id tried once per session (shared with the import and the pane).
 * Each write refreshes the gallery itself (data:changed).
 */
export function usePaletteBackfill(items: Design[]): void {
  const missing = items.filter((d) => !d.colors.length && d.imagePath && !isVideoPath(d.imagePath))
  // The list array is rebuilt on every render: restart only when the set of designs without colours changes.
  const key = missing.map((d) => d.id).join(',')
  const untried = useEffectEvent(() => missing.filter((d) => !paletteTried.has(d.id)))

  useEffect(() => {
    const queue = untried()
    if (!queue.length) return
    for (const d of queue) paletteTried.add(d.id)
    let cancelled = false
    let handle = 0
    const next = (): void => {
      if (cancelled) return
      const d = queue.shift()
      if (!d) return
      fillPalette(d)
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
      for (const d of queue) paletteTried.delete(d.id)
    }
  }, [key])
}
