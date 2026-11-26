/** Global search over the text of attached PDFs, on a real database (the PDF is read in-process here). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { getTableName, isTable } from 'drizzle-orm'
import * as schema from '@main/db/schema'
import { log } from '@main/core/logger'
import { DbContext } from '@main/db/client'
import { AttachmentTextStore } from '@main/services/attachment-text'
import { extractPdfText, type PdfTextResult } from '@main/services/pdf-text/extract'
import { openVault, type Vault } from './support/vault'
import { makePdf } from './support/pdf'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(async () => {
  await v.fileTextIndexer.idle()
  v.close()
})

async function board(title = 'Звіти', description = 'Опис дошки'): Promise<string> {
  return (await v.api.boards.create({ title, description })).id
}

async function attach(boardId: string, name: string, bytes: Buffer): Promise<string> {
  const source = join(v.dir, name)
  writeFileSync(source, bytes)
  const a = await v.m.attachments.add(
    { type: 'board', id: boardId },
    { kind: 'path', path: source }
  )
  return a.id
}

const found = (text: string): string[] => v.search.query({ text }).map((h) => h.id)
const status = (id: string): string | undefined =>
  (
    v.db.sqlite.prepare('SELECT status FROM attachment_texts WHERE attachment_id = ?').get(id) as
      { status: string } | undefined
  )?.status

/**
 * The next extraction has read the file and finishes when the test says so (or when aborted, like the worker);
 * later ones run as usual.
 */
function heldExtraction(): { release: () => void; started: Promise<void> } {
  let release = (): void => undefined
  let started = (): void => undefined
  const ready = new Promise<void>((r) => (started = r))
  const usual = v.extractPdf
  v.extractPdf = (abs, signal) => {
    v.extractPdf = usual
    const bytes = readFileSync(abs)
    return new Promise<PdfTextResult & { aborted?: boolean }>((resolve) => {
      release = () => void extractPdfText(bytes).then(resolve)
      signal.addEventListener('abort', () => resolve({ status: 'failed', text: '', aborted: true }))
      started()
    })
  }
  return { release: () => release(), started: ready }
}

