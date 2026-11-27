/**
 * «Відкрити в терміналі»: the allow-lists for host, login, port and key file (hostile input included), ssh's argument
 * list, the PowerShell literals, the disk checks (app execution aliases, timeouts) and the launcher with an injected
 * spawner — no test ever starts a process or connects anywhere. The access passes only host, port, login and key
 * path, never a secret.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  checkSshTarget,
  encodePs,
  findSsh,
  isRegularFile,
  pathEntryExists,
  psLiteral,
  sessionScript,
  sshArgs,
  SSH_ERRORS,
  SshTerminal,
  withTimeout,
  type SpawnRequest,
  type SshLauncher,
  type SshTargetInput
} from '@main/system/ssh-terminal'
import { Credentials } from '@main/modules/crm/credentials'
import { UserError } from '@main/core/util'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const KEY = 'C:\\Users\\Олена Коваль\\.ssh\\id_ed25519'
const SSH = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'
const PS = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const WT = 'C:\\Users\\o\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe'
const ENV = { SystemRoot: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\o\\AppData\\Local', PATH: '' }
const files = new Set([KEY, SSH, PS])
const isFile = async (p: string): Promise<boolean> => files.has(p)

const target = (over: Partial<SshTargetInput> = {}): SshTargetInput => ({
  host: 'example.com',
  port: null,
  login: 'deploy',
  keyPath: '',
  ...over
})

async function refused(over: Partial<SshTargetInput>, message: string): Promise<void> {
  let error: unknown
  try {
    await checkSshTarget(target(over), isFile)
  } catch (e) {
    error = e
  }
  expect(error, JSON.stringify(over)).toBeInstanceOf(UserError)
  expect((error as Error).message, JSON.stringify(over)).toBe(message)
}

const decode = (b64: string): string => Buffer.from(b64, 'base64').toString('utf16le')

describe('the target is checked by allow-lists', () => {
  it('takes plain hosts, IPs, logins, ports and key paths', async () => {
    expect(await checkSshTarget(target(), isFile)).toEqual({
      host: 'example.com',
      port: 22,
      login: 'deploy',
      keyPath: ''
    })
    expect(
      await checkSshTarget(target({ host: '10.0.0.5', port: 2222, login: '' }), isFile)
    ).toEqual({ host: '10.0.0.5', port: 2222, login: '', keyPath: '' })
    expect((await checkSshTarget(target({ host: '[2001:db8::1]' }), isFile)).host).toBe(
      '2001:db8::1'
    )
    expect((await checkSshTarget(target({ host: 'my_box' }), isFile)).host).toBe('my_box')
    expect((await checkSshTarget(target({ login: 'me@corp.example' }), isFile)).login).toBe(
      'me@corp.example'
    )
    // A Cyrillic folder with a space is fine; `/` is read as `\`.
    expect(
      (await checkSshTarget(target({ keyPath: KEY.replace(/\\/g, '/') }), isFile)).keyPath
    ).toBe(KEY)
  })

  it('refuses hosts that ssh, a shell or wt.exe could read as something else', async () => {
    for (const host of [
      '-oProxyCommand=calc.exe',
      '-J evil',
      'host;calc',
      'host & calc',
      'host|calc',
      'a b',
      'host`whoami`',
      "h'x",
      'h"x',
      '$(calc)',
      '%TEMP%',
      'host^x',
      'host!x',
      'host:22',
      'https://example.com',
      'root@example.com',
      '[::1%eth0]',
      'fe80::1%25eth0',
      '\u2018x\u2019',
      'host\ncalc',
      'приклад.укр',
      '-example.com',
      'a..b',
      'a'.repeat(254),
      42
    ])
      await refused({ host }, SSH_ERRORS.host)
    await refused({ host: '  ' }, 'Вкажіть хост сервера — поле «Хост».')
  })

  it('refuses logins that could become an option or break quoting', async () => {
    for (const login of [
      '-oProxyCommand=calc',
      '-l',
      '@root',
      'root;calc',
      'ro ot',
      "o'neil",
      'a"b',
      'a$b',
      'a%b',
      'a`b',
      'a\\b',
      'дмитро',
      'a\u2019b',
      'a'.repeat(129),
      7
    ])
      await refused({ login }, SSH_ERRORS.login)
  })

  it('takes only an integer port 1…65535', async () => {
    for (const port of [0, -1, 65_536, 22.5, '22', Number.NaN, Infinity])
      await refused({ port }, SSH_ERRORS.port)
  })

  it('takes only an absolute, existing key file without special characters', async () => {
    for (const keyPath of [
      'id_rsa',
      '.ssh\\id_rsa',
      '~\\.ssh\\id_rsa',
      '%USERPROFILE%\\.ssh\\id_rsa',
      '\\\\server\\share\\key',
      '-oProxyCommand=calc',
      'C:\\k"ey',
      "C:\\k'ey",
      'C:\\a;calc',
      'C:\\a&b',
      'C:\\a|b',
      'C:\\a$b',
      'C:\\a`b',
      'C:\\a^b',
      'C:\\a!b',
      'C:\\a<b',
      'C:\\keys\\',
      'C:\\a\nb',
      'C:\\a\u2019b',
      `C:\\${'a'.repeat(500)}`,
      5
    ])
      await refused({ keyPath }, SSH_ERRORS.keyPath)
    await refused({ keyPath: 'C:\\nowhere\\id_rsa' }, SSH_ERRORS.keyMissing)
  })
})

describe('ssh arguments and the PowerShell script', () => {
  it('login through -l, key through -i, and -- right before the host', () => {
    expect(sshArgs({ host: 'example.com', port: 2222, login: 'deploy', keyPath: KEY })).toEqual([
      '-p',
      '2222',
      '-l',
      'deploy',
      '-i',
      KEY,
      '--',
      'example.com'
    ])
    expect(sshArgs({ host: '10.0.0.5', port: 22, login: '', keyPath: '' })).toEqual([
      '-p',
      '22',
      '--',
      '10.0.0.5'
    ])
  })

  it('PowerShell literals double every kind of single quote', () => {
    expect(psLiteral("it's")).toBe("'it''s'")
    expect(psLiteral('a\u2019b')).toBe("'a\u2019\u2019b'")
    expect(psLiteral('$(calc) `x` "y"')).toBe('\'$(calc) `x` "y"\'')
  })

  it('the script splats the arguments as literals and waits for Enter only after ssh’s own error', () => {
    const script = sessionScript(
      SSH,
      sshArgs({ host: 'example.com', port: 22, login: 'deploy', keyPath: KEY })
    )
    expect(script).toContain(
      `$sshArgs = @('-p', '22', '-l', 'deploy', '-i', '${KEY}', '--', 'example.com')`
    )
    expect(script).toContain(`& '${SSH}' @sshArgs`)
    // 255 — ssh itself failed; any other code is the remote shell's status after a normal session.
    expect(script).toContain('if ($LASTEXITCODE -eq 255) { $failed = $true }')
    expect(script).not.toContain('-ne 0')
    expect(script).toMatch(/catch \{[^}]*\$failed = \$true/)
    expect(script).toMatch(/if \(\$failed\) \{[^}]*Read-Host/)
    expect(decode(encodePs(script))).toBe(script)
  })

  it('finds OpenSSH from Windows first, then a plain path on PATH', async () => {
    expect(await findSsh(ENV, isFile)).toBe(SSH)
    const git = 'C:\\Program Files\\Git\\usr\\bin\\ssh.exe'
    const only = async (p: string): Promise<boolean> => p === git
    expect(
      await findSsh({ ...ENV, PATH: 'relative;C:\\a&b;C:\\Program Files\\Git\\usr\\bin' }, only)
    ).toBe(git)
    expect(await findSsh({ ...ENV, PATH: '%X%\\bin' }, async () => false)).toBeNull()
  })
})

describe('disk checks (the real implementations)', () => {
  let dir = ''
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'vault-ssh-'))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  /** A link stat() cannot follow — what an app execution alias such as wt.exe looks like to Node. */
  function danglingLink(name: string): string {
    const gone = join(dir, `${name}-target`)
    mkdirSync(gone)
    const link = join(dir, name)
    symlinkSync(gone, link, 'junction')
    rmSync(gone, { recursive: true })
    return link
  }

  it('a regular file is a file; a folder, a missing path or a broken link is not', async () => {
    const file = join(dir, 'id_ed25519')
    writeFileSync(file, '')
    expect(await isRegularFile(file)).toBe(true)
    expect(await isRegularFile(dir)).toBe(false)
    expect(await isRegularFile(join(dir, 'nope'))).toBe(false)
    expect(await isRegularFile(danglingLink('broken'))).toBe(false)
  })

  it('a link that stat cannot read still exists (lstat), unlike existsSync', async () => {
    const link = danglingLink('alias.exe')
    expect(existsSync(link)).toBe(false)
    expect(await pathEntryExists(link)).toBe(true)
    expect(await pathEntryExists(join(dir, 'nope.exe'))).toBe(false)
  })

  it('a real app execution alias of this machine exists, when there is one', async () => {
    const apps = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps')
    const alias = existsSync(apps) ? readdirSync(apps).find((n) => n.endsWith('.exe')) : undefined
    if (!alias) return
    expect(existsSync(join(apps, alias))).toBe(false)
    expect(await pathEntryExists(join(apps, alias))).toBe(true)
  })

  it('a check that hangs (a dead mapped drive) gives up after the timeout', async () => {
    const never = new Promise<boolean>(() => undefined)
    expect(await withTimeout(never, 20, false)).toBe(false)
    expect(await withTimeout(Promise.reject(new Error('EIO')), 1000, false)).toBe(false)
    expect(await withTimeout(Promise.resolve(true), 1000, false)).toBe(true)
  })

  it('the launcher’s default checks find wt.exe behind an alias-like link', async () => {
    const win = join(dir, 'Windows')
    const ssh = join(win, 'System32', 'OpenSSH', 'ssh.exe')
    const ps = join(win, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    for (const f of [ssh, ps]) {
      mkdirSync(join(f, '..'), { recursive: true })
      writeFileSync(f, '')
    }
    const local = join(dir, 'Local')
    const apps = join(local, 'Microsoft', 'WindowsApps')
    mkdirSync(apps, { recursive: true })
    const gone = join(dir, 'wt-target')
    mkdirSync(gone)
    symlinkSync(gone, join(apps, 'wt.exe'), 'junction')
    rmSync(gone, { recursive: true })

    const calls: SpawnRequest[] = []
    // Only the spawner is faked: isFile / exists are the real defaults.
    const term = new SshTerminal({
      platform: 'win32',
      env: { SystemRoot: win, LOCALAPPDATA: local, PATH: '' },
      spawn: async (req) => {
        calls.push(req)
        return null
      }
    })
    await term.open(target())
    expect(calls).toHaveLength(1)
    expect(calls[0].file).toBe(join(apps, 'wt.exe'))
    expect(calls[0].args.slice(0, 3)).toEqual(['new-tab', '--', ps])
  })
})

