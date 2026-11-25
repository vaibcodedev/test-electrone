import { createServer } from 'net'
import { test, expect } from './fixtures'

/**
 * The Vault side of «Під’єднати до Vault»: the extension's requests are sent from here (Node sets the Origin a
 * browser extension would have), the answer is clicked in the real window.
 */
const ORIGIN = 'chrome-extension://ighcmeieigdefhjpidfbcainaoopopbk'

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number }
      srv.close(() => resolve(port))
    })
  })

test.describe('extension pairing', () => {
  let port = 0
  let defaultPort = 0

  test.beforeEach(async ({ vault }) => {
    defaultPort = (await vault.rpc('settings.get')).capturePort
    port = await freePort()
    // Its own port: an installed Vault may already listen on the default one.
    await vault.rpc('settings.update', { captureEnabled: true, capturePort: port })
    await expect.poll(async () => (await vault.rpc('capture.info')).running).toBe(true)
  })
  test.afterEach(async ({ vault }) => {
    await vault.rpc('settings.update', { capturePort: defaultPort })
  })

  const ask = async (path: string, origin = ORIGIN): Promise<Record<string, unknown>> => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { Origin: origin }
    })
    return { status: res.status, ...((await res.json()) as Record<string, unknown>) }
  }

  test('gives the key only after «Дозволити» and lists the extension', async ({ vault }) => {
    const { win } = vault
    // A web page cannot even ask.
    expect((await ask('/pair', 'https://evil.example')).status).toBe(403)
    const opened = await ask('/pair')
    expect(opened).toMatchObject({ status: 200, ok: true })
    const id = opened.id as string

    const dialog = win.getByRole('alertdialog', { name: 'Дозволити розширенню доступ до Vault?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Розширення Vault', { exact: true })).toBeVisible()
    await expect(dialog.getByText(ORIGIN)).toBeVisible()
    // The safe default: a stray Enter refuses; «Дозволити» wakes up a moment later.
    await expect(dialog.getByRole('button', { name: 'Відхилити' })).toBeFocused()
    const allow = dialog.getByRole('button', { name: 'Дозволити' })
    await expect(allow).toBeDisabled()
    expect(await ask(`/pair/${id}`)).toMatchObject({ state: 'waiting' })

    await expect(allow).toBeEnabled()
    await allow.click()
    await expect(dialog).toBeHidden()
    const { token, clients } = await vault.rpc('capture.info')
    expect(await ask(`/pair/${id}`)).toEqual({
      status: 200,
      ok: true,
      state: 'approved',
      key: token
    })
    // Handed out once.
    expect(await ask(`/pair/${id}`)).toMatchObject({ state: 'expired' })
    expect(clients).toEqual([expect.objectContaining({ origin: ORIGIN, vault: true })])

    await vault.go('/settings')
    await expect(win.getByText('Розширення Vault · …', { exact: false })).toBeVisible()
  })

  test('Esc refuses, and «Відключити» changes the key', async ({ vault }) => {
    const { win } = vault
    const before = (await vault.rpc('capture.info')).token
    const id = (await ask('/pair')).id as string
    const dialog = win.getByRole('alertdialog', { name: 'Дозволити розширенню доступ до Vault?' })
    await expect(dialog).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(await ask(`/pair/${id}`)).toMatchObject({ state: 'denied' })
    expect(JSON.stringify(await ask(`/pair/${id}`))).not.toContain(before)

    await vault.go('/settings')
    const disconnect = win.getByRole('button', { name: 'Відключити', exact: true })
    if (await disconnect.count()) {
      await disconnect.click()
      await win.getByRole('alertdialog').getByRole('button', { name: 'Відключити' }).click()
      await expect.poll(async () => (await vault.rpc('capture.info')).token).not.toBe(before)
      expect((await vault.rpc('capture.info')).clients).toEqual([])
    }
  })
})
