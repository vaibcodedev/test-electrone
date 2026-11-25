import type { Locator, Page } from '@playwright/test'
import { expect, test, uid, type Rpc } from './fixtures'

/**
 * Practice flows, round 2 (docs/quality-pass.md §6): a checklist template → run → ticks → «Готово X з Y» → all
 * done → reset; an English word → review session → its stage changes. Driven through the UI; RPC only checks.
 */

const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
const mode = (win: Page): Locator => win.locator('[data-detail-mode]').first()

/** Answers every word due today except `keep` («Згадали»), so a session holds only the test's words. */
async function answerDueExcept(rpc: Rpc, keep: string[]): Promise<void> {
  const due: { id: string }[] = await rpc('english.queue', 500)
  for (const w of due) if (!keep.includes(w.id)) await rpc('english.review', { id: w.id, grade: 2 })
}

/**
 * Lets the renderer catch up after an answer: main broadcasts `data:changed` before it replies, so by the time
 * two RPC round trips return, the queries it invalidated have been refetched; one frame renders them.
 */
async function settle(win: Page, rpc: Rpc): Promise<void> {
  await rpc('english.stats')
  await rpc('english.stats')
  await win.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
}

test.describe('чек-лист: шаблон → прогін', () => {
  test('«Шаблон» → пункти → «Запустити прогін» → галочки → «Готово 3 з 3» → «Скинути»', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const token = `cl${uid()}`
    const title = `Деплой ${token}`
    const steps = ['Зібрати реліз', 'Прогнати тести', 'Оновити гайд']

    // A new template opens in edit mode with the title selected.
    await go('/checklists')
    await win.locator('[data-slot="page-header"]').getByRole('button', { name: 'Шаблон' }).click()
    await expect.poll(() => hashPath(win)).toMatch(/^\/checklists\/.+/)
    const templateId = (await hashPath(win)).split('/').pop()!
    await expect(mode(win)).toHaveAttribute('data-detail-mode', 'edit')
    const name = win.getByRole('textbox', { name: 'Назва', exact: true })
    await expect(name).toBeFocused()
    await name.fill(title)

    // An empty template cannot be launched yet.
    await expect(win.getByRole('button', { name: 'Запустити прогін' })).toBeDisabled()
    const add = win.getByRole('textbox', { name: 'Додати пункт', exact: true })
    for (const s of steps) {
      await add.fill(s)
      await add.press('Enter')
      await expect(win.getByRole('listitem').filter({ hasText: s })).toBeVisible()
      await expect(add).toHaveValue('')
    }
    await win.locator('[data-save]').click()
    await expect(mode(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect(win.getByRole('heading', { name: title })).toBeVisible()
    await expect
      .poll(async () =>
        (await rpc('checklists.get', templateId)).items.map((i: { text: string }) => i.text)
      )
      .toEqual(steps)

    // Launch: the run gets a dated name, the template stays a template.
    await win.getByRole('button', { name: 'Запустити прогін' }).click()
    const launch = win.getByRole('dialog', { name: 'Запустити прогін' })
    await expect(launch.getByRole('textbox', { name: 'Назва прогону' })).toHaveValue(
      new RegExp(`^${title} — `)
    )
    await launch.getByRole('button', { name: 'Запустити', exact: true }).click()
    await expect(win.getByText('Прогін створено').first()).toBeVisible()
    await expect.poll(() => hashPath(win)).not.toBe(`/checklists/${templateId}`)
    const runId = (await hashPath(win)).split('/').pop()!
    await expect(win.getByText('Прогін', { exact: true }).first()).toBeVisible()
    await expect(win.getByText(/^Готово 0 з 3/)).toBeVisible()

    // Ticks work while reading — a run is for ticking, not for editing.
    await expect(mode(win)).toHaveAttribute('data-detail-mode', 'view')
    await win.getByRole('checkbox', { name: steps[0] }).click()
    await expect(win.getByText(/^Готово 1 з 3/)).toBeVisible()
    await expect(win.getByRole('checkbox', { name: steps[0] })).toBeChecked()
    // The template is untouched by the run's ticks.
    expect(
      (await rpc('checklists.get', templateId)).items.some((i: { done: boolean }) => i.done)
    ).toBe(false)

    await win.getByRole('checkbox', { name: steps[1] }).click()
    await win.getByRole('checkbox', { name: steps[2] }).click()
    await expect(win.getByText(/^Готово 3 з 3/)).toBeVisible()
    await expect
      .poll(async () =>
        (await rpc('checklists.get', runId)).items.every((i: { done: boolean }) => i.done)
      )
      .toBe(true)

    // The runs list shows it as finished.
    await win.getByRole('link', { name: 'Прогони' }).click()
    await expect.poll(() => hashPath(win)).toBe('/checklists')
    await win.locator('[data-page-search]').fill(token)
    const card = win
      .getByRole('button')
      .filter({ hasText: title })
      .filter({ hasText: 'Готово 3 з 3' })
    await expect(card).toBeVisible()
    await expect(card.getByText('Готово', { exact: true })).toBeVisible()

    // «Скинути» asks, then clears every tick.
    await card.click()
    await expect.poll(() => hashPath(win)).toBe(`/checklists/${runId}`)
    await win.getByRole('button', { name: 'Скинути' }).click()
    const ask = win.getByRole('alertdialog', { name: 'Зняти всі позначки?' })
    await ask.getByRole('button', { name: 'Скинути' }).click()
    await expect(win.getByText(/^Готово 0 з 3/)).toBeVisible()
    await expect(win.getByRole('checkbox', { name: steps[0] })).not.toBeChecked()

    // From the run back to its template.
    await win.getByRole('link', { name: 'Відкрити вихідний шаблон' }).click()
    await expect.poll(() => hashPath(win)).toBe(`/checklists/${templateId}`)
    await expect(win.getByRole('heading', { name: title })).toBeVisible()
  })

  test('«Запустити» на картці шаблону відкриває той самий діалог', async ({ vault }) => {
    const { win, rpc, go } = vault
    const token = `cl${uid()}`
    const tpl = await rpc('checklists.create', { title: `SEO ${token}`, kind: 'template' })
    await rpc('checklists.addItem', { checklistId: tpl.id, text: 'Мета-теги', section: '' })
    await go('/checklists')
    await win.locator('[data-page-search]').fill(token)
    const card = win
      .getByRole('button')
      .filter({ hasText: `SEO ${token}` })
      .first()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'Запустити' }).click()
    const launch = win.getByRole('dialog', { name: 'Запустити прогін' })
    await expect(launch).toBeVisible()
    // Opening the dialog from the card must not also navigate into the template.
    expect(await hashPath(win)).toBe('/checklists')
    await launch.getByRole('button', { name: 'Скасувати' }).click()
    await expect(launch).toBeHidden()
    expect((await rpc('checklists.list', { kind: 'run', search: token })).length).toBe(0)
  })
})

