import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import type { GitInfo } from '@shared/domain/dev'

const execFileAsync = promisify(execFile)
/** Short cache: lists refresh after every mutation; three git processes per project each time is too much. */
const GIT_TTL_MS = 15_000

/** owner/repo from a GitHub remote URL (https or ssh). */
export function githubRepoOf(remote: string | null): string {
  if (!remote) return ''
  const m = remote.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i)
  return m ? `${m[1]}/${m[2]}` : ''
}

/** Read-only git of local project folders (status, last commit, remote, commit counts). */
export class GitClient {
  private readonly cache = new Map<string, { at: number; out: string | null }>()

  private async git(path: string, args: string[]): Promise<string | null> {
    const key = `${path}|${args.join(' ')}`
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < GIT_TTL_MS) return hit.out
    // A scanned folder may come from an untrusted archive: its .git/config must not run commands.
    const out = await execFileAsync(
      'git',
      ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', '-C', path, ...args],
      { timeout: 4000, windowsHide: true }
    ).then(
      (r) => r.stdout,
      () => null
    )
    this.cache.set(key, { at: Date.now(), out })
    return out
  }

  async info(path: string): Promise<GitInfo | null> {
    if (!existsSync(join(path, '.git'))) return null
    const [status, log, remote] = await Promise.all([
      this.git(path, ['status', '--porcelain=v2', '--branch']),
      this.git(path, ['log', '-1', '--format=%H%x1f%s%x1f%an%x1f%ct']),
      this.git(path, ['remote', 'get-url', 'origin'])
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

  /** Commits in all folders between two dates (for the weekly review). */
  async commitsBetween(paths: string[], from: number, to: number): Promise<number> {
    let total = 0
    for (const p of paths) {
      const out = await this.git(p, [
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
}
