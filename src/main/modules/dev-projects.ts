/**
 * «Мои проекты»: local folders with package.json/git. Opens them in VS Code / Cursor / terminal,
 * runs package.json scripts with live logs (only scripts that exist in package.json — no arbitrary commands),
 * and reads git status. Child processes are killed when the app quits.
 */
import { dialog, BrowserWindow, shell } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, join } from 'path'
import { promisify } from 'util'
import { asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DevProjectsApi } from '@shared/api'
import {
  devProjectInputSchema,
  devProjectPatchSchema,
  openInSchema,
  runScriptSchema,
  type DevProject,
  type Editor,
  type GitInfo,
  type LogChunk,
  type PackageManager,
  type RunningScript
} from '@shared/domain/dev'
import { devProjects } from '../db/schema'
import { newId, now, NotFoundError, UserError } from '../core/util'
import { idArg, updateArgs, type ModuleContext } from './context'

const execFileAsync = promisify(execFile)
const IS_WIN = process.platform === 'win32'
const MAX_LINES = 3000
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const LOCAL_URL = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+[^\s'"]*)/
const SCRIPT_NAME = /^[\w:.\-@/]+$/

type Row = typeof devProjects.$inferSelect

interface Run extends RunningScript {
  child: ChildProcess | null
  lines: LogChunk[]
}

function readPackage(
  path: string
): { scripts: Record<string, string>; deps: Record<string, string> } | null {
  try {
    const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return { scripts: pkg.scripts ?? {}, deps: { ...pkg.dependencies, ...pkg.devDependencies } }
  } catch {
    return null
  }
}

function detectPm(path: string): PackageManager | null {
  if (existsSync(join(path, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(path, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(path, 'bun.lockb')) || existsSync(join(path, 'bun.lock'))) return 'bun'
  if (existsSync(join(path, 'package.json'))) return 'npm'
  return null
}

function detectFramework(deps: Record<string, string>): string | null {
  const has = (n: string): boolean => n in deps
  if (has('@shopify/hydrogen')) return 'Hydrogen'
  if (has('next')) return 'Next.js'
  if (has('nuxt')) return 'Nuxt'
  if (has('astro')) return 'Astro'
  if (has('@remix-run/react') || has('react-router'))
    return has('electron') ? 'Electron' : 'React Router'
  if (has('electron')) return 'Electron'
  if (has('@sveltejs/kit')) return 'SvelteKit'
  if (has('vite')) return has('react') ? 'Vite + React' : has('vue') ? 'Vite + Vue' : 'Vite'
  if (has('react')) return 'React'
  if (has('express') || has('fastify') || has('hono')) return 'Node API'
  return null
}

/** owner/repo from a GitHub remote URL (https or ssh). */
export function githubRepoOf(remote: string | null): string {
  if (!remote) return ''
  const m = remote.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i)
  return m ? `${m[1]}/${m[2]}` : ''
}

async function git(path: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', path, ...args], {
      timeout: 4000,
      windowsHide: true
    })
    return stdout
  } catch {
    return null
  }
}

export async function gitInfo(path: string): Promise<GitInfo | null> {
  if (!existsSync(join(path, '.git'))) return null
  const [status, log, remote] = await Promise.all([
    git(path, ['status', '--porcelain=v2', '--branch']),
    git(path, ['log', '-1', '--format=%H%x1f%s%x1f%an%x1f%ct']),
    git(path, ['remote', 'get-url', 'origin'])
  ])
  let branch: string | null = null
  let ahead = 0
  let behind = 0
  let dirty = 0
  for (const line of (status ?? '').split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14).trim()
    else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/)
      if (m) {
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (line.trim() && !line.startsWith('#')) dirty++
  }
  const [hash, message, author, ct] = (log ?? '').trim().split('\u001f')
  return {
    branch,
    dirty,
    ahead,
    behind,
    lastCommit: hash ? { hash, message, author, at: Number(ct) * 1000 } : null,
    remoteUrl: remote?.trim() || null
  }
}

/** Commits in all projects between two dates (for the weekly review). */
export async function commitsBetween(paths: string[], from: number, to: number): Promise<number> {
  let total = 0
  for (const p of paths) {
    const out = await git(p, [
      'log',
      '--all',
      `--since=${new Date(from).toISOString()}`,
      `--until=${new Date(to).toISOString()}`,
      '--oneline'
    ])
    if (out) total += out.split('\n').filter(Boolean).length
  }
  return total
}

export class DevProjectsModule {
  private readonly runs = new Map<string, Run>()
  private flushTimer: NodeJS.Timeout | null = null
  private pending: LogChunk[] = []

  constructor(private readonly m: ModuleContext) {}

  private get db() {
    return this.m.db.orm
  }

  private row(id: string): Row {
    const r = this.db.select().from(devProjects).where(eq(devProjects.id, id)).get()
    if (!r) throw new NotFoundError('Проект', id)
    return r
  }

  private validFolder(path: string): void {
    if (!existsSync(path) || !statSync(path).isDirectory())
      throw new UserError(`Папка не найдена: ${path}`)
  }

