import { expect, test, uid } from './fixtures'

/** «Підсумки тижня» → «Створити картки» from the plan's «- [ ]» lines. */

test('plan lines become cards once, and the plan links to them', async ({ vault }) => {
  const { win, rpc, go } = vault
  const tag = uid()
  const board = await rpc('boards.create', { title: `План ${tag}` })
  await go('/review')
  const create = win.getByRole('button', { name: 'Створити картки', exact: true })
  const { weekStart } = await rpc('review.get', {})
  await rpc('review.saveNotes', {
    weekStart,
    plan: `- [ ] Перша ${tag}\n- [ ] Друга ${tag}\n- [ ] Третя ${tag}`
  })
  await create.click()
  const dialog = win.getByRole('dialog', { name: 'Картки з плану' })
  await expect(dialog.getByRole('checkbox')).toHaveCount(3)
  await dialog.getByRole('combobox', { name: 'Дошка' }).click()
  await win.getByRole('option', { name: `План ${tag}` }).click()
  await dialog.getByRole('checkbox', { name: `Третя ${tag}` }).click()
  await dialog.getByRole('button', { name: 'Створити 2 картки' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(win.getByText('Створено 2 картки')).toBeVisible()

  const { cards } = await rpc('boards.details', board.id)
  expect(cards.map((c: { title: string }) => c.title)).toEqual([`Перша ${tag}`, `Друга ${tag}`])
  const { plan } = await rpc('review.get', {})
  expect(plan).toContain(`[Перша ${tag}](vault:card/${cards[0].id})`)

  // Only the line left without a card is offered again.
  await create.click()
  await expect(dialog.getByRole('checkbox')).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
