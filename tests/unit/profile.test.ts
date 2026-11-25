/**
 * «Тестовий режим» guards: the test folder is only ever `<main>-sandbox`, the main config is only read, and a
 * folder without its own marker is never removed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const {
  SANDBOX_ARG,
  SANDBOX_MARKER,
  SANDBOX_RESET_ARG,
  assertSandboxDir,
  canRelaunch,
  dirSize,
  hasOwnMarker,
  isInside,
  relaunchArgs,
  removeSandbox,
  resolveProfile,
  samePath,
  sandboxDirOf,
  seedSandboxConfig,
  wipeSandboxData,
  writeMarker
} = await import('@main/core/profile')
const { UserError } = await import('@main/core/util')

const sha = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex')

let root: string
let main: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vault-profile-'))
  main = join(root, 'Vault')
  mkdirSync(main)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('resolveProfile', () => {
  it('без прапорця — основний профіль', () => {
    const p = resolveProfile(['electron', '.'], main)
    expect(p.kind).toBe('main')
    expect(p.reset).toBe(false)
    expect(p.sandboxUserData).toBe(`${main}-sandbox`)
  })
  it('з --vault-sandbox — тестовий, reset лише з другим прапорцем', () => {
    expect(resolveProfile(['e', SANDBOX_ARG], main)).toMatchObject({ kind: 'sandbox', reset: false })
    expect(resolveProfile(['e', SANDBOX_ARG, SANDBOX_RESET_ARG], main).reset).toBe(true)
    // reset without the sandbox flag means nothing
    expect(resolveProfile(['e', SANDBOX_RESET_ARG], main)).toMatchObject({ kind: 'main', reset: false })
  })
})

describe('relaunchArgs', () => {
  const argv = ['electron.exe', 'app', '--user-data-dir=C:/tmp/x', '--hidden', SANDBOX_ARG, SANDBOX_RESET_ARG]
  it('у тестовий: без --hidden і старих прапорців, --user-data-dir лишається', () => {
    expect(relaunchArgs(argv, 'sandbox')).toEqual(['app', '--user-data-dir=C:/tmp/x', SANDBOX_ARG])
    expect(relaunchArgs(argv, 'sandbox', { reset: true })).toEqual([
      'app',
      '--user-data-dir=C:/tmp/x',
      SANDBOX_ARG,
      SANDBOX_RESET_ARG
    ])
  })
  it('в основний — без прапорців профілю', () => {
    expect(relaunchArgs(argv, 'main')).toEqual(['app', '--user-data-dir=C:/tmp/x'])
  })
})

describe('шляхи', () => {
  it('samePath / isInside', () => {
    expect(samePath(main, join(main, '.'))).toBe(true)
    if (process.platform === 'win32') expect(samePath(main, main.toUpperCase())).toBe(true)
    expect(isInside(main, join(main, 'data'))).toBe(true)
    expect(isInside(main, main)).toBe(true)
    expect(isInside(join(main, 'data'), main)).toBe(false)
    expect(isInside(main, `${main}-sandbox`)).toBe(false)
  })
  it('assertSandboxDir пропускає лише <main>-sandbox', () => {
    const p = resolveProfile(['e', SANDBOX_ARG], main)
    expect(() => assertSandboxDir(p, sandboxDirOf(main))).not.toThrow()
    expect(() => assertSandboxDir(p, main)).toThrow()
    expect(() => assertSandboxDir(p, join(main, 'x-sandbox'))).toThrow()
    expect(() => assertSandboxDir(p, join(root, 'Other-sandbox'))).toThrow()
    // A profile whose main folder is the parent of the sandbox (nested both ways) is refused.
    expect(() => assertSandboxDir({ ...p, mainUserData: root }, join(root, 'Vault-sandbox'))).toThrow()
  })
  it('canRelaunch: не під npm run dev', () => {
    expect(canRelaunch(true, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe(true)
    expect(canRelaunch(false, {})).toBe(true)
    expect(canRelaunch(false, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe(false)
  })
})

describe('seedSandboxConfig', () => {
  const mainConfig = {
    settings: {
      userName: 'Олена',
      theme: 'dark',
      launchAtLogin: true,
      startHidden: true,
      autoUpdate: true,
      autoBackup: true,
      captureEnabled: true,
      backupKeep: 7,
      capturePort: 47555
    },
    window: { x: 10, y: 20, width: 1200, height: 800, maximized: false },
    secrets: { github: 'enc' },
    seeded: ['checklists'],
    lastBackupAt: 123
  }

  it('копіює лише білий список і вікно, вимикає фонове, без секретів', () => {
    const p = resolveProfile(['e', SANDBOX_ARG], main)
    const mainFile = join(main, 'config.json')
    writeFileSync(mainFile, JSON.stringify(mainConfig))
    const before = sha(mainFile)
    mkdirSync(p.sandboxUserData)
    seedSandboxConfig(p)
    const out = JSON.parse(readFileSync(join(p.sandboxUserData, 'config.json'), 'utf8'))
    expect(out.settings).toEqual({
      userName: 'Олена',
      theme: 'dark',
      backupKeep: 7,
      capturePort: 47555,
      launchAtLogin: false,
      startHidden: false,
      autoUpdate: false,
      autoBackup: false,
      captureEnabled: false
    })
    expect(out.window).toEqual(mainConfig.window)
    expect(out.secrets).toBeUndefined()
    expect(out.seeded).toBeUndefined()
    expect(out.lastBackupAt).toBeUndefined()
    expect(sha(mainFile)).toBe(before)
  })

  it('не перезаписує наявний config тестового профілю', () => {
    const p = resolveProfile(['e', SANDBOX_ARG], main)
    writeFileSync(join(main, 'config.json'), JSON.stringify(mainConfig))
    mkdirSync(p.sandboxUserData)
    writeFileSync(join(p.sandboxUserData, 'config.json'), '{"settings":{"userName":"Тест"}}')
    seedSandboxConfig(p)
    expect(readFileSync(join(p.sandboxUserData, 'config.json'), 'utf8')).toBe(
      '{"settings":{"userName":"Тест"}}'
    )
  })

  it('битий основний config — типові значення', () => {
    const p = resolveProfile(['e', SANDBOX_ARG], main)
    writeFileSync(join(main, 'config.json'), '{oops')
    seedSandboxConfig(p)
    const out = JSON.parse(readFileSync(join(p.sandboxUserData, 'config.json'), 'utf8'))
    expect(out.settings.autoBackup).toBe(false)
    expect(out.settings.userName).toBeUndefined()
  })

  it('в основному профілі нічого не пише', () => {
    const p = resolveProfile(['e'], main)
    seedSandboxConfig(p)
    expect(existsSync(p.sandboxUserData)).toBe(false)
  })
})

describe('маркер, очищення й видалення', () => {
  const prepare = (): ReturnType<typeof resolveProfile> => {
    const p = resolveProfile(['e', SANDBOX_ARG], main)
    mkdirSync(join(p.sandboxUserData, 'data', 'files'), { recursive: true })
    mkdirSync(join(p.sandboxUserData, 'logs'))
    writeFileSync(join(p.sandboxUserData, 'data', 'vault.db'), 'db')
    writeFileSync(join(p.sandboxUserData, 'config.json'), '{}')
    writeFileSync(join(p.sandboxUserData, 'logs', 'main.log'), 'log')
    return p
  }

  it('wipeSandboxData видаляє data/ і config.json, журнал і маркер лишаються', () => {
    const p = prepare()
    writeMarker(p)
    wipeSandboxData(p)
    expect(existsSync(join(p.sandboxUserData, 'data'))).toBe(false)
    expect(existsSync(join(p.sandboxUserData, 'config.json'))).toBe(false)
    expect(existsSync(join(p.sandboxUserData, 'logs', 'main.log'))).toBe(true)
    expect(existsSync(join(p.sandboxUserData, SANDBOX_MARKER))).toBe(true)
  })

  it('wipeSandboxData відмовляє в основному профілі й на підміненій папці', () => {
    const p = prepare()
    expect(() => wipeSandboxData({ ...p, kind: 'main' })).toThrow()
    expect(() => wipeSandboxData({ ...p, sandboxUserData: main })).toThrow()
    expect(existsSync(join(main))).toBe(true)
  })

  it('removeSandbox: лише з основного й лише зі своїм маркером', () => {
    const p = prepare()
    const fromMain = { ...p, kind: 'main' as const }
    // no marker → UserError, the folder stays
    expect(() => removeSandbox(fromMain)).toThrow(UserError)
    expect(existsSync(p.sandboxUserData)).toBe(true)
    // a marker of another Vault → the same
    writeFileSync(
      join(p.sandboxUserData, SANDBOX_MARKER),
      JSON.stringify({ format: 'vault-sandbox', mainUserData: join(root, 'Other') })
    )
    expect(hasOwnMarker(fromMain)).toBe(false)
    expect(() => removeSandbox(fromMain)).toThrow(UserError)
    expect(existsSync(p.sandboxUserData)).toBe(true)
    // from inside the sandbox — never
    rmSync(join(p.sandboxUserData, SANDBOX_MARKER))
    writeMarker(p)
    expect(() => removeSandbox(p)).toThrow()
    // own marker → removed, the main folder untouched
    expect(hasOwnMarker(fromMain)).toBe(true)
    removeSandbox(fromMain)
    expect(existsSync(p.sandboxUserData)).toBe(false)
    expect(existsSync(main)).toBe(true)
  })

  it('removeSandbox без папки — нічого не робить', () => {
    expect(() => removeSandbox(resolveProfile(['e'], main))).not.toThrow()
  })

  it('dirSize рахує всі файли дерева', async () => {
    const p = prepare()
    // 'db' + '{}' + 'log'
    expect(await dirSize(p.sandboxUserData)).toBe(7)
    expect(await dirSize(join(root, 'missing'))).toBe(0)
  })
})