  async describe(r: Row): Promise<DevProject> {
    const exists = existsSync(r.path)
    const pkg = exists ? readPackage(r.path) : null
    const g = exists ? await gitInfo(r.path) : null
    return {
      ...r,
      editor: r.editor as Editor,
      exists,
      packageManager: exists ? detectPm(r.path) : null,
      scripts: pkg?.scripts ?? {},
      framework: pkg ? detectFramework(pkg.deps) : null,
      git: g,
      githubRepo: r.githubRepo || githubRepoOf(g?.remoteUrl ?? null),
      running: [...this.runs.values()]
        .filter((x) => x.projectId === r.id && x.status === 'running')
        .map((x) => this.publicRun(x))
    }
  }

  paths(): string[] {
    return this.db
      .select({ p: devProjects.path })
      .from(devProjects)
      .all()
      .map((r) => r.p)
      .filter((p) => existsSync(p))
  }

  /** owner/repo → local project id (for GitHub page). */
  repoIndex(): Map<string, string> {
    const out = new Map<string, string>()
    for (const r of this.db.select().from(devProjects).all())
      if (r.githubRepo) out.set(r.githubRepo.toLowerCase(), r.id)
    return out
  }

  /* ───────── processes ───────── */

  private publicRun(r: Run): RunningScript {
    return {
      runId: r.runId,
      projectId: r.projectId,
      script: r.script,
      pid: r.pid,
      startedAt: r.startedAt,
      status: r.status,
      exitCode: r.exitCode,
      url: r.url
    }
  }

