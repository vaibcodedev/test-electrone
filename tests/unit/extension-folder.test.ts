import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

import { ExtensionFolder } from '@main/services/extension-folder'
import { chromeCandidates, findChrome, parseRegDefault } from '@main/system/browser-launcher'

let root = ''
let bundled = ''
let stable = ''

function writeExtension(dir: string, version: string, extra: Record<string, string> = {}): void {
  mkdirSync(join(dir, 'icons'), { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ version }))
  writeFileSync(join(dir, 'popup.js'), `// ${version}`)
  writeFileSync(join(dir, 'icons', 'icon-16.png'), version)
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(dir, name), text)
}

const versionIn = (dir: string): string =>
  (JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { version: string }).version

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vault-ext-folder-'))
  bundled = join(root, 'resources', 'extension')
  stable = join(root, 'userData', 'extension')
  mkdirSync(join(root, 'userData'), { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('ExtensionFolder', () => {
  it('copies the bundled extension into a missing stable folder', async () => {
    writeExtension(bundled, '0.3.0')
    const folder = new ExtensionFolder({ bundledDir: bundled, stableDir: stable, canWrite: true })
    expect(folder.dir).toBe(bundled)
    expect(await folder.sync()).toBe('copied')
    expect(versionIn(stable)).toBe('0.3.0')
    expect(readFileSync(join(stable, 'icons', 'icon-16.png'), 'utf8')).toBe('0.3.0')
    expect(folder.dir).toBe(stable)
    expect(folder.version).toBe('0.3.0')
    // Nothing half-done is left next to it.
    expect(readdirSync(join(root, 'userData'))).toEqual(['extension'])
  })

  it('leaves the same version alone', async () => {
    writeExtension(bundled, '0.3.0')
    writeExtension(stable, '0.3.0', { 'local.txt': 'kept' })
    const folder = new ExtensionFolder({ bundledDir: bundled, stableDir: stable, canWrite: true })
    expect(await folder.sync()).toBe('current')
    expect(existsSync(join(stable, 'local.txt'))).toBe(true)
  })

  it('replaces an older version whole, files dropped in the new one included', async () => {
    writeExtension(bundled, '0.3.1')
    writeExtension(stable, '0.3.0', { 'old-only.js': 'gone' })
    const folder = new ExtensionFolder({ bundledDir: bundled, stableDir: stable, canWrite: true })
    expect(await folder.sync()).toBe('copied')
    expect(versionIn(stable)).toBe('0.3.1')
    expect(readFileSync(join(stable, 'popup.js'), 'utf8')).toBe('// 0.3.1')
    expect(existsSync(join(stable, 'old-only.js'))).toBe(false)
    expect(readdirSync(join(root, 'userData'))).toEqual(['extension'])
  })

  it('cleans what a start cut short left behind', async () => {
    writeExtension(bundled, '0.3.0')
    writeExtension(`${stable}.tmp-1-2`, '0.2.0')
    writeExtension(`${stable}.old-1-2`, '0.1.0')
    const folder = new ExtensionFolder({ bundledDir: bundled, stableDir: stable, canWrite: true })
    expect(await folder.sync()).toBe('copied')
    expect(readdirSync(join(root, 'userData'))).toEqual(['extension'])
  })

  it('never writes from the test profile, only reads the real folder', async () => {
    writeExtension(bundled, '0.3.1')
    writeExtension(stable, '0.3.0')
    const folder = new ExtensionFolder({ bundledDir: bundled, stableDir: stable, canWrite: false })
    expect(await folder.sync()).toBe('skipped')
    expect(versionIn(stable)).toBe('0.3.0')
    expect(folder.dir).toBe(stable)
    rmSync(stable, { recursive: true })
    expect(await folder.sync()).toBe('skipped')
    expect(existsSync(stable)).toBe(false)
    expect(folder.dir).toBe(bundled)
  })

  it('skips without a bundled manifest and keeps the old copy', async () => {
    writeExtension(stable, '0.3.0')
    const folder = new ExtensionFolder({ bundledDir: bundled, stableDir: stable, canWrite: true })
    expect(await folder.sync()).toBe('skipped')
    expect(versionIn(stable)).toBe('0.3.0')
  })

  it('runs one sync at a time', async () => {
    writeExtension(bundled, '0.3.0')
    const folder = new ExtensionFolder({ bundledDir: bundled, stableDir: stable, canWrite: true })
    const [a, b] = await Promise.all([folder.sync(), folder.sync()])
    expect([a, b]).toEqual(['copied', 'copied'])
    expect(await folder.sync()).toBe('current')
  })

  it('reads the pinned id from the bundled manifest key', () => {
    mkdirSync(bundled, { recursive: true })
    writeFileSync(join(bundled, 'manifest.json'), readFileSync('extension/manifest.json'))
    const folder = new ExtensionFolder({ bundledDir: bundled, stableDir: stable, canWrite: true })
    expect(folder.extensionId).toBe('ighcmeieigdefhjpidfbcainaoopopbk')
  })
})

describe('browser launcher: finding Chrome', () => {
  it('reads the App Paths default value', () => {
    const out =
      '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe\r\n    (Default)    REG_SZ    C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\r\n\r\n'
    expect(parseRegDefault(out)).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    expect(parseRegDefault('    (За замовчуванням)    REG_SZ    "D:\\Chrome\\chrome.exe"')).toBe(
      'D:\\Chrome\\chrome.exe'
    )
    expect(
      parseRegDefault('ERROR: The system was unable to find the specified registry key')
    ).toBeNull()
  })

  it('prefers the registry, then the usual folders, and says when there is none', async () => {
    const reg = 'C:\\Chrome\\chrome.exe'
    expect(
      await findChrome({
        platform: 'win32',
        registry: async (root) => (root === 'HKLM' ? reg : null),
        exists: (p) => p === reg
      })
    ).toBe(reg)
    const local = chromeCandidates('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' })[0]
    expect(local).toMatch(/Google[\\/]Chrome[\\/]Application[\\/]chrome\.exe$/)
    // A registry entry pointing at a removed Chrome is skipped.
    expect(
      await findChrome({
        platform: 'win32',
        registry: async () => reg,
        exists: (p) => p.endsWith('chrome.exe') && p !== reg && p.includes('Program Files')
      })
    ).toMatch(/Program Files/)
    expect(
      await findChrome({ platform: 'win32', registry: async () => null, exists: () => false })
    ).toBeNull()
  })
})
