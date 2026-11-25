import { useState } from 'react'
import { toast } from 'sonner'
import type { Design, FileSource } from '@shared/domain/designs'
import { api } from '@/lib/api'
import { plural } from '@/lib/format'
import { reportError } from '@/lib/error-reporting'
import { fillPalette, paletteTried } from './media'

/**
 * Imports images as designs (drop, paste, file picker, clipboard), then fills their palettes in the
 * background: the import (and `onCreated`, e.g. adding them to a moodboard) doesn't wait for the canvas.
 * Every write refreshes the queries itself (data:changed).
 */
export function useImportImages(onCreated?: (designs: Design[]) => Promise<void> | void): {
  importSources: (sources: FileSource[]) => Promise<void>
  busy: boolean
} {
  const [busy, setBusy] = useState(false)
  const run = async (sources: FileSource[]): Promise<void> => {
    if (!sources.length) return
    setBusy(true)
    const created: Design[] = []
    try {
      for (const source of sources) {
        try {
          const d = await api.designs.importImage({ source })
          // Claimed right away: the gallery backfill, refetched by this very write, leaves it to the loop below.
          paletteTried.add(d.id)
          created.push(d)
        } catch (e) {
          toast.error((e as Error).message)
        }
      }
      if (created.length) {
        await onCreated?.(created)
        const n = created.length
        toast.success(
          n === 1
            ? 'Картинку додано'
            : `Додано ${n} ${plural(n, ['картинку', 'картинки', 'картинок'])}`
        )
      }
    } finally {
      setBusy(false)
      void (async () => {
        for (const d of created)
          await fillPalette(d).catch((e) => reportError(e, 'designs:palette'))
      })()
    }
  }
  return { importSources: run, busy }
}
