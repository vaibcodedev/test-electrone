import { test, expect, type Page } from '@playwright/test'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createRequire } from 'module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { launchVault, uid, type Vault } from './fixtures'

/**
 * «Тестовий режим»: a second profile in `${userData}-sandbox`. The relaunch itself is not driven here
 * (Playwright loses the process) — the app is started with and without `--vault-sandbox` instead, and the real
 * data's vault.db / config.json must stay byte for byte the same after a sandbox session.
 * Own launches, not the shared worker app: these tests open and close Vault several times.
 */
test.describe.configure({ mode: 'serial' })

// Made in beforeAll: the spec file is also loaded by the runner's main process, a top-level mkdtemp leaked a folder.
let userData = ''
let sandboxDir = ''
/** The real electron.exe: Playwright starts Electron through cmd.exe on Windows, so app.process() is the shell. */
const electronExe = createRequire(resolve('package.json'))('electron') as string
const sha = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex')
const mainFiles = (): Record<string, string> => ({
  db: sha(join(userData, 'data', 'vault.db')),
  config: sha(join(userData, 'config.json'))
})
const norm = (p: string): string => resolve(p).toLowerCase()
const profileOf = (win: Page): Promise<string> =>
  win.evaluate(() => (window as unknown as { vault: { profile: string } }).vault.profile)

let hashes: Record<string, string>
const testIdea = `Тестова ідея ${uid()}`
const mainIdea = `Основна ідея ${uid()}`

test.beforeAll(() => {
  userData = mkdtempSync(join(tmpdir(), 'vault-e2e-sbx-'))
  sandboxDir = `${resolve(userData)}-sandbox`
})
test.afterAll(() => {
  rmSync(userData, { recursive: true, force: true, maxRetries: 3 })
  rmSync(sandboxDir, { recursive: true, force: true, maxRetries: 3 })
})

/** A free hotkey and port: the installed Vault may hold the defaults. Copied into the sandbox config. */
async function isolate(v: Vault): Promise<void> {
  for (const key of ['F12', 'F11', 'F10', 'F9']) {
    const r = await v.rpcRaw('settings.update', {
      capturePort: 47300 + Math.floor(Math.random() * 500),
      quickAddShortcut: `CommandOrControl+Alt+Shift+${key}`
    })
    if (r.ok) break
  }
}

/** Opens a confirm from `trigger`, checks focus on «Скасувати» and closes it without relaunching. */
async function confirmAndCancel(win: Page, trigger: () => Promise<void>, title: string): Promise<void> {
  await trigger()
  const dialog = win.getByRole('alertdialog', { name: title })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Скасувати' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Скасувати' }).click()
  await expect(dialog).toBeHidden()
}

test('основний профіль: запис і відбиток основних даних', async () => {
  const v = await launchVault({ userData })
  await isolate(v)
  expect(await profileOf(v.win)).toBe('main')
  await v.rpc('ideas.create', { title: mainIdea })
  await v.app.close()
  hashes = mainFiles()
})

