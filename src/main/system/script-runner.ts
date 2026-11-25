import { spawn, type ChildProcess } from 'child_process'
import type { LogChunk, PackageManager, RunningScript } from '@shared/domain/dev'
import type { EventBus } from '../core/event-bus'
import { newId, now } from '../core/util'

const IS_WIN = process.platform === 'win32'
const MAX_LINES = 3000
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const LOCAL_URL = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+[^\s'"]*)/

interface Run extends RunningScript {
  child: ChildProcess | null
  lines: LogChunk[]
}

/**
 * Runs package.json scripts as child processes with live logs (batched to the renderer) and kills
 * them on request or when the app quits. The caller checks that the script exists and its name is plain.
 */
export class ScriptRunner {
  private readonly runs = new Map<string, Run>()
  private flushTimer: NodeJS.Timeout | null = null
  private pending: LogChunk[] = []

  constructor(private readonly bus: EventBus) {}

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
        this.bus.emit('dev:status', this.publicRun(run))
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
        if (batch.length) this.bus.emit('dev:log', batch)
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

  killProject(projectId: string): void {
    for (const r of this.runs.values()) if (r.projectId === projectId && r.status === 'running') this.kill(r)
  }

  stop(runId: string): void {
    const run = this.runs.get(runId)
    if (run?.status === 'running') this.kill(run)
  }

  running(projectId: string): RunningScript[] {
    return [...this.runs.values()]
      .filter((x) => x.projectId === projectId && x.status === 'running')
      .map((x) => this.publicRun(x))
  }

  list(): RunningScript[] {
    return [...this.runs.values()].map((r) => this.publicRun(r)).sort((a, b) => b.startedAt - a.startedAt)
  }

  logs(runId: string): LogChunk[] {
    return this.runs.get(runId)?.lines ?? []
  }

  clearFinished(): void {
    for (const [id, r] of this.runs) if (r.status !== 'running') this.runs.delete(id)
  }

  /** Starts `pm run script` in `cwd`; the same script already running in the project is returned instead. */
  start(opts: { projectId: string; script: string; cwd: string; pm: PackageManager }): RunningScript {
    const { projectId, script, cwd, pm } = opts
    const already = [...this.runs.values()].find(
      (r) => r.projectId === projectId && r.script === script && r.status === 'running'
    )
    if (already) return this.publicRun(already)
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
    const env = { ...process.env, FORCE_COLOR: '0', BROWSER: 'none' }
    // Windows needs a shell for npm.cmd; with shell the command goes as one string (args + shell is DEP0190).
    // Safe: pm comes from detectPm, the script name is a checked package.json key.
    const child = IS_WIN
      ? spawn(`${pm} run ${script}`, { shell: true, cwd, windowsHide: true, env })
      : spawn(pm, ['run', script], { cwd, shell: false, detached: true, windowsHide: true, env })
    run.child = child
    run.pid = child.pid ?? null
    // A decoder per stream: a multi-byte UTF-8 character split between two chunks stays whole (no «�»).
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (d: string) => this.push(run, d, 'out'))
    child.stderr?.on('data', (d: string) => this.push(run, d, 'err'))
    child.on('error', (e) => {
      run.status = 'failed'
      this.push(run, `Не вдалося запустити: ${e.message}\n`, 'sys')
      this.bus.emit('dev:status', this.publicRun(run))
    })
    child.on('exit', (code) => {
      run.status = code === 0 || code === null ? 'exited' : 'failed'
      run.exitCode = code
      run.child = null
      this.push(run, `\nПроцес завершено (код ${code ?? '—'})\n`, 'sys')
      this.bus.emit('dev:status', this.publicRun(run))
    })
    this.bus.emit('dev:status', this.publicRun(run))
    return this.publicRun(run)
  }
}
