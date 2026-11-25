/** «Тестовий режим» switching: guards, the order before a relaunch, and that a relaunch always happens once. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const { SandboxService } = await import('@main/system/sandbox-service')
const { SANDBOX_ARG, SANDBOX_MARKER, SANDBOX_RESET_ARG, resolveProfile } = await import(
  '@main/core/profile'
)
const { UserError } = await import('@main/core/util')

let root: string
let main: string
beforeEach(() => {
  vi.useFakeTimers()
  root = mkdtempSync(join(tmpdir(), 'vault-sbx-'))
  main = join(root, 'Vault')
  mkdirSync(main)
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test factory, inferred shape
function make(kind: 'main' | 'sandbox', over: { isPackaged?: boolean; busy?: boolean } = {}) {
  const calls: string[] = []
  const state = { busy: over.busy ?? false, seeded: new Set<string>(), running: 0 }
  const toasts: unknown[] = []
  const relaunch = vi.fn((args: string[]) => calls.push(`relaunch ${args.join(' ')}`))
  const dispose = vi.fn(() => calls.push('dispose'))
  const svc = new SandboxService({
    profile: resolveProfile(kind === 'sandbox' ? ['e', SANDBOX_ARG] : ['e'], main),
    ledger: {
      isSeeded: (k) => state.seeded.has(k),
      markSeeded: (k) => void state.seeded.add(k)
    },
    backup: { isBusy: () => state.busy },
    scripts: { runningCount: () => state.running },
    updater: { holdInstall: () => void calls.push('holdInstall') },
    bus: { emit: (_e: string, p: unknown) => void toasts.push(p) } as never,
    dispose,
    demo: { fill: async () => ({ created: 3 }) },
    relaunch,
    isPackaged: over.isPackaged ?? true,
    argv: ['Vault.exe', '--hidden']
  })
  return { svc, calls, state, toasts, relaunch, dispose }
}

describe('guards', () => {
  it('enter лише з основного, exit лише з тестового', () => {
    expect(() => make('sandbox').svc.enter()).toThrow('Тестовий режим уже ввімкнено')
    expect(() => make('main').svc.exit()).toThrow('Тестовий режим не ввімкнено')
  })
  it('під npm run dev перезапуску немає', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    try {
      expect(() => make('main', { isPackaged: false }).svc.enter()).toThrow('npm run dev -- -- --vault-sandbox')
      expect(() => make('sandbox', { isPackaged: false }).svc.exit()).toThrow(/npm run dev$/)
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it('під час бекапу — зачекати', () => {
    expect(() => make('main', { busy: true }).svc.enter()).toThrow(/бекап або відновлення/)
  })
})

describe('перезапуск', () => {
  it('enter: holdInstall → dispose → relaunch з прапорцем, один раз', () => {
    const { svc, calls, relaunch } = make('main')
    svc.enter()
    expect(relaunch).not.toHaveBeenCalled()
    expect(() => svc.enter()).toThrow('Vault уже перезапускається')
    vi.advanceTimersByTime(100)
    expect(calls).toEqual(['holdInstall', 'dispose', `relaunch ${SANDBOX_ARG}`])
    expect(relaunch).toHaveBeenCalledTimes(1)
  })
  it('exit з тестового не чіпає апдейтер', () => {
    const { svc, calls } = make('sandbox')
    svc.exit()
    vi.advanceTimersByTime(100)
    expect(calls).toEqual(['dispose', 'relaunch '])
  })
  it('бекап почався до таймера — без перезапуску, тост, можна ще раз', () => {
    const { svc, state, toasts, relaunch } = make('main')
    svc.enter()
    state.busy = true
    vi.advanceTimersByTime(100)
    expect(relaunch).not.toHaveBeenCalled()
    expect(toasts).toEqual([{ kind: 'error', message: expect.stringMatching(/бекап/) }])
    state.busy = false
    svc.enter()
    vi.advanceTimersByTime(100)
    expect(relaunch).toHaveBeenCalledTimes(1)
  })
  it('dispose упав — перезапуск усе одно', () => {
    const { svc, dispose, relaunch } = make('sandbox')
    dispose.mockImplementation(() => {
      throw new Error('EPERM')
    })
    svc.exit()
    vi.advanceTimersByTime(100)
    expect(relaunch).toHaveBeenCalledTimes(1)
  })
})

describe('clear', () => {
  it('в основному видаляє папку з маркером одразу, без перезапуску', () => {
    const { svc, relaunch } = make('main')
    const dir = `${main}-sandbox`
    mkdirSync(dir)
    expect(() => svc.clear()).toThrow(UserError)
    writeFileSync(join(dir, SANDBOX_MARKER), JSON.stringify({ format: 'vault-sandbox', mainUserData: main }))
    svc.clear()
    expect(existsSync(dir)).toBe(false)
    vi.advanceTimersByTime(100)
    expect(relaunch).not.toHaveBeenCalled()
  })
  it('у тестовому — перезапуск із reset', () => {
    const { svc, relaunch } = make('sandbox')
    svc.clear()
    vi.advanceTimersByTime(100)
    expect(relaunch).toHaveBeenCalledWith([SANDBOX_ARG, SANDBOX_RESET_ARG])
  })
})

describe('info', () => {
  it('основний: розмір папки, без шляху бекапів', async () => {
    const { svc, state } = make('main')
    state.running = 2
    expect(await svc.info()).toMatchObject({ profile: 'main', exists: false, sizeBytes: 0, runningScripts: 2 })
    mkdirSync(`${main}-sandbox`)
    writeFileSync(join(`${main}-sandbox`, 'a'), '12345')
    expect(await svc.info()).toMatchObject({
      exists: true,
      sizeBytes: 5,
      canSwitch: true,
      demoFilled: false,
      mainBackupsDir: null
    })
  })
  it('розмір кешується: повторні запити не обходять папку, доки не мине TTL або не очистять', async () => {
    const { svc } = make('main')
    const dir = `${main}-sandbox`
    const marker = JSON.stringify({ format: 'vault-sandbox', mainUserData: main })
    mkdirSync(dir)
    writeFileSync(join(dir, SANDBOX_MARKER), marker)
    writeFileSync(join(dir, 'a'), '12345')
    const base = Buffer.byteLength(marker)
    expect((await svc.info()).sizeBytes).toBe(base + 5)
    // Rewriting a file keeps the folder's mtime: the cached size answers.
    writeFileSync(join(dir, 'a'), '1234567890')
    expect((await svc.info()).sizeBytes).toBe(base + 5)
    vi.advanceTimersByTime(61_000)
    expect((await svc.info()).sizeBytes).toBe(base + 10)
    svc.clear()
    expect((await svc.info()).sizeBytes).toBe(0)
    mkdirSync(dir)
    writeFileSync(join(dir, 'b'), '12')
    expect((await svc.info()).sizeBytes).toBe(2)
  })
  it('тестовий: без розміру, з демо-позначкою й шляхом основних бекапів', async () => {
    const { svc, state } = make('sandbox')
    state.seeded.add('demo')
    expect(await svc.info()).toMatchObject({
      profile: 'sandbox',
      sizeBytes: null,
      demoFilled: true,
      mainBackupsDir: join(main, 'data', 'backups')
    })
  })
})