describe('PDF text in global search', () => {
  it('a record is found by the text of its PDF, and the snippet names the file', async () => {
    const id = await board()
    await attach(id, 'contract.pdf', makePdf([['Consulting agreement with quokka clause']]))
    await v.fileTextIndexer.idle()
    expect(found('quokka')).toEqual([id])
    const [hit] = v.search.query({ text: 'quokka' })
    expect(hit.snippet.startsWith('У файлі «contract.pdf»: ')).toBe(true)
    expect(hit.snippet).toContain('\u0001quokka\u0002')
  })

  it('a match in the record itself keeps its own snippet and ranks above a PDF-only match', async () => {
    const own = await board('Wombat', 'wombat у тексті')
    const other = await board('Інша')
    await attach(other, 'a.pdf', makePdf([['wombat in a file']]))
    await v.fileTextIndexer.idle()
    const hits = v.search.query({ text: 'wombat' })
    expect(hits.map((h) => h.id)).toEqual([own, other])
    expect(hits[0].snippet.startsWith('У файлі')).toBe(false)
  })

  it('the PDF never crowds out the record text: an index of its own', async () => {
    const id = await board('Великий', `${'слово '.repeat(3000)} кінецьтексту`)
    await attach(id, 'big.pdf', makePdf([[`numbat ${'filler '.repeat(60)}`]]))
    await v.fileTextIndexer.idle()
    expect(found('кінецьтексту')).toEqual([id])
    expect(found('numbat')).toEqual([id])
    const body = v.db.sqlite
      .prepare('SELECT body FROM search_index WHERE entity_id = ?')
      .get(id) as { body: string }
    expect(body.body).not.toContain('numbat')
  })

  it('is index-only: the chat search (ownText) and the record text never see it', async () => {
    const id = await board()
    await attach(id, 'secret.pdf', makePdf([['platypus confidential']]))
    await v.fileTextIndexer.idle()
    expect(found('platypus')).toEqual([id])
    expect(v.search.query({ text: 'platypus' }, { ownText: true })).toEqual([])
    expect(
      v.search.query({ text: 'platypus Звіти' }, { any: true, ownText: true }).map((h) => h.id)
    ).toEqual([id])
    const row = v.registry.findRow({ type: 'board', id })!
    expect(JSON.stringify(v.registry.get('board').searchDoc(row))).not.toContain('platypus')
    const tables = Object.values(schema).filter(isTable).map(getTableName)
    expect(tables).not.toContain('attachment_texts') // JSON export dumps the drizzle tables only
  })

  it('words must all be in the record or all in one of its files', async () => {
    const id = await board('Звіти')
    await attach(id, 'a.pdf', makePdf([['alpha quokka']]))
    await attach(id, 'b.pdf', makePdf([['beta gamma']]))
    await v.fileTextIndexer.idle()
    expect(found('Звіти quokka')).toEqual([]) // split between the record and a file
    expect(found('quokka gamma')).toEqual([]) // split between two files
    expect(found('beta gamma')).toEqual([id])
    // The label names the file the words are in.
    expect(v.search.query({ text: 'gamma' })[0].snippet.startsWith('У файлі «b.pdf»: ')).toBe(true)
  })

  it('the passage is found like the index finds: prefixes, case, accents', async () => {
    const id = await board()
    await attach(id, 'cv.pdf', makePdf([['Intro line', 'My CAFÉ Résumé is here']]))
    await v.fileTextIndexer.idle()
    const [hit] = v.search.query({ text: 'resum' })
    expect(hit.id).toBe(id)
    expect(hit.snippet).toContain('\u0001Résumé\u0002')
  })

  it('a lost file index is rebuilt from the stored text at startup', async () => {
    const id = await board()
    await attach(id, 'x.pdf', makePdf([['manatee']]))
    await v.fileTextIndexer.idle()
    v.db.sqlite.prepare("INSERT INTO file_index (file_index) VALUES ('delete-all')").run()
    expect(found('manatee')).toEqual([])
    expect(v.fileTexts.ensureIndex()).toBe(true)
    expect(found('manatee')).toEqual([id])
    expect(v.fileTexts.ensureIndex()).toBe(false)
  })

  it('pause lets go of the file being read and resume reads it again', async () => {
    const id = await board()
    const held = heldExtraction()
    const a = await attach(id, 'x.pdf', makePdf([['dugong']]))
    await held.started
    await v.fileTextIndexer.pause()
    expect(status(a)).toBeUndefined()
    v.fileTextIndexer.resume()
    await v.fileTextIndexer.idle()
    expect(status(a)).toBe('ok')
    expect(found('dugong')).toEqual([id])
  })

  it('survives every reindex: edit, rebuild, trash and restore', async () => {
    const id = await board()
    await attach(id, 'x.pdf', makePdf([['axolotl notes']]))
    await v.fileTextIndexer.idle()
    await v.api.boards.update({ id, patch: { title: 'Нова назва' } })
    expect(found('axolotl')).toEqual([id])
    v.search.rebuild()
    expect(found('axolotl')).toEqual([id])
    await v.api.boards.remove(id)
    expect(found('axolotl')).toEqual([])
    v.trash.restore({ type: 'board', id })
    expect(found('axolotl')).toEqual([id])
  })

  it('removing the attachment or purging the record removes the text', async () => {
    const id = await board()
    const a = await attach(id, 'x.pdf', makePdf([['pangolin']]))
    await v.fileTextIndexer.idle()
    v.m.attachments.remove(a)
    expect(found('pangolin')).toEqual([])
    expect(status(a)).toBeUndefined()

    const id2 = await board('Друга')
    const a2 = await attach(id2, 'y.pdf', makePdf([['pangolin again']]))
    await v.fileTextIndexer.idle()
    await v.api.boards.remove(id2)
    v.trash.purge({ type: 'board', id: id2 })
    expect(status(a2)).toBeUndefined()
    expect(found('pangolin')).toEqual([])
  })

  it('an extraction finishing after the attachment is gone changes nothing', async () => {
    const id = await board()
    const held = heldExtraction()
    const a = await attach(id, 'x.pdf', makePdf([['narwhal']]))
    await held.started
    v.m.attachments.remove(a)
    held.release()
    await v.fileTextIndexer.idle()
    expect(status(a)).toBeUndefined()
    expect(found('narwhal')).toEqual([])
  })

  it('an extraction finishing after the database was swapped (backup restore) is dropped, the backfill redoes it', async () => {
    const id = await board()
    const held = heldExtraction()
    const a = await attach(id, 'x.pdf', makePdf([['capybara']]))
    await held.started
    v.db.close()
    v.db.open()
    held.release()
    await v.fileTextIndexer.idle()
    expect(status(a)).toBeUndefined()
    expect(v.fileTextIndexer.backfill()).toBe(1)
    await v.fileTextIndexer.idle()
    expect(found('capybara')).toEqual([id])
  })

  it('PDFs attached before this version are picked up by the backfill', async () => {
    const id = await board()
    const a = await attach(id, 'old.pdf', makePdf([['tapir report']]))
    await v.fileTextIndexer.idle()
    v.db.sqlite.prepare('DELETE FROM attachment_texts').run()
    v.search.rebuild()
    expect(found('tapir')).toEqual([])
    expect(v.fileTextIndexer.backfill()).toBe(1)
    await v.fileTextIndexer.idle()
    expect(status(a)).toBe('ok')
    expect(found('tapir')).toEqual([id])
    expect(v.fileTextIndexer.backfill()).toBe(0) // processed files are not read again
  })

  it('broken, scanned and non-PDF files attach fine, quietly, and are not retried', async () => {
    const warn = vi.spyOn(log, 'warn')
    const info = vi.spyOn(log, 'info')
    const id = await board()
    const broken = await attach(id, 'broken.pdf', Buffer.from('%PDF-1.4 garbage secretword'))
    const scan = await attach(id, 'scan.pdf', makePdf([[]]))
    const txt = await attach(id, 'notes.txt', Buffer.from('plain text'))
    await v.fileTextIndexer.idle()
    expect(status(broken)).toBe('failed')
    expect(status(scan)).toBe('empty')
    expect(status(txt)).toBeUndefined()
    expect(v.fileTextIndexer.backfill()).toBe(0)
    expect(JSON.stringify([...warn.mock.calls, ...info.mock.calls])).not.toContain('secretword')
    expect(v.m.attachments.list({ type: 'board', id })).toHaveLength(3)
  })

  it('an extractor that throws never breaks attaching', async () => {
    v.extractPdf = async () => {
      throw new Error('boom')
    }
    const id = await board()
    await expect(attach(id, 'x.pdf', makePdf([['x']]))).resolves.toBeTruthy()
    await v.fileTextIndexer.idle()
  })
})

