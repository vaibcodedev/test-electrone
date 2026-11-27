import type { EntityType } from '@shared/entity-types'
import type { DbContext } from '../db/client'
import { log } from '../core/logger'
import { now } from '../core/util'
import type { PdfTextResult } from './pdf-text/extract'
import { passage } from './pdf-text/passage'

/** Files whose text is read for search. */
export const PDF_MIME = 'application/pdf'

/** Reads of one file at most: a `failed` one is tried again at the next starts, a broken file not forever. */
const MAX_ATTEMPTS = 3

/** A file of a record that matched a query, best first (the file index's bm25). */
export interface FileHit {
  type: EntityType
  id: string
  /** attachment_texts.id: the file's document in the index. */
  textId: number
  name: string
  rank: number
}

/** What SearchIndex reads: the files whose text matches, and the passage around the match. */
export interface FileTextSource {
  /** Files matching an FTS5 expression, best first; `limit` files at most. */
  search(match: string, opts: { types?: readonly EntityType[]; limit: number }): FileHit[]
  /** The text around the first of the words in one file, matches wrapped in \u0001…\u0002. */
  passage(textId: number, words: string[]): string
}

interface AttachmentFacts {
  entityType: EntityType
  entityId: string
  path: string
  mime: string
  size: number
}

/**
 * Extracted text of attached files: table `attachment_texts` and its FTS5 index `file_index` (migration 0009,
 * deliberately outside the drizzle schema — derived data, not part of the JSON export). A row per processed file,
 * whatever came of it, with the number of reads. Triggers keep the index in step, including the ON DELETE CASCADE from `attachments`, so a
 * removed file or a purged record leaves nothing searchable behind.
 */
export class AttachmentTextStore implements FileTextSource {
  constructor(private readonly ctx: DbContext) {}

  search(match: string, opts: { types?: readonly EntityType[]; limit: number }): FileHit[] {
    const types = opts.types?.length ? opts.types : null
    const typeFilter = types ? `AND a.entity_type IN (${types.map(() => '?').join(',')})` : ''
    // Rank first, no snippet(): only bm25 over the index; the text is read for the few hits shown.
    return this.ctx.sqlite
      .prepare(
        `SELECT a.entity_type AS type, a.entity_id AS id, t.id AS textId, a.original_name AS name,
                f.rank AS rank
           FROM file_index f
           JOIN attachment_texts t ON t.id = f.rowid
           JOIN attachments a ON a.id = t.attachment_id
          WHERE file_index MATCH ? ${typeFilter}
          ORDER BY f.rank
          LIMIT ?`
      )
      .all(match, ...(types ?? []), opts.limit) as FileHit[]
  }

  passage(textId: number, words: string[]): string {
    const row = this.ctx.sqlite
      .prepare('SELECT text FROM attachment_texts WHERE id = ?')
      .get(textId) as { text: string } | undefined
    return row ? passage(row.text, words) : ''
  }

  /**
   * The index lost while the text is still there (a damaged index, a hand-edited base): rebuilt from the table at
   * startup. True when it had to.
   */
  ensureIndex(): boolean {
    const texts = (
      this.ctx.sqlite
        .prepare("SELECT count(*) AS c FROM attachment_texts WHERE status = 'ok'")
        .get() as {
        c: number
      }
    ).c
    if (!texts) return false
    const indexed = (
      this.ctx.sqlite.prepare('SELECT count(*) AS c FROM file_index_docsize').get() as { c: number }
    ).c
    if (indexed) return false
    this.ctx.sqlite.prepare("INSERT INTO file_index (file_index) VALUES ('rebuild')").run()
    return true
  }

  attachment(id: string): AttachmentFacts | undefined {
    return this.ctx.sqlite
      .prepare(
        `SELECT entity_type AS entityType, entity_id AS entityId, path, mime, size FROM attachments WHERE id = ?`
      )
      .get(id) as AttachmentFacts | undefined
  }

  /** True once the file needs no more reading: it has an outcome that another try would not change. */
  settled(id: string): boolean {
    return !!this.ctx.sqlite
      .prepare(
        `SELECT 1 FROM attachment_texts
          WHERE attachment_id = ? AND (status <> 'failed' OR attempts >= ?)`
      )
      .get(id, MAX_ATTEMPTS)
  }

  /**
   * PDFs to read: first those not processed yet (attached before this version, or left by a quit mid-queue),
   * then the failed ones with tries left; newest first in each.
   */
  pending(): string[] {
    const rows = this.ctx.sqlite
      .prepare(
        `SELECT a.id AS id FROM attachments a
           LEFT JOIN attachment_texts t ON t.attachment_id = a.id
          WHERE a.mime = ?
            AND (t.attachment_id IS NULL OR (t.status = 'failed' AND t.attempts < ?))
          ORDER BY t.attachment_id IS NOT NULL, a.created_at DESC`
      )
      .all(PDF_MIME, MAX_ATTEMPTS) as { id: string }[]
    return rows.map((r) => r.id)
  }

