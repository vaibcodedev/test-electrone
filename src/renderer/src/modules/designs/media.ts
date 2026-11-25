import type { Design } from '@shared/domain/designs'
import { api } from '@/lib/api'
import { extractPalette, fileUrl, isImageFile } from '@/lib/files'

/** What the file picker and drag&drop accept (the server stores .mov too). */
export const MEDIA_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime'
export const isMediaFile = (f: File): boolean => isImageFile(f) || f.type.startsWith('video/')
export const isVideoPath = (p: string): boolean => /\.(mp4|webm|mov)$/i.test(p)

/**
 * Extracts the palette of a design's image and saves it (the «Колір» filter and the gallery dots need it).
 * Returns the colours found; nothing is saved for a video or an image without a usable palette.
 * The caller refreshes queries (invalidateAll) when it has finished its batch.
 */
export async function fillPalette(design: Pick<Design, 'id' | 'imagePath'>): Promise<string[]> {
  if (!design.imagePath || isVideoPath(design.imagePath)) return []
  const colors = await extractPalette(fileUrl(design.imagePath)!)
  if (colors.length) await api.designs.update({ id: design.id, patch: { colors } })
  return colors
}
