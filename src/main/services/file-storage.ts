import { clipboard, nativeImage } from 'electron'
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, extname, join, normalize, relative, sep } from 'path'
import type { ClipboardImage, FileSource } from '@shared/domain/designs'
import { newId, UserError } from '../core/util'

export interface StoredFile {
  /** Relative to the files folder, always with forward slashes. */
  path: string
  originalName: string
  mime: string
  size: number
  width: number | null
  height: number | null
}

const MAX_SIZE = 300 * 1024 * 1024

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.fig': 'application/octet-stream'
}

const EXT_BY_MIME = Object.fromEntries(Object.entries(MIME).map(([ext, mime]) => [mime, ext]))

export function mimeOf(name: string): string {
  return MIME[extname(name).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Stores binary files next to the database: <data>/files/YYYY/MM/<uuid>.<ext>.
 * The DB only keeps the relative path. Single responsibility: disk I/O + path safety.
 */
export class FileStorage {
  constructor(private readonly root: string) {}

  /** Resolves a stored relative path, refusing anything that escapes the files folder. */
  resolve(relPath: string): string {
    const abs = normalize(join(this.root, relPath))
    const rel = relative(this.root, abs)
    if (rel.startsWith('..') || rel.includes(`..${sep}`) || abs === this.root) {
      throw new UserError('Неприпустимий шлях до файлу')
    }
    return abs
  }

  private allocate(ext: string): { rel: string; abs: string } {
    const d = new Date()
    const dir = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
    mkdirSync(join(this.root, dir), { recursive: true })
    const rel = `${dir}/${newId()}${ext.toLowerCase()}`
    return { rel, abs: join(this.root, rel) }
  }

  async import(source: FileSource, opts: { imagesOnly?: boolean } = {}): Promise<StoredFile> {
    const stored = await this.write(source)
    if (opts.imagesOnly && !stored.mime.startsWith('image/') && !stored.mime.startsWith('video/')) {
      this.remove(stored.path)
      throw new UserError('Потрібне зображення, GIF або відео')
    }
    return stored
  }

  private async write(source: FileSource): Promise<StoredFile> {
    switch (source.kind) {
      case 'path': {
        if (!existsSync(source.path)) throw new UserError('Файл не знайдено')
        const st = statSync(source.path)
        if (!st.isFile()) throw new UserError('Це не файл')
        if (st.size > MAX_SIZE) throw new UserError('Файл більший за 300 МБ')
        const name = basename(source.path)
        const { rel, abs } = this.allocate(extname(name) || '.bin')
        copyFileSync(source.path, abs)
        return this.describe(rel, name, st.size)
      }
      case 'bytes': {
        if (source.data.byteLength > MAX_SIZE) throw new UserError('Файл більший за 300 МБ')
        const ext = extname(source.name) || EXT_BY_MIME[source.mime] || '.bin'
        const { rel, abs } = this.allocate(ext)
        writeFileSync(abs, source.data)
        return this.describe(rel, source.name || `file${ext}`, source.data.byteLength)
      }
      case 'clipboard': {
        const image = await this.clipboardImage()
        if (!image) throw new UserError('У буфері обміну немає зображення')
        const ext = EXT_BY_MIME[image.mime] ?? '.png'
        const { rel, abs } = this.allocate(ext)
        writeFileSync(abs, image.data)
        return {
          path: rel,
          originalName: 'clipboard' + ext,
          mime: image.mime,
          size: image.data.byteLength,
          width: image.width,
          height: image.height
        }
      }
    }
  }

  private describe(rel: string, originalName: string, size: number): StoredFile {
    const mime = mimeOf(rel)
    let width: number | null = null
    let height: number | null = null
    if (mime === 'image/png' || mime === 'image/jpeg') {
      const s = nativeImage.createFromPath(join(this.root, rel)).getSize()
      if (s.width) {
        width = s.width
        height = s.height
      }
    }
    return { path: rel, originalName, mime, size, width, height }
  }

  /** Paths queued by remove() while a DB transaction runs (see afterCommit). */
  private deferred: string[] | null = null

  /**
   * Runs `fn` (a DB transaction) and deletes files queued by remove() only if it succeeded:
   * a rolled-back purge must not leave records pointing at files already gone from disk.
   */
  afterCommit<T>(fn: () => T): T {
    const outer = this.deferred
    this.deferred = []
    let queued: string[] = []
    try {
      const result = fn()
      queued = this.deferred
      return result
    } finally {
      this.deferred = outer
      for (const p of queued) this.remove(p)
    }
  }

  remove(relPath: string | null | undefined): void {
    if (!relPath) return
    if (this.deferred) {
      this.deferred.push(relPath)
      return
    }
    try {
      rmSync(this.resolve(relPath), { force: true })
    } catch {
      /* already gone */
    }
  }

  /** The clipboard's first image (Electron 44: the async W3C clipboard), or null when it holds none. */
  async clipboardImage(): Promise<ClipboardImage | null> {
    const items = await clipboard.read()
    const item = items.find((i) => i.types.some((t) => t.startsWith('image/')))
    const mime = item?.types.find((t) => t.startsWith('image/'))
    if (!item || !mime) return null
    const blob = (await item.getType(mime)) as Blob
    const data = new Uint8Array(await blob.arrayBuffer())
    if (data.byteLength > MAX_SIZE) throw new UserError('Картинка в буфері більша за 300 МБ')
    const size = nativeImage.createFromBuffer(Buffer.from(data)).getSize()
    return { data, mime, width: size.width || null, height: size.height || null }
  }

  async clipboardHasImage(): Promise<boolean> {
    const items = await clipboard.read()
    return items.some((i) => i.types.some((t) => t.startsWith('image/')))
  }
}