  /**
   * Saves the outcome, only while the attachment is still there with the same file (it may have been removed or
   * the database restored while the file was being read). False when dropped.
   */
  save(id: string, path: string, result: PdfTextResult): boolean {
    return this.ctx.tx(() => {
      const a = this.attachment(id)
      if (!a || a.path !== path) return false
      this.ctx.sqlite
        .prepare(
          `INSERT INTO attachment_texts (attachment_id, status, text, extracted_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(attachment_id) DO UPDATE SET status = excluded.status, text = excluded.text,
             extracted_at = excluded.extracted_at, attempts = attempts + 1`
        )
        .run(id, result.status, result.status === 'ok' ? result.text : '', now())
      return true
    })
  }
}

/**
 * Reads one file's text (on a worker thread in the app, a stub in tests). Never rejects; an aborted read
 * resolves with `aborted: true` and is not an outcome of the file.
 */
export type ExtractFile = (
  absPath: string,
  signal: AbortSignal
) => Promise<PdfTextResult & { aborted?: boolean }>

/**
 * Brings the text of attached PDFs into global search. Files are read one at a time, in the background, off the
 * main thread: attaching never waits for it and never fails because of it. A bad file (broken, password,
 * scan, too big) is recorded with its status and logged without its text; only a `failed` read is tried again, at a
 * later start and a limited number of times.
 */
export class AttachmentTextIndexer {
  private readonly queue = new Set<string>()
  private running: Promise<void> | null = null
  private paused = false
  private current: { id: string; abort: AbortController } | null = null

  constructor(
    private readonly deps: {
      ctx: DbContext
      store: AttachmentTextStore
      /** Absolute path of a stored file. */
      resolve: (rel: string) => string
      extract: ExtractFile
      /** Larger PDFs are not opened at all. */
      maxBytes: number
    }
  ) {}

  /** A file was just attached: PDFs join the queue. */
  added(a: { id: string; mime: string }): void {
    if (a.mime !== PDF_MIME) return
    this.queue.add(a.id)
    this.pump()
  }

  /** Every PDF still to be read (startup, after a backup restore). Returns how many were queued. */
  backfill(): number {
    const ids = this.deps.store.pending()
    for (const id of ids) this.queue.add(id)
    if (ids.length) {
      log.info(`[file-text] ${ids.length} PDF file(s) queued for search`)
      this.pump()
    }
    return ids.length
  }

  /**
   * Stops reading files until resume(): the file being read is let go (its worker ends, so Windows releases the
   * file — a backup restore renames the files folder). That file goes back to the queue.
   */
  async pause(): Promise<void> {
    this.paused = true
    this.current?.abort.abort()
    await this.idle()
  }

  resume(): void {
    this.paused = false
    this.pump()
  }

  /** Resolves once nothing is being read (tests, pause). */
  async idle(): Promise<void> {
    while (this.running) await this.running
  }

  private pump(): void {
    if (this.running || this.paused || !this.queue.size) return
    this.running = this.drain().finally(() => {
      this.running = null
    })
  }

  private async drain(): Promise<void> {
    for (let id = this.next(); id; id = this.next()) {
      try {
        await this.process(id)
      } catch (e) {
        log.error('[file-text] attachment', id, e)
      }
    }
  }

  private next(): string | undefined {
    if (this.paused) return undefined
    const id = this.queue.values().next().value
    if (id !== undefined) this.queue.delete(id)
    return id
  }

  private async process(id: string): Promise<void> {
    const { store } = this.deps
    // The connection the job started on: a backup restore swaps it, and a result for the old base is dropped
    // (the restore queues the restored base's PDFs itself).
    const db = this.currentDb()
    if (!db) return
    const a = store.attachment(id)
    if (!a || a.mime !== PDF_MIME || store.settled(id)) return
    let result: PdfTextResult & { aborted?: boolean }
    if (a.size > this.deps.maxBytes) result = { status: 'too-large', text: '' }
    else {
      const abort = new AbortController()
      this.current = { id, abort }
      try {
        result = await this.deps.extract(this.deps.resolve(a.path), abort.signal)
      } finally {
        this.current = null
      }
      if (result.aborted) {
        this.queue.add(id)
        return
      }
    }
    // Never the text itself: the id, the outcome and the library's message.
    if (result.status === 'failed')
      log.warn('[file-text] PDF not read', { attachment: id, error: result.error })
    else if (result.status !== 'ok')
      log.info('[file-text] PDF without searchable text', { attachment: id, status: result.status })
    if (this.currentDb() !== db) return
    store.save(id, a.path, result)
  }

  /** The open connection, or null while a restore has it closed. */
  private currentDb(): unknown {
    try {
      return this.deps.ctx.sqlite
    } catch {
      return null
    }
  }
}
