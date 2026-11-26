/**
 * «Папка для копій»: the second copy of a backup in a folder the person chose (another disk, OneDrive, Google
 * Drive). The folder is theirs, so the rules are strict:
 * - only files this installation wrote are ever removed: `vault-<host>-<id>-<stamp>.vaultbak` with its own host
 *   and id (two computers sharing one cloud folder never rotate each other's copies), directly in the folder —
 *   no subfolders, no links, no other names;
 * - a copy is written as `….vaultbak.part` and renamed when complete: a crash or a cloud client never sees a half
 *   file under a backup's name;
 * - a missing folder is an error, never re-created (an unplugged D: must not become a new folder elsewhere).
 * Async fs only: a network or cloud folder that hangs must not freeze the main process. No Electron.
 */
import { lstat, open, readdir, realpath, rename, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { isInside } from './storage-usage'
import { isBusyError, now, UserError } from '../core/util'

export const BACKUP_EXT = 'vaultbak'
/** Local time to the second, the same as the names in Vault's own backups folder. */
const STAMP = String.raw`\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}`
/** A «.part» older than this was left by a quit or a crash mid-copy. */
const STALE_PART_MS = 60 * 60_000

export interface MachineTag {
  /** Computer name, reduced to `[a-z0-9-]` (shows whose copy it is). */
  host: string
  /** 8 hex chars kept in config.json: two computers with the same name still differ. */
  id: string
}

export function machineTag(hostname: string, id: string): MachineTag {
  const host =
    hostname
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24)
      .replace(/-+$/, '') || 'pc'
  return { host, id }
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function copyName(tag: MachineTag, stamp: string): string {
  return `vault-${tag.host}-${tag.id}-${stamp}.${BACKUP_EXT}`
}

/** Exactly this installation's finished copies; the stamp is group 1. */
export function ownCopyPattern(tag: MachineTag): RegExp {
  return new RegExp(`^${escape(`vault-${tag.host}-${tag.id}-`)}(${STAMP})\\.${BACKUP_EXT}$`)
}

const ownPartPattern = (tag: MachineTag): RegExp =>
  new RegExp(`^${escape(`vault-${tag.host}-${tag.id}-`)}${STAMP}\\.${BACKUP_EXT}\\.part$`)

const code = (e: unknown): string => (e as NodeJS.ErrnoException | undefined)?.code ?? ''

/** Words for the person: what is wrong with the folder and what to do. The cause goes to the log. */
export function folderErrorMessage(e: unknown, dir: string): string {
  if (e instanceof UserError) return e.message
  const c = code(e)
  if (c === 'ENOENT' || c === 'ENOTDIR' || c === 'ENODEV' || c === 'EHOSTUNREACH' || c === 'ENOTCONN')
    return unavailableMessage(dir)
  if (c === 'ENOSPC') return `На диску з папкою ${dir} закінчилося місце.`
  if (c === 'EACCES' || c === 'EPERM' || c === 'EROFS')
    return `Vault не може записати в папку ${dir} — перевірте доступ до неї.`
  return `Не вдалося записати в папку ${dir} — подробиці в журналі.`
}

const unavailableMessage = (dir: string): string =>
  `Папка ${dir} недоступна — підключіть диск або запустіть OneDrive чи Google Drive.`

/**
 * The folder exists, is a folder and is not inside Vault's own folders (the real path too: a junction into the
 * data folder is refused like the folder itself). Nothing is created.
 */
export async function assertUsableFolder(dir: string, vaultDirs: string[]): Promise<void> {
  let st
  try {
    st = await stat(dir)
  } catch (e) {
    if (['ENOENT', 'ENOTDIR', 'ENODEV', 'EHOSTUNREACH', 'ENOTCONN'].includes(code(e)))
      throw new UserError(unavailableMessage(dir))
    throw e
  }
  if (!st.isDirectory()) throw new UserError(unavailableMessage(dir))
  const real = await realpath(dir)
  if (vaultDirs.some((v) => isInside(dir, v) || isInside(real, v)))
    throw new UserError(
      'Ця папка всередині папки даних Vault — виберіть іншу: на іншому диску або в OneDrive чи Google Drive.'
    )
}

/** Writes a small file and removes it: picking a folder Vault can't write to fails at once, not at night. */
export async function assertWritable(dir: string, tag: MachineTag): Promise<void> {
  const probe = join(dir, `.vault-write-check-${tag.id}-${Date.now()}.tmp`)
  const fh = await open(probe, 'wx')
  try {
    await fh.writeFile('ok')
  } finally {
    await fh.close()
  }
  await unlink(probe)
}

async function retryBusyAsync<T>(fn: () => Promise<T>, tries = 5, pauseMs = 300): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      // A cloud client or an antivirus holds the new file for a moment.
      if (attempt >= tries || !isBusyError(e)) throw e
      await new Promise((r) => setTimeout(r, pauseMs))
    }
  }
}

/**
 * `<dir>/<name>.part` → flushed to disk → renamed to `<name>`. An existing copy of that name is never replaced
 * (EEXIST). On any failure the «.part» is removed. Returns the copy's path.
 */
export async function writeCopy(dir: string, name: string, bytes: Uint8Array): Promise<string> {
  const target = join(dir, name)
  const part = `${target}.part`
  try {
    const fh = await open(part, 'wx')
    try {
      await fh.writeFile(bytes)
      await fh.sync()
    } finally {
      await fh.close()
    }
    if (await exists(target)) throw Object.assign(new Error(`${name} exists`), { code: 'EEXIST' })
    await retryBusyAsync(() => rename(part, target))
    return target
  } catch (e) {
    await unlink(part).catch(() => undefined)
    throw e
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (e) {
    if (code(e) === 'ENOENT') return false
    throw e
  }
}

/** A plain file (not a link, not a folder) — checked again right before removing it. */
async function isPlainFile(path: string): Promise<boolean> {
  const st = await lstat(path)
  return st.isFile() && !st.isSymbolicLink()
}

/**
 * Keeps the newest `keep` copies of this installation (newest by the stamp in the name: a cloud client may change
 * the mtime) and removes the older ones; also its own «.part» files older than an hour. Never anything else.
 * Returns the removed names.
 */
export async function rotateCopies(dir: string, tag: MachineTag, keep: number): Promise<string[]> {
  const own = ownCopyPattern(tag)
  const ownPart = ownPartPattern(tag)
  const entries = await readdir(dir, { withFileTypes: true })
  const copies = entries
    .filter((e) => e.isFile() && own.test(e.name))
    .map((e) => ({ name: e.name, stamp: own.exec(e.name)![1] }))
    .sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0))
  const removed: string[] = []
  for (const c of copies.slice(Math.max(1, keep))) {
    const abs = join(dir, c.name)
    if (!(await isPlainFile(abs))) continue
    await unlink(abs)
    removed.push(c.name)
  }
  for (const e of entries) {
    if (!e.isFile() || !ownPart.test(e.name)) continue
    const abs = join(dir, e.name)
    const st = await lstat(abs)
    if (st.isFile() && now() - st.mtimeMs > STALE_PART_MS) {
      await unlink(abs)
      removed.push(e.name)
    }
  }
  return removed
}

/** Removes one copy this installation has just written (it failed the check). Only a name of its own. */
export async function removeOwnCopy(dir: string, tag: MachineTag, name: string): Promise<void> {
  if (!ownCopyPattern(tag).test(name)) return
  const abs = join(dir, name)
  if (await isPlainFile(abs).catch(() => false)) await unlink(abs)
}
