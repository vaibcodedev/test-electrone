/**
 * Opens chrome://extensions for «Встановити розширення». shell.openExternal cannot open chrome:// pages
 * (Windows has no handler for that scheme), so Chrome itself is started with the URL: an already running
 * Chrome opens it as a new tab. Chrome is looked up in the App Paths registry key, then in the usual folders.
 */
import { execFile, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { log } from '../core/logger'

export const EXTENSIONS_PAGE = 'chrome://extensions/'

const APP_PATHS = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe'

/** `reg query <key> /ve` output → the default value (a path, maybe quoted), or null. */
export function parseRegDefault(stdout: string): string | null {
  const m = stdout.match(/^\s*\(.+?\)\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m)
  return m ? m[1].replace(/^"(.*)"$/, '$1') : null
}

/** Usual install folders when the registry says nothing (per-user installs live in LocalAppData). */
export function chromeCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (platform === 'win32') {
    const tail = join('Google', 'Chrome', 'Application', 'chrome.exe')
    return [env['ProgramFiles'], env['ProgramFiles(x86)'], env['LOCALAPPDATA']]
      .filter((d): d is string => !!d)
      .map((d) => join(d, tail))
  }
  if (platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium']
}

function regDefault(root: 'HKCU' | 'HKLM'): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', `${root}\\${APP_PATHS}`, '/ve'],
      { windowsHide: true, timeout: 3000 },
      (err, stdout) => resolve(err ? null : parseRegDefault(String(stdout)))
    )
  })
}

export interface BrowserDeps {
  platform?: NodeJS.Platform
  exists?: (path: string) => boolean
  registry?: (root: 'HKCU' | 'HKLM') => Promise<string | null>
}

/** Path to chrome(.exe), or null when Chrome is not installed where we look. */
export async function findChrome(deps: BrowserDeps = {}): Promise<string | null> {
  const platform = deps.platform ?? process.platform
  const exists = deps.exists ?? existsSync
  const registry = deps.registry ?? regDefault
  if (platform === 'win32') {
    for (const root of ['HKCU', 'HKLM'] as const) {
      const path = await registry(root)
      if (path && exists(path)) return path
    }
  }
  return chromeCandidates(platform).find((p) => exists(p)) ?? null
}

/** Starts Chrome on chrome://extensions. False when Chrome was not found or did not start. */
export async function openChromeExtensions(deps: BrowserDeps = {}): Promise<boolean> {
  const chrome = await findChrome(deps)
  if (!chrome) return false
  return new Promise((resolve) => {
    try {
      const child = spawn(chrome, [EXTENSIONS_PAGE], { detached: true, stdio: 'ignore' })
      child.once('error', (e) => {
        log.warn('[extension] chrome', e)
        resolve(false)
      })
      child.once('spawn', () => {
        child.unref()
        resolve(true)
      })
    } catch (e) {
      log.warn('[extension] chrome', e)
      resolve(false)
    }
  })
}
