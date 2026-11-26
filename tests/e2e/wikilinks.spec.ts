import type { Locator, Page } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/** «[[» record links in Markdown fields and the «Згадки» block. */

const pane = (win: Page): Locator => win.locator('[data-detail-mode]').first()
const menu = (win: Page): Locator => win.getByRole('listbox', { name: 'Записи для посилання' })

test('[[ inserts a link that follows renames, opens the record and shows up in its «Згадки»', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const tag = uid()
  const target = await rpc('notes.create', { title: `Ціль ${tag}`, body: '' })
  const source = await rpc('notes.create', { title: `Джерело ${tag}`, body: '' })

  await go(`/notes?open=${source.id}`)
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
  await win.locator('[data-edit-detail]').click()
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
  const text = win.getByRole('textbox', { name: 'Текст' })
  await text.click()
  // The menu opens under the text: a pointer resting there would pick the row under it.
  await win.mouse.move(1, 1)

  // Esc closes the menu for this «[[», not the record's edit mode. The record being written is not offered.
  await win.keyboard.type('[[')
  await expect(menu(win)).toBeVisible()
  await expect(menu(win).getByRole('option').first()).toBeVisible()
  await expect(menu(win).getByRole('option', { name: new RegExp(`Джерело ${tag}`) })).toHaveCount(0)
  await win.keyboard.press('Escape')
  await expect(menu(win)).toHaveCount(0)
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
  await expect(text).toBeFocused()
  await win.keyboard.press('Control+A')
  await win.keyboard.press('Delete')

  await win.keyboard.type(`Перечитати [[Ціль ${tag}`)
  const option = menu(win).getByRole('option', { name: new RegExp(`Ціль ${tag}`) })
  await expect(option).toHaveAttribute('aria-selected', 'true')
  await win.keyboard.press('Enter')
  await expect(menu(win)).toHaveCount(0)
  // The stored link shows as a chip with the record's title, not as `vault:note/<uuid>`.
  await expect(text).toHaveText(`Перечитати Ціль ${tag}`)
  await expect(text.locator('[data-wikilink="live"]')).toHaveText(`Ціль ${tag}`)
  await win.keyboard.type(' до п’ятниці')
  await win.locator('[data-save]').click()
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
  await expect
    .poll(async () => (await rpc('notes.get', source.id)).body)
    .toBe(`Перечитати [Ціль ${tag}](vault:note/${target.id}) до п’ятниці`)

  // The link resolves by id: a renamed record keeps its link and shows the new title.
  const link = pane(win).locator('a[data-wikilink="live"]')
  await expect(link).toHaveText(`Ціль ${tag}`)
  await rpc('notes.update', { id: target.id, patch: { title: `Нова назва ${tag}` } })
  await expect(link).toHaveText(`Нова назва ${tag}`)

  await link.click()
  await expect
    .poll(() =>
      win.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('open'))
    )
    .toBe(target.id)
  const mentions = win
    .locator('section')
    .filter({ has: win.getByRole('heading', { name: 'Згадки' }) })
  await expect(mentions).toBeVisible()
  await expect(mentions.getByRole('button', { name: new RegExp(`Джерело ${tag}`) })).toContainText(
    `Перечитати Нова назва ${tag} до п’ятниці`
  )

  // A record in the trash: the link is struck through with «У кошику», and it no longer mentions anything.
  await rpc('notes.remove', target.id)
  await go(`/notes?open=${source.id}`)
  const gone = pane(win).locator('[data-wikilink="trashed"]')
  await expect(gone).toHaveText(/Нова назва/)
  await gone.focus()
  await expect(win.getByRole('tooltip')).toHaveText('У кошику')
})
