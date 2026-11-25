/**
 * «Тестовий режим»: which data profile this process runs, where the test folder is, and the few file
 * operations on it. Pure functions plus thin fs (Electron only through the logger), so every guard is unit-tested.
 *
 * Safety rules (the real data is never touched):
 * - the test folder is always computed from the main userData (`<main>-sandbox`), never taken from RPC;
 * - removal needs the folder's own marker naming this main userData — a foreign «Vault-sandbox» stays;
 * - the main config.json is only read, once, by a whitelist, when the test profile is created.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { lstat, readdir } from 'fs/promises'
import { basename, join, relative, resolve, isAbsolute } from 'path'
import type { ProfileKind } from '@shared/domain/sandbox'
import { HIDDEN_ARG } from '../system/autostart'
import { log } from './logger'
import { isBusyError, retryBusy, UserError } from './util'

export const SANDBOX_ARG = '--vault-sandbox'
/** With SANDBOX_ARG: the test data is wiped before the start («Очистити тестові дані» inside the sandbox). */
export const SANDBOX_RESET_ARG = '--vault-sandbox-reset'
export const SANDBOX_SUFFIX = '-sandbox'
/** Written by the sandbox on its first start; removal refuses a folder without it. */
export const SANDBOX_MARKER = 'vault-sandbox.json'
const MARKER_FORMAT = 'vault-sandbox'

export interface Profile {
  kind: ProfileKind
  /** userData of the real Vault (also where the single-instance lock lives). */
  mainUserData: string
  /** `<mainUserData>-sandbox`. */
  sandboxUserData: string
  /** Wipe the test data before opening it. */
  reset: boolean
}

export function sandboxDirOf(mainUserData: string): string {
  return `${resolve(mainUserData)}${SANDBOX_SUFFIX}`
}

export function resolveProfile(argv: readonly string[], mainUserData: string): Profile {
  const kind: ProfileKind = argv.includes(SANDBOX_ARG) ? 'sandbox' : 'main'
  return {
    kind,
    mainUserData: resolve(mainUserData),
    sandboxUserData: sandboxDirOf(mainUserData),
    reset: kind === 'sandbox' && argv.includes(SANDBOX_RESET_ARG)
  }
}

const norm = (p: string): string => {
  const r = resolve(p)
  return process.platform === 'win32' ? r.toLowerCase() : r
}

/** Same folder (Windows paths ignore case). */
export function samePath(a: string, b: string): boolean {
  return norm(a) === norm(b)
}