describe('the launcher (injected spawner — nothing is started)', () => {
  function launcher(
    opts: {
      platform?: NodeJS.Platform
      wt?: boolean
      files?: Set<string>
      spawn?: (req: SpawnRequest) => Promise<number | null>
    } = {}
  ): { term: SshTerminal; calls: SpawnRequest[] } {
    const calls: SpawnRequest[] = []
    const have = opts.files ?? files
    const term = new SshTerminal({
      platform: opts.platform ?? 'win32',
      env: ENV,
      isFile: async (p) => have.has(p),
      exists: async (p) => p === WT && opts.wt !== false,
      spawn: async (req) => {
        calls.push(req)
        return opts.spawn ? opts.spawn(req) : req.waitExit ? 0 : null
      }
    })
    return { term, calls }
  }

  /** No argv element of wt / powershell carries a user value or anything wt or a shell would split on. */
  function inert(args: string[]): void {
    for (const a of args) {
      expect(a).not.toMatch(/[;"'&|<>^%$`\s]/)
      expect(a).not.toContain('example.com')
      expect(a).not.toContain('deploy')
    }
  }

  it('opens Windows Terminal with powershell and the encoded script; ssh gets -- before the host', async () => {
    const { term, calls } = launcher()
    await term.open(target({ keyPath: KEY }))
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call.file).toBe(WT)
    expect(call.hidden).toBe(false)
    expect(call.args.slice(0, 3)).toEqual(['new-tab', '--', PS])
    expect(call.args.slice(3, 6)).toEqual(['-NoLogo', '-NoProfile', '-EncodedCommand'])
    inert(call.args)
    const script = decode(call.args[6])
    expect(script).toContain(`@('-p', '22', '-l', 'deploy', '-i', '${KEY}', '--', 'example.com')`)
  })

  it('without wt.exe (or when it fails to start) asks a hidden PowerShell to open a console window', async () => {
    for (const setup of [
      { wt: false },
      {
        spawn: async (req: SpawnRequest) => {
          if (req.file === WT) throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
          return 0
        }
      }
    ]) {
      const { term, calls } = launcher(setup)
      await term.open(target())
      const helper = calls[calls.length - 1]
      expect(helper.file).toBe(PS)
      expect(helper).toMatchObject({ hidden: true, waitExit: true })
      inert(helper.args)
      const outer = decode(helper.args[helper.args.length - 1])
      expect(outer).toContain(`Start-Process -FilePath '${PS}'`)
      const inner = outer.match(/'-EncodedCommand', '([A-Za-z0-9+/=]+)'/)?.[1]
      expect(decode(inner!)).toContain(`'--', 'example.com'`)
    }
  })

  it('a failed, broken or unconfirmed helper is an error, never a success', async () => {
    const exit1 = launcher({ wt: false, spawn: async () => 1 })
    await expect(exit1.term.open(target())).rejects.toThrow('Не вдалося відкрити термінал')
    const broken = launcher({
      wt: false,
      spawn: async () => {
        throw Object.assign(new Error('spawn EACCES'), { code: 'EACCES' })
      }
    })
    await expect(broken.term.open(target())).rejects.toThrow('Не вдалося відкрити термінал')
    // The helper did not finish in time: the window is not confirmed, so «Термінал відкрито» must not show.
    const silent = launcher({ wt: false, spawn: async () => null })
    await expect(silent.term.open(target())).rejects.toThrow(UserError)
  })

  it('refuses before starting anything: hostile input, no OpenSSH, not Windows', async () => {
    const hostile = launcher()
    await expect(hostile.term.open(target({ host: '-oProxyCommand=calc.exe' }))).rejects.toThrow(
      SSH_ERRORS.host
    )
    expect(hostile.calls).toHaveLength(0)
    const noSsh = launcher({ files: new Set([PS]) })
    await expect(noSsh.term.open(target())).rejects.toThrow('OpenSSH')
    expect(noSsh.calls).toHaveLength(0)
    const mac = launcher({ platform: 'darwin' })
    await expect(mac.term.open(target())).rejects.toThrow('лише у Windows')
    expect(mac.calls).toHaveLength(0)
  })
})

describe('openSsh on a stored access', () => {
  let v: Vault
  beforeEach(() => {
    v = openVault()
  })
  afterEach(() => v.close())

  it('passes only host, port, login and key path — never a password, key or passphrase', async () => {
    const seen: SshTargetInput[] = []
    const fake: SshLauncher = { open: async (t) => void seen.push(t) }
    const creds = new Credentials(v.m, undefined, fake).api()
    const p = await v.api.projects.create({ title: 'Сайт' })
    const server = await creds.create({
      kind: 'server',
      projectId: p.id,
      label: 'VPS',
      host: 'example.com',
      port: 2222,
      login: 'deploy',
      secret: 'pw-SECRET-1',
      privateKey: 'KEY-SECRET-2',
      passphrase: 'PASS-SECRET-3',
      keyPath: KEY
    })
    await creds.openSsh(server.id)
    expect(seen).toEqual([{ host: 'example.com', port: 2222, login: 'deploy', keyPath: KEY }])
    expect(JSON.stringify(seen)).not.toMatch(/SECRET/)

    const account = await creds.create({ kind: 'account', projectId: p.id, label: 'Сайт' })
    await expect(creds.openSsh(account.id)).rejects.toThrow('лише доступ типу «Сервер»')
    await expect(new Credentials(v.m).api().openSsh(server.id)).rejects.toThrow(
      'Термінал зараз недоступний'
    )
  })

  it('a hostile host the form let through is refused by main before anything starts', async () => {
    const calls: SpawnRequest[] = []
    const term = new SshTerminal({
      platform: 'win32',
      env: ENV,
      isFile,
      exists: async () => true,
      spawn: async (req) => {
        calls.push(req)
        return null
      }
    })
    const creds = new Credentials(v.m, undefined, term).api()
    const p = await v.api.projects.create({ title: 'Сайт' })
    // The form's host check only refuses spaces, schemes and paths.
    const c = await creds.create({
      kind: 'server',
      projectId: p.id,
      label: 'X',
      host: '-oProxyCommand=calc.exe'
    })
    await expect(creds.openSsh(c.id)).rejects.toThrow(SSH_ERRORS.host)
    expect(calls).toHaveLength(0)
  })
})
