/**
 * «Відкрити в терміналі» for a server access: a visible terminal window running ssh. The person types the password
 * there — no secret is ever put on a command line, in the environment, a file, the log or the clipboard.
 *
 * Every user-typed part (host, login, port, key file) is checked against an allow-list first. Then no shell ever
 * re-parses them: the ssh call is a small PowerShell script where each argument is a single-quoted literal (splatted
 * as an array, so `--` and dashes reach ssh untouched), and the script itself travels base64-encoded
 * (`-EncodedCommand`): the command lines of wt.exe and powershell.exe hold only fixed words, absolute system paths
 * and base64 — no `;` (wt's command separator), no quotes, nothing cmd.exe or wt could split.
 *
 * Windows Terminal (wt.exe) opens it in a tab; without it a hidden PowerShell asks Windows (Start-Process) to open a
 * new console window. On a failed ssh the script waits for Enter, so the error stays readable.
 */
import { spawn } from 'child_process'
import { statSync, existsSync } from 'fs'
import { isIP } from 'net'
import { win32 } from 'path'
import { SSH_DEFAULT_PORT } from '@shared/domain/credentials'
import { log } from '../core/logger'
import { UserError } from '../core/util'

/** What main reads from the record: the stored values as they are (an import may have put anything there). */
export interface SshTargetInput {
  host: unknown
  port: unknown
  login: unknown
  keyPath: unknown
}

/** The checked target: every part safe to hand to ssh as one argument. */
export interface SshTarget {
  host: string
  port: number
  login: string
  keyPath: string
}

/** The narrow part Credentials needs: open a terminal for a checked target. */
export interface SshLauncher {
  open(target: SshTargetInput): Promise<void>
}

/** One process start. `waitExit` — wait for its exit code (the hidden helper); otherwise «started» is enough. */
export interface SpawnRequest {
  file: string
  args: string[]
  hidden: boolean
  waitExit: boolean
}
/** Resolves with the exit code (`waitExit`) or null; rejects when the process could not start. */
export type Spawner = (req: SpawnRequest) => Promise<number | null>

export interface SshTerminalDeps {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  /** A regular file exists at this absolute path. */
  isFile(path: string): boolean
  /** Something exists at this path (wt.exe is an app execution alias, not a regular file). */
  exists(path: string): boolean
  spawn: Spawner
}

/* ───────────── Validation (allow-lists) ───────────── */

/** DNS labels (letters, digits, `-`, `_`), dot-separated, never starting or ending with `-`; ≤ 253 characters. */
const LABEL = '[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?'
const HOSTNAME = new RegExp(`^(?=.{1,253}$)${LABEL}(?:\\.${LABEL})*\\.?$`)
/** A login: Latin letters, digits and `. _ - @`, never starting with `-` (ssh would read it as an option). */
const LOGIN = /^[A-Za-z0-9_][A-Za-z0-9._@-]{0,127}$/
/** One folder or file name of a Windows path: letters of any script, digits, space and `_ . - ( ) ~ + @ #`. */
const PATH_PART = '[\\p{L}\\p{M}\\p{N} _.()~+@#-]+'
/** An absolute path on a drive (`C:\…`): no quotes, `$`, `%`, `;`, `&`, `|`, `<`, `>`, `^`, `!`, backticks. */
const SAFE_PATH = new RegExp(`^[A-Za-z]:\\\\(?:${PATH_PART}\\\\)*${PATH_PART}$`, 'u')

export const SSH_ERRORS = {
  host: 'Поле «Хост» не підходить для SSH: лише домен або IP-адреса — латинські літери, цифри, крапка й дефіс, без пробілів, порту та https://.',
  login:
    'Поле «Користувач» не підходить для SSH: лише латинські літери, цифри та . _ - @, без пробілів і не з дефіса на початку.',
  port: 'Поле «Порт» має бути цілим числом від 1 до 65535.',
  keyPath:
    'Поле «Файл ключа»: вкажіть повний шлях до файлу на цьому комп’ютері, як-от C:\\Users\\…\\.ssh\\id_ed25519 — без лапок і символів $ % ; & | < > ^ !',
  keyMissing: 'Файл ключа не знайдено на цьому комп’ютері — перевірте поле «Файл ключа».'
} as const

/** Whether `p` is an absolute drive path without characters any shell or wt.exe could treat specially. */
export function isSafeWindowsPath(p: string): boolean {
  return p.length <= 500 && SAFE_PATH.test(p)
}

