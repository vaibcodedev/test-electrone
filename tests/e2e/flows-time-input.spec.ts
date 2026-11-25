import { test, expect, uid } from './fixtures'

test('card deadline: both digits of the hours and minutes are kept', async ({ vault }) => {
  const { win, rpc, go } = vault
  const board = await rpc('boards.create', { title: `Час ${uid()}` })
  const { columns } = await rpc('boards.details', board.id)
  const card = await rpc('cards.create', {
    boardId: board.id,
    columnId: columns[0].id,
    title: 'Картка з дедлайном'
  })
  const dueAt = new Date()
  dueAt.setHours(9, 0, 0, 0)
  await rpc('cards.update', { id: card.id, patch: { dueAt: dueAt.getTime() } })

  await go(`/boards/${board.id}?card=${card.id}`)
  const sheet = win.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Редагувати' }).click()
  await sheet.getByRole('button', { name: / о 09:00/ }).click()
  const time = win.locator('input[type="time"]')
  await time.focus()
  // A pause between keys: the card saves in between, as it does for a person typing.
  for (const key of '1745') {
    await win.keyboard.press(key)
    await win.waitForTimeout(300)
  }

  await expect(time).toHaveValue('17:45')
  await expect
    .poll(async () => {
      const d = new Date((await rpc('cards.get', card.id)).dueAt)
      return `${d.getHours()}:${d.getMinutes()}`
    })
    .toBe('17:45')
  await rpc('boards.remove', board.id)
})