test.describe('англійська: слово → тренування', () => {
  test('додати слово → «Повторити» → «Легко» → стадія «Вчу», повторення не сьогодні', async ({
    vault
  }) => {
    test.setTimeout(120_000)
    const { win, rpc, go } = vault
    const term = `rollout${uid()}`

    await go('/english')
    await win.getByRole('textbox', { name: 'Слово', exact: true }).fill(term)
    await win.getByRole('textbox', { name: 'Переклад', exact: true }).fill('викатка')
    await win.getByRole('textbox', { name: 'Переклад', exact: true }).press('Enter')
    await expect(win.getByText('Слово додано').first()).toBeVisible()
    await expect(win.getByRole('textbox', { name: 'Слово', exact: true })).toHaveValue('')
    await expect(win.getByRole('textbox', { name: 'Слово', exact: true })).toBeFocused()

    const [created] = (await rpc('english.list', { search: term })) as {
      id: string
      stage: string
    }[]
    expect(created.stage).toBe('new')
    const row = win.getByRole('button').filter({ hasText: term }).first()
    await expect(row).toContainText('Нове')
    // The page clock follows the list's own refetch, so a word added a moment ago is already due.
    await expect(row).toContainText('повторити сьогодні')

    // Only this word is due today (the seeded ones are answered via RPC), so the session is just it.
    await answerDueExcept(rpc, [created.id])
    await go('/english')
    await win.getByRole('button', { name: 'Повторити 1' }).click()
    await expect.poll(() => hashPath(win)).toBe('/english/review')
    // The dictionary stays on screen until the review chunk loads: wait for the card itself.
    await expect(win.getByRole('button', { name: 'Показати відповідь' })).toBeVisible()
    const card = win
      .locator('main [data-slot="card"]')
      .filter({ has: win.locator('.text-display') })
    await expect(card.locator('.text-display')).toHaveText(term)
    // The answer is hidden until Space.
    await expect(card.getByText('викатка', { exact: true })).toHaveCount(0)
    await win.keyboard.press(' ')
    await expect(card.getByText('викатка', { exact: true })).toBeVisible()
    await expect(win.getByText('Як ви згадали переклад?')).toBeVisible()
    await win.keyboard.press('4')
    await expect(win.getByText('Сесію завершено')).toBeVisible()

    await win.getByRole('button', { name: 'Повернутися до словника' }).click()
    await expect.poll(() => hashPath(win)).toBe('/english')
    const word = await rpc('english.get', created.id)
    expect(word.stage).toBe('learning')
    expect(word.dueAt).toBeGreaterThan(Date.now())

    await win.locator('[data-page-search]').fill(term)
    const after = win.getByRole('button').filter({ hasText: term }).first()
    await expect(after).toContainText('Вчу')
    await expect(after).toContainText('повторення ')
    await expect(after).not.toContainText('сьогодні')
  })

  // Regression: every answer is a write (english.review → data:changed → invalidateAll), so the `english.queue`
  // query refetches mid-session with only the words still due. Read live, the index counted over the shorter
  // list: «2/3» → «2/2», the second word was never shown, and the summary turned into «На сьогодні все».
  // The session now copies the queue once (use-review-session.ts).
  test('сесія показує кожне слово, що на сьогодні, рівно раз', async ({ vault }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const token = uid()
    const words = await Promise.all(
      ['alpha', 'bravo', 'charlie'].map((t) =>
        rpc('english.create', { term: `${t}${token}`, translation: t })
      )
    )
    await answerDueExcept(
      rpc,
      words.map((w) => w.id)
    )
    await go('/english')
    await win.getByRole('button', { name: 'Повторити 3' }).click()
    await expect.poll(() => hashPath(win)).toBe('/english/review')

    const shown: string[] = []
    for (let i = 0; i < 6; i++) {
      const reveal = win.getByRole('button', { name: 'Показати відповідь' })
      const done = win.getByText('Сесію завершено')
      await expect(reveal.or(done)).toBeVisible()
      if (await done.isVisible()) break
      shown.push(await win.locator('main .text-display').first().innerText())
      await win.keyboard.press(' ')
      await win.keyboard.press('3')
      await expect(win.getByText('Як ви згадали переклад?')).toBeHidden()
      await settle(win, rpc)
    }
    expect(shown.sort()).toEqual(words.map((w) => w.term).sort())
    await settle(win, rpc)
    // The summary stays: the refetched (now empty) queue used to swap it for «На сьогодні все».
    await expect(win.getByText('Сесію завершено')).toBeVisible()
    await expect(win.getByText('3 слова, відповідей: 3')).toBeVisible()
  })

  test('порожнє «Слово» не зберігається: помилка біля поля', async ({ vault }) => {
    const { win, rpc, go } = vault
    const before = (await rpc('english.stats')).total
    await go('/english')
    const translation = win.getByRole('textbox', { name: 'Переклад', exact: true })
    await translation.fill('без слова')
    // «Слово» is required: «Додати» is off, and Enter adds nothing but says what is missing.
    await expect(win.getByRole('button', { name: 'Додати', exact: true })).toBeDisabled()
    await translation.press('Enter')
    await expect(win.getByText('Введіть слово або фразу')).toBeVisible()
    await expect(win.getByRole('textbox', { name: 'Слово', exact: true })).toBeFocused()
    await expect(win.getByRole('textbox', { name: 'Слово', exact: true })).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect((await rpc('english.stats')).total).toBe(before)
  })
})
