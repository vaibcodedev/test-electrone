import { toast } from 'sonner'
import type { FileSource } from '@shared/domain/designs'
import { api } from './api'
import { reportError } from './error-reporting'

/** URL for a stored file (served by the vault-file:// protocol from the data folder). */
export function fileUrl(relPath: string | null | undefined): string | undefined {
  if (!relPath) return undefined
  return `vault-file://f/${relPath.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * A tile-sized copy of a stored picture (main/system/thumbnails.ts): tiles decoded full-size screenshots on every
 * scroll of a virtual grid. A file that can't have one (small, SVG, video) comes back as is.
 */
export function thumbUrl(relPath: string | null | undefined): string | undefined {
  if (!relPath) return undefined
  return `vault-file://t/${relPath.split('/').map(encodeURIComponent).join('/')}`
}

/** Converts dropped/pasted File objects to API file sources (path when available, bytes otherwise). */
export async function toFileSources(files: FileList | File[]): Promise<FileSource[]> {
  const out: FileSource[] = []
  for (const file of Array.from(files)) {
    const path = window.vault.pathForFile(file)
    if (path) out.push({ kind: 'path', path })
    else {
      out.push({
        kind: 'bytes',
        name: file.name || 'pasted',
        mime: file.type || 'application/octet-stream',
        data: new Uint8Array(await file.arrayBuffer())
      })
    }
  }
  return out
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.name)
}

/**
 * Extracts a small palette from an image URL with a coarse colour histogram.
 * Runs in the renderer (canvas) — the vault-file protocol sends CORS headers so the canvas isn't tainted.
 */
export async function extractPalette(src: string, count = 6): Promise<string[]> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  await img.decode()
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * size))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    bucket.r += r
    bucket.g += g
    bucket.b += b
    bucket.n++
    buckets.set(key, bucket)
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n)
  const picked: [number, number, number][] = []
  for (const s of sorted) {
    const c: [number, number, number] = [s.r / s.n, s.g / s.n, s.b / s.n]
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 48)) picked.push(c)
    if (picked.length >= count) break
  }
  return picked.map(
    ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  )
}

/**
 * «Показати в папці» for a stored file (a design's picture): Explorer with it selected. Errors go to a toast and the
 * log — a file deleted outside Vault says so instead of nothing happening.
 */
export async function revealStoredFile(relPath: string): Promise<void> {
  try {
    await api.files.revealPath(relPath)
  } catch (e) {
    reportError(e, 'files:reveal')
    toast.error(e instanceof Error ? e.message : 'Не вдалося показати файл')
  }
}
