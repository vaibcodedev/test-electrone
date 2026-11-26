import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect, test, uid } from './fixtures'
import { makePdf } from '../unit/support/pdf'

/**
 * Ctrl+K finds a record by the text of its attached PDF: the file is read on a worker thread after attaching,
 * the hit says which file the match is in, and the chat ШІ's search (own text only) doesn't see it.
 */
test('a note is found in Ctrl+K by a word from its PDF', async ({ vault }) => {
  const { win, rpc } = vault
  const word = `quokka${uid()}`
  const dir = mkdtempSync(join(tmpdir(), 'vault-pdf-'))
  try {
    const note = await rpc('notes.create', { title: `Договір ${uid()}`, body: 'Без цього слова' })
    const pdf = join(dir, 'contract.pdf')
    writeFileSync(pdf, makePdf([['Consulting agreement'], [`Clause about ${word} here`]]))
    // The way a dropped file is attached (renderer: pathForFile → files.add).
    await rpc('files.add', {
      ref: { type: 'note', id: note.id },
      source: { kind: 'path', path: pdf }
    })

    // Read in the background: attaching returned at once, the text arrives a moment later.
    await expect
      .poll(async () =>
        (await rpc('search.query', { text: word })).map((h: { id: string }) => h.id)
      )
      .toEqual([note.id])

    await win.keyboard.press('Control+k')
    const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
    await palette.getByRole('combobox').fill(word)
    const hit = palette.getByRole('option', { name: new RegExp(note.title) })
    await expect(hit).toBeVisible()
    await expect(hit).toContainText('У файлі «contract.pdf»')
    await expect(hit.locator('mark')).toHaveText(word)
    await win.keyboard.press('Escape')
    await expect(palette).toBeHidden()

    // Removing the file takes its text out of search.
    const [file] = await rpc('files.list', { type: 'note', id: note.id })
    await rpc('files.remove', file.id)
    expect(await rpc('search.query', { text: word })).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
