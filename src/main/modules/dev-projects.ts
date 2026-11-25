/**
 * «Мои проекты»: local folders with package.json/git. Opens them in VS Code / Cursor / terminal,
 * runs package.json scripts with live logs (only scripts that exist in package.json — no arbitrary commands),
 * and reads git status (git: services/git-client, processes: system/script-runner).
 */
import { dialog, BrowserWindow, shell } from 'electron'
import { spawn } from 'child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, join } from 'path'
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
  type PackageManager,
  type RunningScript
} from '@shared/domain/dev'
import { devProjects } from '../db/schema'
import { newId, now, NotFoundError, UserError } from '../core/util'
import { githubRepoOf, type GitClient } from '../services/git-client'
import type { ScriptRunner } from '../system/script-runner'
import { idArg, updateArgs, type ModuleContext } from './context'

const IS_WIN = process.platform === 'win32'
const SCRIPT_NAME = /^[\w:.\-@/]+$/

type Row = typeof devProjects.$inferSelect

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

export class DevProjectsModule {
  constructor(
    private readonly m: ModuleContext,
    private readonly gitClient: GitClient,
    private readonly scripts: ScriptRunner
  ) {}

  private get db() {
    return this.m.db.orm
  }

  private row(id: string): Row {
    const r = this.db.select().from(devProjects).where(eq(devProjects.id, id)).get()
    if (!r) throw new NotFoundError('Проєкт', id)
    return r
  }

  private validFolder(path: string): void {
    if (!existsSync(path) || !statSync(path).isDirectory())
      throw new UserError(`Папку не знайдено: ${path}`)
  }

  async describe(r: Row): Promise<DevProject> {
    const exists = existsSync(r.path)
    const pkg = exists ? readPackage(r.path) : null
    const g = exists ? await this.gitClient.info(r.path) : null
    return {
      ...r,
      editor: r.editor as Editor,
      exists,
      packageManager: exists ? detectPm(r.path) : null,
      scripts: pkg?.scripts ?? {},
      framework: pkg ? detectFramework(pkg.deps) : null,
      git: g,
      githubRepo: r.githubRepo || githubRepoOf(g?.remoteUrl ?? null),
      running: this.scripts.running(r.id)
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

  private start(projectId: string, script: string): RunningScript {
    const p = this.row(projectId)
    this.validFolder(p.path)
    const pkg = readPackage(p.path)
    if (!pkg || !(script in pkg.scripts))
      throw new UserError(`У package.json немає скрипту «${script}»`)
    // On Windows the script runs through a shell: only plain script names (package.json keys).
    if (!SCRIPT_NAME.test(script)) throw new UserError(`Назва скрипта «${script}» містить недозволені символи`)
    const run = this.scripts.start({ projectId, script, cwd: p.path, pm: detectPm(p.path) ?? 'npm' })
    this.db.update(devProjects).set({ lastOpenedAt: now() }).where(eq(devProjects.id, projectId)).run()
    return run
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
    // Editors/terminals start through a shell: refuse paths a shell could interpret ($(…), %VAR%, &…).
    if (/["%^&|<>$`!\r\n]/.test(p.path))
      throw new UserError('Шлях до папки містить спецсимволи (" % ^ & | < > $ ` !) — перейменуйте папку, щоб відкрити її звідси.')
    const quoted = `"${p.path}"`
    const launch = (cmd: string, args: string[], onFail?: () => void): void => {
      // One command string: args + shell:true is deprecated (DEP0190). The path is quoted and checked above.
      const child = spawn([cmd, ...args].join(' '), {
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
          "Команду code не знайдено. У VS Code: Ctrl+Shift+P → «Shell Command: Install 'code' command in PATH»."
        )
      )
    else if (target === 'cursor')
      launch(
        'cursor',
        [quoted],
        fail(
          "Команду cursor не знайдено. У Cursor: Ctrl+Shift+P → «Install 'cursor' command in PATH»."
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
        const g = await this.gitClient.info(data.path)
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
        if (!row) throw new NotFoundError('Проєкт', id)
        return this.describe(row)
      },
      remove: async (id) => {
        const pid = idArg.parse(id)
        this.scripts.killProject(pid)
        this.db.delete(devProjects).where(eq(devProjects.id, pid)).run()
      },
      pickFolder: async () => {
        const res = await dialog.showOpenDialog(
          BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0],
          {
            title: 'Оберіть папку',
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
      stop: async (runId) => this.scripts.stop(z.string().parse(runId)),
      runs: async () => this.scripts.list(),
      logs: async (runId) => this.scripts.logs(z.string().parse(runId)),
      clearFinished: async () => this.scripts.clearFinished()
    }
  }
}
