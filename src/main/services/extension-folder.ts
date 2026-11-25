/**
 * The unpacked extension Chrome loads lives in a stable folder outside the install dir (`<userData>/extension`
 * of the REAL profile): an update of Vault replaces the install dir, this folder only gets a fresh copy.
 *
 * - On start Vault copies the bundled `extension/` there when the manifest versions differ (or the folder is
 *   missing): into a temp folder first, then two renames, so Chrome never reads a half-copied extension.
 * - The extension sees the new version in /ping and reloads itself (chrome.runtime.reload re-reads the folder).
 * - The test profile («Тестовий режим») never writes here: `canWrite` is false and it only reads the folder.
 * Failures are logged and never stop the start: the old copy keeps working.
 */
import { existsSync, readFileSync } from 'fs'
import { cp, readdir, rename, rm } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { log } from '../core/logger'
import { extensionIdFromKey } from './extension-pairing'

export type SyncResult = 'copied' | 'current' | 'skipped' | 'failed'

interface Manifest {
  version: string | null
  key: string | null
}

function readManifest(dir: string): Manifest | null {
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<
      string,
      unknown
    >
    return {
      version: typeof raw.version === 'string' ? raw.version : null,
      key: typeof raw.key === 'string' ? raw.key : null
    }
  } catch {
    return null
  }
}

export interface ExtensionFolderOptions {
  /** The copy shipped with Vault (resources/extension, or the repo's extension/ in development). */
  bundledDir: string
  /** `<real userData>/extension`. */
  stableDir: string
  /** False in «Тестовий режим»: it must not replace the folder the real Chrome extension runs from. */
  canWrite: boolean
}

export class ExtensionFolder {
  private syncing: Promise<SyncResult> | null = null

  constructor(private readonly opts: ExtensionFolderOptions) {}

  get bundledVersion(): string | null {
    return readManifest(this.opts.bundledDir)?.version ?? null
  }

  /** The folder to give Chrome: the stable one once it holds an extension, the bundled one until then. */
  get dir(): string {
    return readManifest(this.opts.stableDir) ? this.opts.stableDir : this.opts.bundledDir
  }

  /** Version of the extension in `dir`: what a reload in Chrome would load. */
  get version(): string | null {
    return readManifest(this.dir)?.version ?? null
  }

  /** The id Chrome gives the extension Vault ships (from its manifest `key`), or null without a key. */
  get extensionId(): string | null {
    const key = readManifest(this.opts.bundledDir)?.key
    return key ? extensionIdFromKey(key) : null
  }

  /** Brings the stable folder up to the bundled version. One run at a time; never throws. */
  sync(): Promise<SyncResult> {
    this.syncing ??= this.run().finally(() => {
      this.syncing = null
    })
    return this.syncing
  }

  private async run(): Promise<SyncResult> {
    const { bundledDir, stableDir, canWrite } = this.opts
    const bundled = readManifest(bundledDir)
    if (!canWrite || !bundled?.version) {
      if (canWrite) log.warn(`[extension] no bundled manifest in ${bundledDir}`)
      return 'skipped'
    }
    try {
      await this.removeLeftovers()
      if (readManifest(stableDir)?.version === bundled.version) return 'current'
      const stamp = `${process.pid}-${Date.now()}`
      const tmp = `${stableDir}.tmp-${stamp}`
      await cp(bundledDir, tmp, { recursive: true })
      if (!existsSync(stableDir)) {
        await rename(tmp, stableDir)
      } else {
        await this.swap(tmp, `${stableDir}.old-${stamp}`)
      }
      log.info(`[extension] ${stableDir} → ${bundled.version}`)
      return 'copied'
    } catch (e) {
      log.error('[extension] sync', e)
      return 'failed'
    }
  }

  /**
   * Old folder aside, new one in its place, old one removed. When Chrome holds a file and Windows refuses
   * the rename, the files are copied over in place instead (a file dropped in the new version may stay).
   */
  private async swap(tmp: string, old: string): Promise<void> {
    const { stableDir } = this.opts
    try {
      await rename(stableDir, old)
    } catch (e) {
      log.warn('[extension] folder busy, copying over it', e)
      await cp(tmp, stableDir, { recursive: true, force: true })
      await rm(tmp, { recursive: true, force: true })
      return
    }
    try {
      await rename(tmp, stableDir)
    } catch (e) {
      // Put the old copy back: an extension that worked is better than none.
      await rename(old, stableDir).catch((back) => log.error('[extension] restore', back))
      throw e
    }
    await rm(old, { recursive: true, force: true }).catch((e) => log.warn('[extension] cleanup', e))
  }

  /** `extension.tmp-*` / `extension.old-*` from a start that was cut short. */
  private async removeLeftovers(): Promise<void> {
    const { stableDir } = this.opts
    const name = basename(stableDir)
    let entries: string[]
    try {
      entries = await readdir(dirname(stableDir))
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.startsWith(`${name}.tmp-`) && !e.startsWith(`${name}.old-`)) continue
      await rm(join(dirname(stableDir), e), { recursive: true, force: true }).catch((err) =>
        log.warn('[extension] leftover', err)
      )
    }
  }
}