  private push(run: Run, text: string, stream: LogChunk['stream']): void {
    const clean = text.replace(ANSI, '')
    if (!run.url) {
      const m = clean.match(LOCAL_URL)
      if (m) {
        run.url = m[1].replace('0.0.0.0', 'localhost')
        this.m.bus.emit('dev:status', this.publicRun(run))
      }
    }
    const chunk = { runId: run.runId, text: clean, stream }
    run.lines.push(chunk)
    if (run.lines.length > MAX_LINES) run.lines.splice(0, run.lines.length - MAX_LINES)
    this.pending.push(chunk)
    if (!this.flushTimer) {
      // Batch log events (~10/s) so a chatty dev server can't flood IPC.
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        const batch = this.pending
        this.pending = []
        if (batch.length) this.m.bus.emit('dev:log', batch)
      }, 100)
    }
  }

  private kill(run: Run): void {
    const child = run.child
    if (!child?.pid) return
    if (IS_WIN) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    else {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    }
  }

  killAll(): void {
    for (const r of this.runs.values()) if (r.status === 'running') this.kill(r)
  }

  runningCount(): number {
    return [...this.runs.values()].filter((r) => r.status === 'running').length
  }

  private start(projectId: string, script: string): RunningScript {
    const p = this.row(projectId)
    this.validFolder(p.path)
    const pkg = readPackage(p.path)
    if (!pkg || !(script in pkg.scripts))
      throw new UserError(`В package.json нет скрипта «${script}»`)
    if (!SCRIPT_NAME.test(script)) throw new UserError('Недопустимое имя скрипта')
    const already = [...this.runs.values()].find(
      (r) => r.projectId === projectId && r.script === script && r.status === 'running'
    )
    if (already) return this.publicRun(already)
    const pm = detectPm(p.path) ?? 'npm'
    const run: Run = {
      runId: newId(),
      projectId,
      script,
      pid: null,
      startedAt: now(),
      status: 'running',
      exitCode: null,
      url: null,
      child: null,
      lines: []
    }
    this.runs.set(run.runId, run)
    this.push(run, `$ ${pm} run ${script}\n`, 'sys')
    const child = spawn(pm, ['run', script], {
      cwd: p.path,
      shell: IS_WIN,
      detached: !IS_WIN,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', BROWSER: 'none' }
    })
    run.child = child
    run.pid = child.pid ?? null
    child.stdout?.on('data', (d: Buffer) => this.push(run, d.toString(), 'out'))
    child.stderr?.on('data', (d: Buffer) => this.push(run, d.toString(), 'err'))
    child.on('error', (e) => {
      run.status = 'failed'
      this.push(run, `Не удалось запустить: ${e.message}\n`, 'sys')
      this.m.bus.emit('dev:status', this.publicRun(run))
    })
    child.on('exit', (code) => {
      run.status = code === 0 || code === null ? 'exited' : 'failed'
      run.exitCode = code
      run.child = null
      this.push(run, `\nПроцесс завершён (код ${code ?? '—'})\n`, 'sys')
      this.m.bus.emit('dev:status', this.publicRun(run))
    })
    this.db
      .update(devProjects)
      .set({ lastOpenedAt: now() })
      .where(eq(devProjects.id, projectId))
      .run()
    this.m.bus.emit('dev:status', this.publicRun(run))
    return this.publicRun(run)
  }

  /* ───────── open in … ───────── */

  private openIn(projectId: string, target: 'vscode' | 'cursor' | 'terminal' | 'folder'): void {
    const p = this.row(projectId)
    this.validFolder(p.path)
    this.db
      .update(devProjects)
      .set({ lastOpenedAt: now() })
      .where(eq(devProjects.id, projectId))
      .run()
    if (target === 'folder') {
      void shell.openPath(p.path)
      return
    }
    const quoted = `"${p.path.replace(/"/g, '')}"`
    const launch = (cmd: string, args: string[], onFail?: () => void): void => {
      const child = spawn(cmd, args, {
        shell: true,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      child.on('error', () => onFail?.())
      child.on('exit', (code) => code && code !== 0 && onFail?.())
      child.unref()
    }
    const fail = (message: string) => () => this.m.bus.emit('toast', { kind: 'error', message })
    if (target === 'vscode')
      launch(
        'code',
        [quoted],
        fail(
          "Команда code не найдена. В VS Code: Ctrl+Shift+P → «Shell Command: Install 'code' command in PATH»."
        )
      )
    else if (target === 'cursor')
      launch(
        'cursor',
        [quoted],
        fail(
          "Команда cursor не найдена. В Cursor: Ctrl+Shift+P → «Install 'cursor' command in PATH»."
        )
      )
    else if (IS_WIN)
      launch('wt', ['-d', quoted], () =>
        launch('cmd', ['/c', 'start', '""', 'cmd', '/K', `cd /d ${quoted}`])
      )
    else
      launch(
        process.platform === 'darwin' ? 'open' : 'x-terminal-emulator',
        process.platform === 'darwin' ? ['-a', 'Terminal', quoted] : ['--working-directory', quoted]
      )
  }

  /** Folders under `root` (and root itself) that look like projects and are not added yet. */
  scan(root: string): { name: string; path: string; hasGit: boolean; hasPackage: boolean }[] {
    this.validFolder(root)
    const known = new Set(
      this.db
        .select({ p: devProjects.path })
        .from(devProjects)
        .all()
        .map((r) => r.p.toLowerCase())
    )
    const candidates = [
      root,
      ...readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
        .map((d) => join(root, d.name))
    ]
    return candidates
      .map((path) => ({
        name: basename(path),
        path,
        hasGit: existsSync(join(path, '.git')),
        hasPackage: existsSync(join(path, 'package.json'))
      }))
      .filter((c) => (c.hasGit || c.hasPackage) && !known.has(c.path.toLowerCase()))
  }

  api(): DevProjectsApi {
    return {
      list: async () => {
        const rows = this.db
          .select()
          .from(devProjects)
          .orderBy(
            desc(devProjects.favorite),
            desc(devProjects.lastOpenedAt),
            asc(devProjects.name)
          )
          .all()
        return Promise.all(rows.map((r) => this.describe(r)))
      },
      get: async (id) => {
        const r = this.db
          .select()
          .from(devProjects)
          .where(eq(devProjects.id, idArg.parse(id)))
          .get()
        return r ? this.describe(r) : null
      },
      create: async (input) => {
        const data = devProjectInputSchema.parse(input)
        this.validFolder(data.path)
        const g = await gitInfo(data.path)
        const ts = now()
        const row = this.db
          .insert(devProjects)
          .values({
            ...data,
            githubRepo: data.githubRepo || githubRepoOf(g?.remoteUrl ?? null),
            id: newId(),
            lastOpenedAt: null,
            createdAt: ts,
            updatedAt: ts
          })
          .returning()
          .get()
        return this.describe(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(devProjectPatchSchema).parse(args)
        if (patch.path) this.validFolder(patch.path)
        const row = this.db
          .update(devProjects)
          .set({ ...patch, updatedAt: now() })
          .where(eq(devProjects.id, id))
          .returning()
          .get()
        if (!row) throw new NotFoundError('Проект', id)
        return this.describe(row)
      },
      remove: async (id) => {
        const pid = idArg.parse(id)
        for (const r of this.runs.values())
          if (r.projectId === pid && r.status === 'running') this.kill(r)
        this.db.delete(devProjects).where(eq(devProjects.id, pid)).run()
      },
      pickFolder: async () => {
        const res = await dialog.showOpenDialog(
          BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0],
          {
            title: 'Выберите папку',
            properties: ['openDirectory']
          }
        )
        return res.canceled ? null : (res.filePaths[0] ?? null)
      },
      scan: async (root) => this.scan(z.string().min(1).max(1000).parse(root)),
      open: async (args) => {
        const { projectId, target } = openInSchema.parse(args)
        this.openIn(projectId, target)
      },
      run: async (args) => {
        const { projectId, script } = runScriptSchema.parse(args)
        return this.start(projectId, script)
      },
      stop: async (runId) => {
        const run = this.runs.get(z.string().parse(runId))
        if (run?.status === 'running') this.kill(run)
      },
      runs: async () =>
        [...this.runs.values()]
          .map((r) => this.publicRun(r))
          .sort((a, b) => b.startedAt - a.startedAt),
      logs: async (runId) => this.runs.get(z.string().parse(runId))?.lines ?? [],
      clearFinished: async () => {
        for (const [id, r] of this.runs) if (r.status !== 'running') this.runs.delete(id)
      }
    }
  }
}