function checkHost(raw: unknown): string {
  if (typeof raw !== 'string') throw new UserError(SSH_ERRORS.host)
  const v = raw.trim()
  if (!v) throw new UserError('Вкажіть хост сервера — поле «Хост».')
  // IPv6 may be typed in brackets; ssh takes it bare. No zone (`%eth0`): `%` is never let through.
  const bare = v.startsWith('[') && v.endsWith(']') ? v.slice(1, -1) : v
  if (/^[0-9A-Fa-f:.]+$/.test(bare) && bare.includes(':') && isIP(bare) === 6) return bare
  if (HOSTNAME.test(v)) return v
  throw new UserError(SSH_ERRORS.host)
}

function checkLogin(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw !== 'string') throw new UserError(SSH_ERRORS.login)
  const v = raw.trim()
  if (v && !LOGIN.test(v)) throw new UserError(SSH_ERRORS.login)
  return v
}

function checkPort(raw: unknown): number {
  if (raw === null || raw === undefined) return SSH_DEFAULT_PORT
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 65_535)
    throw new UserError(SSH_ERRORS.port)
  return raw
}

function checkKeyPath(raw: unknown, isFile: (p: string) => boolean): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw !== 'string') throw new UserError(SSH_ERRORS.keyPath)
  // `C:/Users/…` is the same path; Windows takes either separator.
  const v = raw.trim().replace(/\//g, '\\')
  if (!v) return ''
  if (!isSafeWindowsPath(v)) throw new UserError(SSH_ERRORS.keyPath)
  if (!isFile(v)) throw new UserError(SSH_ERRORS.keyMissing)
  return v
}

/** Checks every part of the target; a UserError names the field to fix. */
export function checkSshTarget(t: SshTargetInput, isFile: (p: string) => boolean): SshTarget {
  return {
    host: checkHost(t.host),
    port: checkPort(t.port),
    login: checkLogin(t.login),
    keyPath: checkKeyPath(t.keyPath, isFile)
  }
}

/**
 * ssh's arguments, one value per element: `-p 22 [-l user] [-i key] -- host`. The login goes through `-l` (never
 * `user@host`), and `--` ends the options, so a host can never be read as one (`-oProxyCommand=…`).
 */
export function sshArgs(t: SshTarget): string[] {
  return [
    '-p',
    String(t.port),
    ...(t.login ? ['-l', t.login] : []),
    ...(t.keyPath ? ['-i', t.keyPath] : []),
    '--',
    t.host
  ]
}

/* ───────────── The PowerShell script ───────────── */

/**
 * A PowerShell single-quoted literal: nothing inside is expanded. PowerShell also takes the typographic single
 * quotes as quote marks, so every one of them is doubled (the allow-lists already keep them out).
 */
export function psLiteral(value: string): string {
  return `'${value.replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&')}'`
}