describe('updating a base from before PDF search', () => {
  it('keeps the data and the search index, and queues the old PDFs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vault-pdf-upgrade-'))
    try {
      // The migrations of the previous version: everything up to 0008.
      const oldMigrations = join(dir, 'migrations')
      cpSync(resolve('src/main/db/migrations'), oldMigrations, { recursive: true })
      const journalFile = join(oldMigrations, 'meta', '_journal.json')
      const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as {
        entries: { tag: string }[]
      }
      journal.entries = journal.entries.filter((e) => e.tag !== '0009_pdf_search')
      writeFileSync(journalFile, JSON.stringify(journal))
      rmSync(join(oldMigrations, '0009_pdf_search.sql'))

      const file = join(dir, 'vault.db')
      const old = new DbContext(file, oldMigrations)
      old.open()
      const t = Date.now()
      old.sqlite
        .prepare(
          "INSERT INTO ideas (id, title, body, status, created_at, updated_at) VALUES ('i1', 'Ідея', 'текст', 'new', ?, ?)"
        )
        .run(t, t)
      old.sqlite
        .prepare(
          "INSERT INTO attachments VALUES ('a1', 'idea', 'i1', '2026/11/a1.pdf', 'old.pdf', 'application/pdf', 10, ?)"
        )
        .run(t)
      old.sqlite
        .prepare(
          "INSERT INTO search_index (entity_type, entity_id, title, body) VALUES ('idea', 'i1', 'Ідея', 'текст')"
        )
        .run()
      old.close()

      const db = new DbContext(file, resolve('src/main/db/migrations'))
      db.open()
      try {
        expect(db.sqlite.prepare('SELECT count(*) AS c FROM ideas').get()).toEqual({ c: 1 })
        expect(db.sqlite.prepare('SELECT count(*) AS c FROM attachments').get()).toEqual({ c: 1 })
        // The record index is untouched (no rebuild at the first start after the update).
        expect(db.sqlite.prepare('SELECT count(*) AS c FROM search_index').get()).toEqual({ c: 1 })
        const store = new AttachmentTextStore(db)
        expect(store.missing()).toEqual(['a1'])
        expect(store.ensureIndex()).toBe(false)
      } finally {
        db.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
