import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { nativeImage } from 'electron'
import { log } from '../core/logger'
export { THUMBS_DIR_NAME } from '../services/storage-usage'

/**
 * Small copies of stored pictures for tiles (gallery, moodboards, covers): a tile decoded the original — a full
 * page screenshot is 1440 × 8000 and several MB — every time the virtual grid mounted it again, and the gallery
 * lagged. The copy is the system's own thumbnail (Windows shell, off the main thread), cut to the top part that a
 * tile shows, kept on disk until the file changes; the folder is part of «Кеш» in Налаштування › Сховище.
 */
const WIDTH = 640
/** Tiles show the top of a tall screenshot (object-top): no need to keep the rest. */
const MAX_HEIGHT = 960
/** A small file is cheap to decode as is (and keeps a tiny icon from being blown up). */
const MIN_BYTES = 200_000
const PICTURE = /\.(png|jpe?g|webp|gif|bmp)$/i
const PARALLEL = 2

const inflight = new Map<string, Promise<string | null>>()
const waiting: (() => void)[] = []
let running = 0

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve))
  running++
  try {
    return await work()
  } finally {
    running--
    waiting.shift()?.()
  }
}

async function make(abs: string, out: string, dir: string): Promise<string | null> {
  const img = await nativeImage.createThumbnailFromPath(abs, { width: WIDTH, height: WIDTH })
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  const top = height > MAX_HEIGHT ? img.crop({ x: 0, y: 0, width, height: MAX_HEIGHT }) : img
  await mkdir(dir, { recursive: true })
  await writeFile(out, top.toPNG())
  return out
}

/** Path of the thumbnail of `abs` (made on first use), or null — then the original is served. */
export async function thumbnailOf(abs: string, dir: string): Promise<string | null> {
  if (!PICTURE.test(abs)) return null
  const st = await stat(abs)
  if (st.size < MIN_BYTES) return null
  const key = createHash('sha1').update(`${abs}|${st.mtimeMs}|${st.size}|${WIDTH}`).digest('hex')
  const out = join(dir, `${key}.png`)
  if (existsSync(out)) return out
  let job = inflight.get(out)
  if (!job) {
    job = slot(() => make(abs, out, dir))
      .catch((e: unknown) => {
        log.warn(
          '[thumbs] no thumbnail, the original is served',
          e instanceof Error ? e.message : e
        )
        return null
      })
      .finally(() => inflight.delete(out))
    inflight.set(out, job)
  }
  return job
}
