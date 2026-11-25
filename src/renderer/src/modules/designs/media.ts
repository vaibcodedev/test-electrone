import type { Design } from '@shared/domain/designs'
import { api } from '@/lib/api'
import { extractPalette, fileUrl, isImageFile } from '@/lib/files'

/** What the file picker and drag&drop accept (the server stores .mov too). */
export const MEDIA_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime'
export const isMediaFile = (f: File): boolean => isImageFile(f) || f.type.startsWith('video/')
export const isVideoPath = (p: string): boolean => /\.(mp4|webm|mov)$/i.test(p)

/** Designs whose palette was already tried this session (the import, the pane or the gallery backfill). */
export const paletteTried = new Set<string>()

/** One extraction per image at a time, shared by the import, the backfill and the pane. */
const inFlight = new Map<string, Promise<string[]>>()

/**
 * Extracts the palette of a design's image and saves it (the «Колір» filter and the gallery dots need it).
 * Returns the colours found; nothing is saved for a video, an image without a usable palette, or a design whose
 * image was replaced meanwhile. The write refreshes the queries itself (data:changed).
 */
export function fillPalette(design: Pick<Design, 'id' | 'imagePath'>): Promise<string[]> {
  const { id, imagePath } = design
  if (!imagePath || isVideoPath(imagePath)) return Promise.resolve([])
  paletteTried.add(id)
  const key = `${id}:${imagePath}`
  const running = inFlight.get(key)
  if (running) return running
  const job = (async () => {
    const colors = await extractPalette(fileUrl(imagePath)!)
    if (!colors.length) return colors
    // «Замінити» during the extraction: the old file's colours must not land on the new image.
    const current = await api.designs.get(id)
    if (current?.imagePath !== imagePath) return []
    // Not `update`: that bumps updatedAt, and the gallery sorted by «Змінено» would reshuffle while you look at it.
    await api.designs.setColors({ id, colors })
    return colors
  })().finally(() => inFlight.delete(key))
  inFlight.set(key, job)
  return job
}
