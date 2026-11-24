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

export const test = base.extend<{ vault: Vault; noErrors: void }, { vaultWorker: Vault }>({
  vaultWorker: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      const userData = mkdtempSync(join(tmpdir(), 'vault-e2e-'))
      const app = await electron.launch({
        args: [resolve('.'), `--user-data-dir=${userData}`],
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
          BrowserWindow.getAllWindows().find((x) => x.isVisible()) ??
          BrowserWindow.getAllWindows()[0]
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

      const { seed } = await import('../../scripts/seed.mjs')
      await seed(rpcRaw) // seed.mjs expects the raw { ok, data, error }
      errors.length = 0

      await provide({ app, win, rpc, rpcRaw, go, errors })

      await app.close().catch(() => undefined)
      rmSync(userData, { recursive: true, force: true, maxRetries: 3 })
    },
    { scope: 'worker', timeout: 120_000 }
  ],

  vault: async ({ vaultWorker }, provide) => {
    vaultWorker.errors.length = 0
    // Start every test from the dashboard with no dialogs open.
    await vaultWorker.win.keyboard.press('Escape').catch(() => undefined)
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
