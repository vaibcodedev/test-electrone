import type { ElectronApplication } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/** A record that failed to load says so where it would be, and «Повторити» brings it back. */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Makes one RPC method fail in main; the returned function puts the real handler back. */
async function breakRpc(app: ElectronApplication, method: string): Promise<() => Promise<void>> {
  await app.evaluate(({ ipcMain }, broken) => {
    const real = (ipcMain as any)._invokeHandlers.get('vault:rpc')
    ;(globalThis as any).__realRpc = real
    ipcMain.removeHandler('vault:rpc')
    ipcMain.handle('vault:rpc', (event, path, arg) =>
      path === broken ? { ok: false, error: 'Тестовий збій' } : real(event, path, arg)
    )
  }, method)
  return () =>
    app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('vault:rpc')
      ipcMain.handle('vault:rpc', (globalThis as any).__realRpc)
    })
}

test('панель запису, сторінка й шторка показують помилку на місці з «Повторити»', async ({
  vault
}) => {
  const { app, win, rpc, go, errors } = vault
  const tag = uid()
  const note = await rpc('notes.create', { title: `Нотатка ${tag}`, body: 'текст' })
  const client = await rpc('clients.create', { name: `Клієнт ${tag}` })
  const board = await rpc('boards.create', { title: `Дошка ${tag}` })
  const details = await rpc('boards.details', board.id)
  const card = await rpc('cards.create', {
    boardId: board.id,
    columnId: details.columns[0].id,
    title: `Картка ${tag}`
  })

  const cases = [
    { method: 'notes.get', route: `/notes?open=${note.id}`, title: 'Не вдалося відкрити запис', then: `Нотатка ${tag}` },
    { method: 'clients.details', route: `/clients/${client.id}`, title: 'Не вдалося завантажити клієнта', then: `Клієнт ${tag}` },
    { method: 'cards.get', route: `/boards/${board.id}?card=${card.id}`, title: 'Не вдалося відкрити запис', then: `Картка ${tag}` }
  ]
  for (const c of cases) {
    const restore = await breakRpc(app, c.method)
    try {
      await go(c.route)
      await expect(win.getByText(c.title)).toBeVisible()
      // Said in place: no «Не вдалося завантажити дані» toast on top of it, and no «не знайдено».
      await expect(win.getByText('Не вдалося завантажити дані')).toHaveCount(0)
      await expect(win.getByText(/не знайдено/)).toHaveCount(0)
    } finally {
      await restore()
    }
    await win.getByRole('button', { name: 'Повторити', exact: true }).click()
    await expect(win.getByText(c.title)).toHaveCount(0)
    await expect(win.getByText(c.then).first()).toBeVisible()
  }
  // The failed reads are reported on purpose.
  errors.splice(0, errors.length, ...errors.filter((e) => !e.includes('Тестовий збій')))
})
