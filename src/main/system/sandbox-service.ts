import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import type { SandboxApi } from '@shared/api'
import type { ProfileKind, SandboxInfo } from '@shared/domain/sandbox'
import type { SeedLedger } from '../core/config-store'
import type { EventBus } from '../core/event-bus'
import { log } from '../core/logger'
import {
  canRelaunch,
  dirSize,
  relaunchArgs,
  removeSandbox,
  type Profile
} from '../core/profile'
import { UserError } from '../core/util'
import { DEMO_SEED_KEY, type DemoSeedService } from '../services/demo-seed'

export type Relaunch = (args: string[]) => void

/**
 * The real relaunch: the lock goes first (the new instance must get it), then a new process with `args`,
 * then this one exits without before-quit/will-quit (dispose() has already closed everything).
 */
export const electronRelaunch: Relaunch = (args) => {
  app.releaseSingleInstanceLock()
  app.relaunch({ args })
  app.exit(0)
}

/** Time for the RPC answer to reach the window before the process goes away. */
const RELAUNCH_DELAY_MS = 50
const BUSY_MESSAGE = 'Зачекайте, поки завершиться бекап або відновлення, і спробуйте ще раз'
/**
 * The test folder's size stays valid this long unless the folder's mtime changes first. From the main profile
 * the folder only changes by «Очистити» (which drops the cache) or by a sandbox run, so a long TTL is safe.
 */
const SIZE_TTL_MS = 60_000

export interface SandboxDeps {
  profile: Profile
  ledger: SeedLedger
  backup: { isBusy(): boolean }
  scripts: { runningCount(): number }
  updater: { holdInstall(): void }
  bus: EventBus
  /** Container.dispose(): idempotent, each step on its own. */
  dispose: () => void
  demo: Pick<DemoSeedService, 'fill'>
  /** Injected in tests; electronRelaunch otherwise. */
  relaunch?: Relaunch
  /** app.isPackaged; injected in tests. */
  isPackaged?: boolean
  argv?: readonly string[]
}

/** «Тестовий режим»: switching profiles (a relaunch), clearing the test folder, demo data. */
export class SandboxService {
  private switching = false
  private size: { bytes: number; at: number; mtime: number } | null = null
  private sizing: Promise<number> | null = null

  constructor(private readonly deps: SandboxDeps) {}

  private get kind(): ProfileKind {
    return this.deps.profile.kind
  }

  private get canSwitch(): boolean {
    return canRelaunch(this.deps.isPackaged ?? app.isPackaged)
  }

  async info(): Promise<SandboxInfo> {
    const { profile, ledger, scripts } = this.deps
    const dir = profile.sandboxUserData
    const exists = existsSync(dir)
    const main = this.kind === 'main'
    return {
      profile: this.kind,
      dir,
      exists,
      // Main only, async and cached: every mutation refetches active queries, and the folder holds
      // thousands of Chromium cache files — walking them on every toggle in Налаштування loads the CPU.
      sizeBytes: main ? (exists ? await this.sandboxSize(dir) : 0) : null,
      canSwitch: this.canSwitch,
      demoFilled: !main && ledger.isSeeded(DEMO_SEED_KEY),
      runningScripts: scripts.runningCount(),
      mainBackupsDir: main ? null : join(profile.mainUserData, 'data', 'backups')
    }
  }

  /** dirSize with a TTL + mtime fingerprint and one shared walk for concurrent requests. */
  private sandboxSize(dir: string): Promise<number> {
    let mtime: number
    try {
      mtime = statSync(dir).mtimeMs
    } catch {
      return Promise.resolve(0)
    }
    const c = this.size
    if (c && c.mtime === mtime && Date.now() - c.at < SIZE_TTL_MS) return Promise.resolve(c.bytes)
    if (this.sizing) return this.sizing
    const job = dirSize(dir)
      .then((bytes) => {
        if (this.sizing === job) this.size = { bytes, at: Date.now(), mtime }
        return bytes
      })
      .finally(() => {
        if (this.sizing === job) this.sizing = null
      })
    this.sizing = job
    return job
  }

  private dropSize(): void {
    this.size = null
    this.sizing = null
  }

  private guard(target: ProfileKind): void {
    if (!this.canSwitch) {
      throw new UserError(
        target === 'sandbox'
          ? 'У режимі розробки перезапуск не працює — закрийте Vault і запустіть npm run dev -- -- --vault-sandbox'
          : 'У режимі розробки перезапуск не працює — закрийте Vault і запустіть npm run dev'
      )
    }
    if (this.switching) throw new UserError('Vault уже перезапускається')
    if (this.deps.backup.isBusy()) throw new UserError(BUSY_MESSAGE)
  }

  enter(): void {
    if (this.kind === 'sandbox') throw new UserError('Тестовий режим уже ввімкнено')
    this.guard('sandbox')
    this.switchTo('sandbox')
  }

  exit(): void {
    if (this.kind === 'main') throw new UserError('Тестовий режим не ввімкнено')
    this.guard('main')
    this.switchTo('main')
  }

  /** Main: removes the test folder now. Sandbox: relaunches into itself with the reset flag. */
  clear(): void {
    if (this.kind === 'main') {
      if (this.switching) throw new UserError('Vault уже перезапускається')
      try {
        removeSandbox(this.deps.profile)
      } finally {
        this.dropSize()
      }
      return
    }
    this.guard('sandbox')
    this.switchTo('sandbox', { reset: true })
  }

  async fillDemo(): Promise<{ created: number }> {
    return this.deps.demo.fill(this.kind)
  }

  private switchTo(target: ProfileKind, opts: { reset?: boolean } = {}): void {
    this.switching = true
    const args = relaunchArgs(this.deps.argv ?? process.argv, target, opts)
    setTimeout(() => {
      // An automatic backup may have started during the delay: it must finish before the database closes.
      if (this.deps.backup.isBusy()) {
        this.switching = false
        this.deps.bus.emit('toast', { kind: 'error', message: BUSY_MESSAGE })
        return
      }
      log.info(`[sandbox] relaunch → ${target}${opts.reset ? ' (reset)' : ''}`)
      if (this.kind === 'main') this.deps.updater.holdInstall()
      try {
        this.deps.dispose()
      } catch (e) {
        log.error('[sandbox] dispose', e)
      }
      ;(this.deps.relaunch ?? electronRelaunch)(args)
    }, RELAUNCH_DELAY_MS)
  }

  api(): SandboxApi {
    return {
      info: () => this.info(),
      enter: async () => this.enter(),
      exit: async () => this.exit(),
      clear: async () => this.clear(),
      fillDemo: () => this.fillDemo()
    }
  }
}
