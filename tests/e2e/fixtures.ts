import {
  test as base,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Rpc = <T = any>(path: string, arg?: unknown) => Promise<T>

export interface Vault {
  app: ElectronApplication
  win: Page
  /** Calls `window.vault.rpc`; throws with the server message when the call fails. */
  rpc: Rpc
  /** Same, but returns the raw `{ ok, data, error }` (for asserting rejections). */
  rpcRaw: (path: string, arg?: unknown) => Promise<{ ok: boolean; data?: any; error?: string }>
  /** Navigates the hash router and waits for the shell to settle. */
  go: (route: string) => Promise<void>
  /** Uncaught page errors and console.error messages since the last `errors.length = 0`. */
  errors: string[]
}

/** Console noise that is not an app error. */
const IGNORED = [/Electron Security Warning/i, /Download the React DevTools/i]

/**
 * Starts the built app on its own user-data dir and waits for the bridge. `args` go after it (e.g.
 * `--vault-sandbox`). The window is shown at 1440×900.
 */
export async function launchVault(opts: { userData: string; args?: string[] }): Promise<Vault> {
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${opts.userData}`, ...(opts.args ?? [])],
    env: { ...process.env, NODE_ENV: 'production' }
  })
  const win = await app.firstWindow()
  const errors: string[] = []
  win.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text())))
      errors.push(`console.error: ${m.text()}`)
  })
  win.on('pageerror', (e) => errors.push(`pageerror: ${e.stack || e.message}`))
  await app.evaluate(({ BrowserWindow }) => {
    const w =
      BrowserWindow.getAllWindows().find((x) => x.isVisible()) ?? BrowserWindow.getAllWindows()[0]
    w.setSize(1440, 900)
    w.show()
  })
  await win.waitForLoadState('domcontentloaded')
  await win.waitForFunction(() => typeof (window as any).vault?.rpc === 'function')

  const rpcRaw: Vault['rpcRaw'] = (path, arg) =>
    win.evaluate(([p, a]) => (window as any).vault.rpc(p, a), [path, arg] as const)
  const rpc: Rpc = async (path, arg) => {
    const r = await rpcRaw(path, arg)
    if (!r.ok) throw new Error(`${path}: ${r.error}`)
    return r.data
  }
  const go = async (route: string): Promise<void> => {
    await win.evaluate((r) => (window.location.hash = '#' + r), route)
    await win.waitForLoadState('domcontentloaded')
    // Route chunks are lazy: wait until the skeleton is replaced by the page.
    await win.waitForTimeout(300)
  }
  return { app, win, rpc, rpcRaw, go, errors }
}

export const test = base.extend<{ vault: Vault; noErrors: void }, { vaultWorker: Vault }>({
  vaultWorker: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      const userData = mkdtempSync(join(tmpdir(), 'vault-e2e-'))
      const vault = await launchVault({ userData })
      const { app, rpcRaw, errors } = vault

      const { seed } = await import('../../scripts/seed.mjs')
      await seed(rpcRaw) // seed.mjs expects the raw { ok, data, error }
      errors.length = 0

      await provide(vault)

      await app.close().catch(() => undefined)
      rmSync(userData, { recursive: true, force: true, maxRetries: 3 })
    },
    { scope: 'worker', timeout: 120_000 }
  ],

  vault: async ({ vaultWorker }, provide) => {
    vaultWorker.errors.length = 0
    // Start every test from the dashboard with no dialogs open.
    const { win } = vaultWorker
    // A closing Radix dialog keeps aria-hidden on the rest of the page, and getByRole doesn't see the
    // sidebar button through it: wait until no dialog is left (a nested one needs a second Escape).
    const dialogs = win.locator('[role="dialog"], [role="alertdialog"]')
    // A record left in «Редагувати» with changes answers Esc with «Зберегти зміни?»: drop the changes, or the
    // question stays over the next test's page and blocks its clicks.
    const ask = win.getByRole('alertdialog', { name: 'Зберегти зміни?' })
    // A short timeout: a question still fading out after the last test clicked it has no button to press any more,
    // and waiting the default 30 s for it only slowed the next test down.
    const discard = async (): Promise<void> => {
      if ((await ask.count()) > 0)
        await ask
          .getByRole('button', { name: 'Не зберігати' })
          .click({ timeout: 2_000 })
          .catch(() => undefined)
    }
    for (let i = 0; i < 4 && (await dialogs.count()) > 0; i++) {
      await discard()
      if ((await dialogs.count()) === 0) break
      await win.keyboard.press('Escape').catch(() => undefined)
      await expect(dialogs)
        .toHaveCount(0, { timeout: 2_000 })
        .catch(() => undefined)
    }
    await win.keyboard.press('Escape').catch(() => undefined)
    await discard()
    // One window for the whole run: a test that folded the sidebar or hid sections must not change the next one.
    // The fold state is read from the sidebar's data-state, not from a button's accessible name.
    const folded = win.locator('[data-slot="app-sidebar"][data-state="collapsed"]')
    if ((await folded.count()) > 0) {
      await win
        .getByRole('button', { name: 'Розгорнути бічну панель', exact: true })
        .first()
        .click()
      await expect(folded).toHaveCount(0)
    }
    const s = await vaultWorker.rpc('settings.get')
    if (s.hiddenNavHubs?.length || s.hiddenNavItems?.length)
      await vaultWorker.rpc('settings.update', { hiddenNavHubs: [], hiddenNavItems: [] })
    await vaultWorker.go('/')
    await provide(vaultWorker)
  },

  /** Every test fails on an uncaught page error or console.error in the renderer. */
  noErrors: [
    async ({ vault }, provide) => {
      await provide()
      expect(vault.errors, 'renderer errors during the test').toEqual([])
    },
    { auto: true }
  ]
})

export { expect }

export const DAY = 86_400_000
export const uid = (): string => Math.random().toString(36).slice(2, 8)