test('тестовий режим: окремі дані, позначки, демо-дані', async () => {
  const v = await launchVault({ userData, args: ['--vault-sandbox'] })
  const { win, app, rpc, rpcRaw } = v
  try {
    expect(await profileOf(win)).toBe('sandbox')
    await expect(win.locator('html')).toHaveAttribute('data-profile', 'sandbox')
    expect(await win.title()).toBe('Vault — тестовий режим')
    const badge = win.locator('[data-sandbox-badge]', { hasText: 'Тестовий режим' })
    await expect(badge).toBeVisible()
    await expect(win.getByText('Ваші дані закриті й не змінюються')).toBeVisible()

    const paths = await app.evaluate(({ app: a }) => ({
      userData: a.getPath('userData'),
      sessionData: a.getPath('sessionData')
    }))
    expect(norm(paths.userData)).toBe(norm(sandboxDir))
    expect(norm(paths.sessionData)).toBe(norm(sandboxDir))
    expect(existsSync(join(sandboxDir, 'vault-sandbox.json'))).toBe(true)
    await expect.poll(() => existsSync(join(sandboxDir, 'logs', 'main.log'))).toBe(true)

    const ideas = (await rpc('ideas.list', {})) as { title: string }[]
    expect(ideas.some((i) => i.title === mainIdea)).toBe(false)
    await rpc('ideas.create', { title: testIdea })

    const { created } = await rpc('sandbox.fillDemo')
    expect(created).toBeGreaterThan(0)
    const again = await rpcRaw('sandbox.fillDemo')
    expect(again.ok).toBe(false)
    expect(again.error).toMatch(/Демо-дані вже додано/)

    // Both «Вийти» confirms open and close without a relaunch.
    await confirmAndCancel(
      win,
      () => win.getByRole('button', { name: 'Вийти…' }).click(),
      'Вийти з тестового режиму?'
    )
    await v.go('/settings#sandbox')
    const section = win.locator('#sandbox')
    await expect(section.getByText('Демо-дані вже додано')).toBeVisible()
    await confirmAndCancel(
      win,
      () => section.getByRole('button', { name: 'Вийти з тестового режиму' }).click(),
      'Вийти з тестового режиму?'
    )
    await expect(win.getByRole('switch', { name: 'Запускати разом із Windows' })).toBeDisabled()

    // A normal start while the sandbox runs: it ends at once, the sandbox says which data is open.
    const second = spawn(electronExe, [resolve('.'), `--user-data-dir=${userData}`], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'ignore'
    })
    const code = await new Promise<number | null>((done, fail) => {
      const t = setTimeout(() => fail(new Error('second instance did not exit')), 15_000)
      second.on('exit', (c) => {
        clearTimeout(t)
        done(c)
      })
    })
    expect(code).not.toBeNull()
    await expect(
      win.locator('[data-sonner-toast]').filter({ hasText: 'Vault зараз у тестовому режимі' })
    ).toBeVisible()
  } finally {
    await app.close()
  }
  // The real data has not been opened for writing.
  expect(mainFiles()).toEqual(hashes)
})

test('знову основний: тестових записів немає, розділ показує папку, очищення', async () => {
  const v = await launchVault({ userData })
  const { win, rpc, rpcRaw } = v
  try {
    expect(await profileOf(win)).toBe('main')
    expect(await win.locator('html').getAttribute('data-profile')).toBeNull()
    await expect(win.locator('[data-sandbox-badge]', { hasText: 'Тестовий режим' })).toHaveCount(0)
    const ideas = (await rpc('ideas.list', {})) as { title: string }[]
    expect(ideas.some((i) => i.title === testIdea)).toBe(false)
    expect(ideas.some((i) => i.title === mainIdea)).toBe(true)

    // Ctrl+K → «тест» → the action opens the section.
    await win.keyboard.press('Control+k')
    const palette = win.getByRole('dialog')
    await palette.getByRole('combobox').fill('тест')
    await palette.getByRole('option', { name: 'Тестовий режим' }).click()
    await expect.poll(() => win.evaluate(() => location.hash)).toMatch(/settings#sandbox$/)
    const section = win.locator('#sandbox')
    await expect(section).toBeInViewport()
    await expect(section.getByText(/ · \d/)).toBeVisible()

    await confirmAndCancel(
      win,
      () => section.getByRole('button', { name: 'Перейти в тестовий режим' }).click(),
      'Перейти в тестовий режим?'
    )

    const clear = section.getByRole('button', { name: 'Очистити тестові дані' })
    await clear.click()
    const dialog = win.getByRole('alertdialog', { name: 'Очистити тестові дані?' })
    await dialog.getByRole('button', { name: 'Очистити' }).click()
    await expect(win.locator('[data-sonner-toast]').filter({ hasText: 'Тестові дані очищено' })).toBeVisible()
    expect(existsSync(sandboxDir)).toBe(false)
    await expect(clear).toBeDisabled()
    await expect(section.getByText('Ще не створено')).toBeVisible()

    // A folder of the same name not made by the sandbox is never removed.
    mkdirSync(join(sandboxDir, 'keep'), { recursive: true })
    const r = await rpcRaw('sandbox.clear')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Цю папку створив не тестовий режим Vault/)
    expect(existsSync(join(sandboxDir, 'keep'))).toBe(true)
  } finally {
    await v.app.close()
  }
})
