import { net, protocol } from 'electron'
import { join, normalize, relative } from 'path'
import { pathToFileURL } from 'url'
import type { FileStorage } from '../services/file-storage'

/**
 * Custom schemes:
 *  - vault-file://f/<relative path>  → serves user files from the data folder (never arbitrary disk paths)
 *  - app://renderer/<path>           → serves the built renderer in production (instead of file://),
 *    which lets the sandboxed component-preview iframe load its scripts via CORS.
 */
export const FILE_SCHEME = 'vault-file'
export const APP_SCHEME = 'app'

/** Must run before app 'ready'. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FILE_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    },
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true }
    }
  ])
}

const CORS = { 'Access-Control-Allow-Origin': '*' }

async function withHeaders(res: Response, extra: Record<string, string>): Promise<Response> {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(extra)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export function handleFileProtocol(storage: FileStorage): void {
  protocol.handle(FILE_SCHEME, async (request) => {
    try {
      const { pathname } = new URL(request.url)
      const abs = storage.resolve(decodeURIComponent(pathname.replace(/^\/+/, '')))
      // Range is passed on so long videos (designs, up to 300 MB) can seek instead of loading from the start.
      const range = request.headers.get('range')
      const res = await net.fetch(pathToFileURL(abs).toString(), range ? { headers: { Range: range } } : undefined)
      // User files are data, never code: anything except PDF (Chromium's viewer needs scripts) gets a CSP
      // sandbox, so an imported .html/.svg can't run scripts in the vault-file:// origin.
      const isPdf = /\.pdf$/i.test(abs)
      return withHeaders(res, {
        ...CORS,
        'Cache-Control': 'max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        ...(isPdf ? {} : { 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'" })
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

export function handleAppProtocol(rendererDir: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const { host, pathname } = new URL(request.url)
    if (host !== 'renderer') return new Response('Not found', { status: 404 })
    const target = normalize(join(rendererDir, decodeURIComponent(pathname)))
    if (relative(rendererDir, target).startsWith('..')) return new Response('Forbidden', { status: 403 })
    try {
      const res = await net.fetch(pathToFileURL(target).toString())
      return withHeaders(res, CORS)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