/** `child` is `parent` or lies inside it. */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(norm(parent), norm(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** The one folder file operations may touch: exactly `<main>-sandbox`, never the main data or around it. */
export function assertSandboxDir(p: Profile, dir: string): void {
  const main = p.mainUserData
  if (
    !samePath(dir, sandboxDirOf(main)) ||
    !basename(dir).endsWith(SANDBOX_SUFFIX) ||
    isInside(dir, main) ||
    isInside(main, dir)
  ) {
    throw new Error(`[sandbox] refusing to touch ${dir} (main ${main})`)
  }
}

interface Marker {
  format: string
  mainUserData: string
  createdAt: number
}

/** The sandbox marks its own folder once: only a marked folder can be removed from the main profile. */
export function writeMarker(p: Profile): void {
  if (p.kind !== 'sandbox') return
  assertSandboxDir(p, p.sandboxUserData)
  const file = join(p.sandboxUserData, SANDBOX_MARKER)
  if (existsSync(file)) return
  const marker: Marker = { format: MARKER_FORMAT, mainUserData: p.mainUserData, createdAt: Date.now() }
  writeFileSync(file, JSON.stringify(marker, null, 2))
}

export function hasOwnMarker(p: Profile): boolean {
  try {
    const m = JSON.parse(readFileSync(join(p.sandboxUserData, SANDBOX_MARKER), 'utf8')) as Partial<Marker>
    return m.format === MARKER_FORMAT && typeof m.mainUserData === 'string' && samePath(m.mainUserData, p.mainUserData)
  } catch {
    return false
  }
}

/**
 * Arguments for app.relaunch: the current ones without --hidden and the profile flags, plus the target's.
 * `--user-data-dir=…` stays, so a test instance relaunches into `${tmp}-sandbox`, not the real data.
 */
export function relaunchArgs(
  argv: readonly string[],
  target: ProfileKind,
  opts: { reset?: boolean } = {}
): string[] {
  const drop = new Set([HIDDEN_ARG, SANDBOX_ARG, SANDBOX_RESET_ARG])
  const args = argv.slice(1).filter((a) => !drop.has(a))
  if (target === 'sandbox') {
    args.push(SANDBOX_ARG)
    if (opts.reset) args.push(SANDBOX_RESET_ARG)
  }
  return args
}

/** Under `npm run dev` electron-vite owns the process: a relaunch would start Electron without the dev server. */
export function canRelaunch(isPackaged: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  return isPackaged || !env['ELECTRON_RENDERER_URL']
}

/**
 * Inside the sandbox before the database opens: removes the test data (database, files, backups) and the
 * test config. Chromium files, logs and the marker stay.
 */
export function wipeSandboxData(p: Profile): void {
  if (p.kind !== 'sandbox') throw new Error('[sandbox] wipe outside the sandbox')
  assertSandboxDir(p, p.sandboxUserData)
  retryBusy(() => rmSync(join(p.sandboxUserData, 'data'), { recursive: true, force: true }))
  retryBusy(() => rmSync(join(p.sandboxUserData, 'config.json'), { force: true }))
}

/** From the main profile: deletes the whole test folder — only if it carries its own marker. */
export function removeSandbox(p: Profile): void {
  if (p.kind !== 'main') throw new Error('[sandbox] remove from inside the sandbox')
  const dir = p.sandboxUserData
  assertSandboxDir(p, dir)
  if (!existsSync(dir)) return
  if (!hasOwnMarker(p)) {
    log.warn(`[sandbox] ${dir} has no own ${SANDBOX_MARKER}: not removed`)
    throw new UserError('Цю папку створив не тестовий режим Vault — її не видалено. Перевірте її вручну.')
  }
  try {
    retryBusy(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }))
  } catch (e) {
    if (!isBusyError(e)) throw e
    log.warn('[sandbox] remove', e)
    throw new UserError(
      'Не вдалося очистити тестові дані — файли тримає інша програма. Закрийте її й спробуйте ще раз.'
    )
  }
}

/** Settings carried into a new test profile: comfort only, nothing that reaches outside the sandbox. */
const SETTINGS_WHITELIST = [
  'userName',
  'theme',
  'quickAddShortcut',
  'closeToTray',
  'jobReminderTime',
  'weeklyReviewDay',
  'weeklyReviewTime',
  'backupKeep',
  'capturePort',
  'hiddenNavHubs',
  'hiddenNavItems'
] as const
/** Off in the sandbox by default: autostart is shared with the real Vault, the rest is background work. */
const FORCED_OFF = ['launchAtLogin', 'startHidden', 'autoUpdate', 'autoBackup', 'captureEnabled'] as const

/**
 * First start of the sandbox: its config.json from the main one — whitelisted settings and the window
 * bounds (the window doesn't jump on switching). Secrets, the seed ledger and `last*` are not copied.
 * ConfigStore validates the values itself when it reads the file.
 */
export function seedSandboxConfig(p: Profile): void {
  if (p.kind !== 'sandbox') return
  assertSandboxDir(p, p.sandboxUserData)
  const target = join(p.sandboxUserData, 'config.json')
  if (existsSync(target)) return
  let main: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(p.mainUserData, 'config.json'), 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) main = parsed as Record<string, unknown>
  } catch {
    /* no or broken main config: the sandbox starts from defaults */
  }
  const src =
    main.settings && typeof main.settings === 'object' ? (main.settings as Record<string, unknown>) : {}
  const settings: Record<string, unknown> = {}
  for (const key of SETTINGS_WHITELIST) if (src[key] !== undefined) settings[key] = src[key]
  for (const key of FORCED_OFF) settings[key] = false
  const out: Record<string, unknown> = { settings }
  if (main.window && typeof main.window === 'object') out.window = main.window
  mkdirSync(p.sandboxUserData, { recursive: true })
  writeFileSync(target, JSON.stringify(out, null, 2))
}

/** Total size of a folder; symlinks are not followed, unreadable parts count as 0. */
export async function dirSize(dir: string): Promise<number> {
  let total = 0
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) total += await dirSize(full)
    else if (e.isFile()) {
      try {
        total += (await lstat(full)).size
      } catch {
        /* removed meanwhile */
      }
    }
  }
  return total
}