/** `-EncodedCommand` takes base64 of UTF-16LE. */
export function encodePs(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** Runs ssh with the arguments as literals; after a failure waits for Enter so the message can be read. */
export function sessionScript(sshPath: string, args: string[]): string {
  return [
    "$Host.UI.RawUI.WindowTitle = 'Vault · SSH'",
    `$sshArgs = @(${args.map(psLiteral).join(', ')})`,
    'try {',
    `  & ${psLiteral(sshPath)} @sshArgs`,
    '  $code = $LASTEXITCODE',
    '} catch {',
    '  Write-Host $_.Exception.Message -ForegroundColor Red',
    '  $code = 1',
    '}',
    'if ($code -ne 0) {',
    "  Write-Host ''",
    "  Write-Host ('SSH завершився з помилкою (код ' + $code + ').') -ForegroundColor Yellow",
    "  Read-Host 'Натисніть Enter, щоб закрити вікно' | Out-Null",
    '}'
  ].join('\n')
}

/** powershell.exe arguments that run the session script in the window it is started in. */
export function sessionArgs(script: string): string[] {
  return ['-NoLogo', '-NoProfile', '-EncodedCommand', encodePs(script)]
}

/** The hidden helper's script: asks Windows to open powershell.exe with the session in a new console window. */
export function startProcessScript(powershell: string, session: string[]): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  Start-Process -FilePath ${psLiteral(powershell)} -ArgumentList @(${session.map(psLiteral).join(', ')})`,
    '  exit 0',
    '} catch {',
    '  exit 1',
    '}'
  ].join('\n')
}

/* ───────────── Finding the programs ───────────── */

function systemRoot(env: NodeJS.ProcessEnv): string {
  const root = env.SystemRoot ?? env.SYSTEMROOT ?? env.windir ?? ''
  return isSafeWindowsPath(root) ? root : 'C:\\Windows'
}

export function powershellPath(env: NodeJS.ProcessEnv): string {
  return win32.join(systemRoot(env), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** wt.exe's app execution alias, when LOCALAPPDATA is a plain path. */
export function wtPath(env: NodeJS.ProcessEnv): string | null {
  const local = env.LOCALAPPDATA ?? ''
  return isSafeWindowsPath(local) ? win32.join(local, 'Microsoft', 'WindowsApps', 'wt.exe') : null
}

/** OpenSSH from Windows first, then ssh.exe on PATH (Git, Scoop…); only plain absolute paths. */
export function findSsh(env: NodeJS.ProcessEnv, isFile: (p: string) => boolean): string | null {
  const pathVar = env.PATH ?? env.Path ?? ''
  const candidates = [
    win32.join(systemRoot(env), 'System32', 'OpenSSH', 'ssh.exe'),
    ...pathVar
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => win32.join(d, 'ssh.exe'))
  ]
  return candidates.find((p) => isSafeWindowsPath(p) && isFile(p)) ?? null
}

/* ───────────── Launching ───────────── */

/** Exit code of the hidden helper, or null when it took too long to tell (the window may still open). */
const HELPER_TIMEOUT_MS = 20_000

/** No shell, the arguments as an array (Node quotes each one for CreateProcess). */
export const spawnProcess: Spawner = (req) =>
  new Promise((resolve, reject) => {
    const child = spawn(req.file, req.args, {
      shell: false,
      windowsVerbatimArguments: false,
      detached: !req.waitExit,
      stdio: 'ignore',
      windowsHide: req.hidden
    })
    child.once('error', reject)
    if (!req.waitExit) {
      child.once('spawn', () => {
        child.unref()
        resolve(null)
      })
      return
    }
    const timer = setTimeout(() => {
      child.unref()
      resolve(null)
    }, HELPER_TIMEOUT_MS)
    timer.unref?.()
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code ?? 1)
    })
  })

const isRegularFile = (p: string): boolean => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

const errCode = (e: unknown): string =>
  (e as NodeJS.ErrnoException)?.code ?? (e as Error)?.message ?? String(e)

export class SshTerminal implements SshLauncher {
  private readonly deps: SshTerminalDeps

  constructor(deps: Partial<SshTerminalDeps> = {}) {
    this.deps = {
      platform: deps.platform ?? process.platform,
      env: deps.env ?? process.env,
      isFile: deps.isFile ?? isRegularFile,
      exists: deps.exists ?? existsSync,
      spawn: deps.spawn ?? spawnProcess
    }
  }

  async open(input: SshTargetInput): Promise<void> {
    const { platform, env, isFile, exists } = this.deps
    if (platform !== 'win32')
      throw new UserError(
        'Відкрити в терміналі поки можна лише у Windows. Скопіюйте команду SSH і запустіть її у своєму терміналі.'
      )
    const target = checkSshTarget(input, isFile)
    const ssh = findSsh(env, isFile)
    if (!ssh)
      throw new UserError(
        'Не знайдено клієнт OpenSSH (ssh.exe). Встановіть його: Параметри Windows › Додаткові компоненти › «Клієнт OpenSSH» — і спробуйте ще раз.'
      )
    const powershell = powershellPath(env)
    if (!isFile(powershell))
      throw new UserError(
        'Не знайдено Windows PowerShell — без нього Vault не може відкрити термінал.'
      )
    const session = sessionArgs(sessionScript(ssh, sshArgs(target)))

    const wt = wtPath(env)
    if (wt && exists(wt)) {
      try {
        // `--` ends wt's own options; everything after it is fixed words, system paths and base64.
        await this.deps.spawn({
          file: wt,
          args: ['new-tab', '--', powershell, ...session],
          hidden: false,
          waitExit: false
        })
        log.info('[ssh] terminal opened in Windows Terminal')
        return
      } catch (e) {
        log.warn(`[ssh] wt.exe did not start (${errCode(e)}), falling back to PowerShell`)
      }
    }

    let code: number | null
    try {
      code = await this.deps.spawn({
        file: powershell,
        args: [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          encodePs(startProcessScript(powershell, session))
        ],
        hidden: true,
        waitExit: true
      })
    } catch (e) {
      log.error(`[ssh] powershell.exe did not start: ${errCode(e)}`)
      throw new UserError('Не вдалося відкрити термінал. Подробиці — у журналі.')
    }
    if (code !== null && code !== 0) {
      log.error(`[ssh] Start-Process failed, exit code ${code}`)
      throw new UserError('Не вдалося відкрити термінал. Подробиці — у журналі.')
    }
    if (code === null) log.warn('[ssh] the PowerShell helper did not finish in time')
    log.info('[ssh] terminal opened in a PowerShell window')
  }
}
