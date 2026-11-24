import { log } from '../core/logger'
import { fieldMax, MAX } from '@shared/domain/limits'
import { libraryInputSchema } from '@shared/domain/libraries'
import { UserError } from '../core/util'
import { formatError } from '../ipc/rpc'
import { app, Notification, net } from 'electron'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { join } from 'path'
import type { Api } from '@shared/api'
import { captureSchema, type CaptureInfo, type CaptureInput } from '@shared/domain/dev'
import type { FileSource } from '@shared/domain/designs'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import type { ConfigStore } from '../core/config-store'
import type { EventBus } from '../core/event-bus'

const MAX_BODY = 30 * 1024 * 1024

/**
 * Local bridge for the Vault Chrome extension.
 * - listens on 127.0.0.1 only (never the network);
 * - every request must carry the secret key shown in Settings (X-Vault-Key), compared in constant time;
 * - only chrome-extension:// origins get CORS headers.
 */

/** Host without «www.»; never throws (a URL saved without a scheme gets https:// for parsing). */
function hostOf(url: string): string {
  try {
    return new URL(/^[a-z][\w+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const clip = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text)
const PURPOSE_MAX = fieldMax(libraryInputSchema.shape.purpose)

export class CaptureServer {
  private server: Server | null = null
  private listening = false

  constructor(
    private readonly config: ConfigStore,
    private readonly api: () => Api,
    private readonly bus: EventBus,
    private readonly openRoute: (route: string) => void,
    private readonly icon: string
  ) {
    config.onSettingsChange(() => this.restart())
  }

  token(): string {
    let t = this.config.secret('captureKey')
    if (!t) {
      t = randomBytes(24).toString('base64url')
      this.config.setSecret('captureKey', t)
    }
    return t
  }

  regenerate(): string {
    this.config.setSecret('captureKey', null)
    return this.token()
  }

  get extensionDir(): string {
    return app.isPackaged ? join(process.resourcesPath, 'extension') : join(app.getAppPath(), 'extension')
  }

  info(): CaptureInfo {
    const s = this.config.settings
    return { enabled: s.captureEnabled, port: s.capturePort, token: this.token(), extensionDir: this.extensionDir, running: this.listening }
  }

  start(): void {
    const s = this.config.settings
    if (!s.captureEnabled || this.server) return
    this.server = createServer((req, res) => void this.handle(req, res))
    this.server.on('error', (e) => {
      log.error('[capture]', e)
      this.listening = false
    })
    this.server.listen(s.capturePort, '127.0.0.1', () => {
      this.listening = true
    })
  }

  stop(): void {
    this.server?.close()
    this.server = null
    this.listening = false
  }

  private restart(): void {
    const s = this.config.settings
    const port = (this.server?.address() as { port?: number } | null)?.port
    if (!s.captureEnabled) return this.stop()
    if (port !== s.capturePort) {
      this.stop()
      this.start()
    }
  }

  private cors(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin ?? ''
    if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Vault-Key')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Vary', 'Origin')
    }
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }

  private authorized(req: IncomingMessage): boolean {
    const given = Buffer.from(String(req.headers['x-vault-key'] ?? ''))
    const expected = Buffer.from(this.token())
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY) {
          reject(new Error('Завеликий запит'))
          req.destroy()
        } else chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.cors(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (!this.authorized(req)) return this.json(res, 401, { ok: false, error: 'Невірний ключ — скопіюйте його у Vault: Налаштування → Розширення' })
    try {
      if (req.method === 'GET' && req.url === '/ping') return this.json(res, 200, { ok: true, app: 'vault', version: app.getVersion() })
      if (req.method === 'POST' && req.url === '/capture') {
        const input = captureSchema.parse(JSON.parse(await this.readBody(req)))
        const saved = await this.capture(input)
        this.bus.dataChanged('all')
        const n = new Notification({ title: 'Збережено у Vault', body: `${ENTITY_META[saved.type].label}: ${saved.title}`, icon: this.icon })
        n.on('click', () => this.openRoute(ENTITY_META[saved.type].route(saved.id)))
        n.show()
        return this.json(res, 200, { ok: true, ...saved })
      }
      return this.json(res, 404, { ok: false, error: 'Not found' })
    } catch (e) {
      // Same wording as the app (zod issues → «Назва: занадто довго…»), never a raw JSON dump in the popup.
      return this.json(res, 400, { ok: false, error: formatError(e).error })
    }
  }

  private screenshotSource(dataUrl: string | null, name: string): FileSource | null {
    if (!dataUrl) return null
    const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/)
    if (!m) return null
    const ext = m[1] === 'image/jpeg' ? 'jpg' : m[1].split('/')[1]
    return { kind: 'bytes', name: `${name}.${ext}`, mime: m[1], data: new Uint8Array(Buffer.from(m[2], 'base64')) }
  }

  private async tagIds(names: string[]): Promise<string[]> {
    const ids: string[] = []
    for (const name of names) ids.push((await this.api().tags.create({ name })).id)
    return ids
  }

  /** npm / GitHub page → library fields (+ description from the npm registry when available). */
  private async libraryFrom(url: string, title: string): Promise<{ name: string; npmUrl: string; githubUrl: string; installCmd: string; purpose: string }> {
    const u = new URL(url)
    let name = title.replace(/\s*[-|·].*$/, '').trim()
    let npmUrl = ''
    let githubUrl = ''
    if (u.hostname.endsWith('npmjs.com')) {
      const m = u.pathname.match(/^\/package\/((?:@[^/]+\/)?[^/]+)/)
      if (m) {
        name = decodeURIComponent(m[1])
        npmUrl = `https://www.npmjs.com/package/${m[1]}`
      }
    } else if (u.hostname === 'github.com') {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)/)
      if (m) {
        name = m[2]
        githubUrl = `https://github.com/${m[1]}/${m[2]}`
      }
    }
    let purpose = ''
    try {
      const r = await net.fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, { headers: { Accept: 'application/vnd.npm.install-v1+json' } })
      if (r.ok) {
        const j = (await r.json()) as { description?: string; repository?: { url?: string } }
        // npm descriptions have no length limit; the library field does.
        purpose = clip((j.description ?? '').trim(), PURPOSE_MAX)
        if (!npmUrl) npmUrl = `https://www.npmjs.com/package/${name}`
        if (!githubUrl && j.repository?.url) githubUrl = j.repository.url.replace(/^git\+/, '').replace(/\.git$/, '').replace('git://', 'https://')
      }
    } catch {
      /* offline or not an npm package */
    }
    return { name, npmUrl, githubUrl, installCmd: npmUrl ? `npm i ${name}` : '', purpose }
  }

  private async capture(raw: CaptureInput): Promise<{ type: EntityType; id: string; title: string }> {
    const input = captureSchema.parse(raw)
    const api = this.api()
    const tagIds = await this.tagIds(input.tags)
    const shot = this.screenshotSource(input.screenshot, 'screenshot')
    // Clip to the target section's limits: a long page title or a Ctrl+A selection must not fail the save.
    // Trim first: a title of spaces is empty (it would fail every section's min(1)).
    const title = clip(input.title.trim() || hostOf(input.url) || 'Без назви', MAX.title)
    const attach = async (type: EntityType, id: string): Promise<void> => {
      if (shot) await api.files.add({ ref: { type, id }, source: shot })
    }
    switch (input.target) {
      case 'design': {
        if (!shot) throw new UserError('Для дизайну потрібен скриншот')
        const d = await api.designs.importImage({ source: shot, input: { title, sourceUrl: input.url, notes: input.note, tagIds } })
        return { type: 'design', id: d.id, title: d.title || title }
      }
      case 'bookmark': {
        const host = hostOf(input.url)
        const kind = /youtube\.com|youtu\.be|vimeo\.com/.test(host) ? 'video' : /github\.com/.test(host) ? 'repo' : /udemy|coursera|egghead|frontendmasters/.test(host) ? 'course' : 'article'
        const b = await api.bookmarks.create({ title, url: input.url, kind: input.kind ?? kind, notes: clip([input.note, input.selection].filter(Boolean).join('\n\n'), 100_000), tagIds })
        await attach('bookmark', b.id)
        return { type: 'bookmark', id: b.id, title: b.title }
      }
      case 'library': {
        const lib = await this.libraryFrom(input.url, clip(title, MAX.name))
        const l = await api.libraries.create({ ...lib, docsUrl: lib.npmUrl || lib.githubUrl ? '' : input.url, notes: input.note, status: 'want', tagIds })
        await attach('library', l.id)
        return { type: 'library', id: l.id, title: l.name }
      }
      case 'component': {
        const c = await api.components.create({ title, sourceUrl: input.url, description: clip(input.note, 20_000), code: input.selection, language: input.selection.trim().startsWith('<') ? 'html' : 'tsx', tagIds })
        if (shot) await api.components.setCover({ id: c.id, source: shot })
        return { type: 'component', id: c.id, title: c.title }
      }
      case 'application': {
        const host = hostOf(input.url)
        // hostOf never throws: a job board saved as «djinni.co» (no scheme) used to fail every vacancy capture.
        const board = (await api.jobs.boards()).find((b) => b.url && hostOf(b.url) === host)
        const a = await api.jobs.create({ title, url: input.url, companyName: input.company, description: clip(input.selection, 100_000), notes: input.note, boardId: board?.id ?? null, status: 'saved', tagIds })
        await attach('application', a.id)
        return { type: 'application', id: a.id, title: a.title }
      }
    }
  }
}
