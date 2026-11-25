import { log } from '../core/logger'
import { ZodError, type z } from 'zod'
import { fieldMax, MAX } from '@shared/domain/limits'
import { libraryInputSchema } from '@shared/domain/libraries'
import { bookmarkInputSchema, type BookmarkKind } from '@shared/domain/bookmarks'
import { componentInputSchema } from '@shared/domain/components'
import { applicationInputSchema } from '@shared/domain/jobs'
import { UserError } from '../core/util'
import { showNotification } from '../core/notify'
import { formatError } from '../ipc/rpc-utils'
import { configureZod } from '@shared/zod-locale'
import { app, net } from 'electron'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { join } from 'path'
import type { Api } from '@shared/api'
import { captureSchema, type CaptureInfo } from '@shared/domain/dev'
import type { FileSource } from '@shared/domain/designs'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import type { ConfigStore } from '../core/config-store'
import type { EventBus } from '../core/event-bus'

configureZod()

const MAX_BODY = 30 * 1024 * 1024
/** captureSchema.screenshot.max: checked before parsing, so the popup learns that the picture is the problem. */
const SCREENSHOT_MAX = fieldMax(captureSchema.shape.screenshot)
const TOO_LARGE = 'Скриншот завеликий — виділіть меншу область або збережіть без скриншота.'
const BAD_KEY = 'Ключ не підходить. Скопіюйте новий у Vault: Налаштування → «Розширення для Chrome».'

/** A request refused by size (413), not by content. */
class TooLargeError extends UserError {}

/** Popup field names: «Мітки: …» lands under the tags field; no «Запис 4 →» from the array index. */
const CAPTURE_LABEL: Record<string, string> = {
  title: 'Назва',
  tags: 'Мітки',
  note: 'Нотатка',
  selection: 'Виділений текст',
  company: 'Компанія',
  url: 'Посилання',
  screenshot: 'Скриншот',
  kind: 'Вид закладки'
}

export function captureIssue(e: ZodError): string {
  const issue = e.issues[0]
  const label = CAPTURE_LABEL[String(issue?.path[0])]
  return label ? `${label}: ${issue.message}` : formatError(e).error
}

/** Host without «www.»; never throws (adds https://, otherwise a board address saved without a scheme won't parse). */
function hostOf(url: string): string {
  try {
    return new URL(/^[a-z][\w+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const clip = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text)
const PURPOSE_MAX = fieldMax(libraryInputSchema.shape.purpose)
const BOOKMARK_NOTES_MAX = fieldMax(bookmarkInputSchema.shape.notes)
const COMPONENT_DESC_MAX = fieldMax(componentInputSchema.shape.description)
const JOB_DESC_MAX = fieldMax(applicationInputSchema.shape.description)

/** Fallback for old extension versions: the current popup always sends `kind` itself. */
function guessBookmarkKind(url: string): BookmarkKind {
  const host = hostOf(url)
  let path = ''
  try {
    path = new URL(url).pathname
  } catch {
    /* no path to look at */
  }
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(host)) return 'video'
  if (/github\.com/.test(host)) return 'repo'
  if (/udemy|coursera|egghead|frontendmasters/.test(host)) return 'course'
  if (/^(docs|developer)\./.test(host) || /^\/(docs|reference|api)(\/|$)/.test(path)) return 'docs'
  return 'article'
}

export interface LibraryPage {
  /** Typed (or page) title without the « - npm» / «| Docs» tail; empty when nothing is left. */
  name: string
  npmName: string | null
  repo: { owner: string; name: string } | null
  npmUrl: string
  githubUrl: string
}

/** GitHub sections that look like «owner/repo» but are not repositories. Same list as GITHUB_SERVICE in extension/popup.js. */
const GITHUB_SERVICE = new Set(['orgs', 'features', 'settings', 'topics', 'marketplace'])

/** Splits a page into what its URL says for sure (npm package, GitHub repo) and the cleaned title. */
export function parseLibraryPage(url: string, title: string): LibraryPage {
  // Old popups send the raw tab title. Only known site tails go: «Day.js — дати» typed by hand stays as is.
  const name = title
    .replace(/^GitHub\s+-\s+[^/\s]+\/([^:\s]+).*$/i, '$1')
    .replace(/^[^/\s]+\/([^:\s]+):\s.*\s·\s*GitHub$/i, '$1')
    .replace(/\s+[-–—|·]\s+(?:npm|GitHub|Docs|Documentation|Документація)$/i, '')
    .trim()
  const none: LibraryPage = { name, npmName: null, repo: null, npmUrl: '', githubUrl: '' }
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return none
  }
  const host = u.hostname.replace(/^www\./, '')
  if (host === 'npmjs.com' || host.endsWith('.npmjs.com')) {
    const m = u.pathname.match(/^\/package\/((?:@[^/]+\/)?[^/]+)/)
    if (m) return { ...none, npmName: decodeURIComponent(m[1]), npmUrl: `https://www.npmjs.com/package/${m[1]}` }
  } else if (host === 'github.com') {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)/)
    if (m && !GITHUB_SERVICE.has(m[1])) return { ...none, repo: { owner: m[1], name: m[2] }, githubUrl: `https://github.com/${m[1]}/${m[2]}` }
  }
  return none
}

/** «owner/repo» (lower case) from any package.json `repository` form: git+https, git@, github:, shorthand. */
function repoSlug(repository: unknown): string | null {
  const raw = typeof repository === 'string' ? repository : (repository as { url?: unknown } | null)?.url
  if (typeof raw !== 'string') return null
  const m = raw.match(/(?:github\.com[/:]|github:|^)([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?]|$)/i)
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null
}

type LibraryFields = { name: string; npmUrl: string; githubUrl: string; docsUrl: string; installCmd: string; purpose: string }

/**
 * npm / GitHub page → library fields, with the description from the npm registry.
 * A GitHub repo only takes an npm package whose `repository` points back to it: «shadcn-ui/ui» is not the «ui» package.
 * Other sites are documentation pages: their address becomes `docsUrl` and npm is not asked.
 */
export async function libraryFrom(url: string, title: string, fetchFn: (url: string, init: RequestInit) => Promise<Response> = net.fetch): Promise<LibraryFields> {
  const page = parseLibraryPage(url, title)
  const lookup = page.npmName ?? page.repo?.name ?? null
  const result: LibraryFields = {
    name: clip(page.name || lookup || hostOf(url) || 'Без назви', MAX.name),
    npmUrl: page.npmUrl,
    githubUrl: page.githubUrl,
    docsUrl: lookup ? '' : url,
    installCmd: page.npmName ? `npm i ${page.npmName}` : '',
    purpose: ''
  }
  if (!lookup) return result
  try {
    // /latest is the newest package.json; the abbreviated document has no description.
    const r = await fetchFn(`https://registry.npmjs.org/${encodeURIComponent(lookup).replace(/^%40/, '@')}/latest`, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) return result
    const j = (await r.json()) as { description?: unknown; repository?: unknown }
    const slug = repoSlug(j.repository)
    if (page.repo && slug !== `${page.repo.owner}/${page.repo.name}`.toLowerCase()) return result
    // npm descriptions have no length limit; the library field does.
    result.purpose = clip(typeof j.description === 'string' ? j.description.trim() : '', PURPOSE_MAX)
    result.npmUrl ||= `https://www.npmjs.com/package/${lookup}`
    result.installCmd ||= `npm i ${lookup}`
    if (!result.githubUrl && slug) result.githubUrl = `https://github.com/${slug}`
  } catch (e) {
    // Offline, slow registry or not a package: the library is saved without a description.
    log.warn('[capture] npm registry', e)
  }
  return result
}

/**
 * Local bridge for the Vault Chrome extension.
 * - listens on 127.0.0.1 only (never the network);
 * - every request must carry the secret key shown in Settings (X-Vault-Key), compared in constant time;
 * - only chrome-extension:// origins get CORS headers.
 */
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
      // Over the limit: keep draining without storing, so the popup gets a 413 instead of a torn connection.
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size <= MAX_BODY) chunks.push(c)
      })
      req.on('end', () => (size > MAX_BODY ? reject(new TooLargeError(TOO_LARGE)) : resolve(Buffer.concat(chunks).toString('utf8'))))
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
    if (!this.authorized(req)) return this.json(res, 401, { ok: false, error: BAD_KEY })
    try {
      if (req.method === 'GET' && req.url === '/ping') return this.json(res, 200, { ok: true, app: 'vault', version: app.getVersion() })
      if (req.method === 'POST' && req.url === '/capture') {
        if (Number(req.headers['content-length']) > MAX_BODY) throw new TooLargeError(TOO_LARGE)
        const body = JSON.parse(await this.readBody(req)) as { screenshot?: unknown } | null
        if (typeof body?.screenshot === 'string' && body.screenshot.length > SCREENSHOT_MAX) throw new TooLargeError(TOO_LARGE)
        const input = captureSchema.safeParse(body)
        if (!input.success) return this.json(res, 400, { ok: false, error: captureIssue(input.error) })
        const saved = await this.capture(input.data)
        this.bus.dataChanged('all')
        const meta = ENTITY_META[saved.type]
        showNotification({ title: 'Збережено у Vault', body: `${meta.label}: ${saved.title}`, icon: this.icon }, () => this.openRoute(meta.route(saved.id)))
        // `section` tells the popup where to look («Збережено в розділі «Дизайни»»); old popups ignore it.
        return this.json(res, 200, { ok: true, ...saved, section: meta.plural })
      }
      if (req.method === 'POST' && req.url === '/open') {
        const { type, id } = (JSON.parse(await this.readBody(req)) ?? {}) as { type?: unknown; id?: unknown }
        if (typeof type !== 'string' || !Object.hasOwn(ENTITY_META, type) || typeof id !== 'string' || !id) {
          return this.json(res, 400, { ok: false, error: 'Невідомий запис' })
        }
        this.openRoute(ENTITY_META[type as EntityType].route(id))
        return this.json(res, 200, { ok: true })
      }
      return this.json(res, 404, { ok: false, error: 'Невідомий запит' })
    } catch (e) {
      if (e instanceof TooLargeError) return this.json(res, 413, { ok: false, error: e.message })
      // Same wording as the app (zod issues → «Назва: занадто довго…»), never a raw JSON dump in the popup.
      if (e instanceof ZodError || e instanceof UserError) return this.json(res, 400, { ok: false, error: formatError(e).error })
      if (e instanceof SyntaxError) return this.json(res, 400, { ok: false, error: 'Некоректний запит від розширення' })
      log.error('[capture]', e)
      return this.json(res, 500, { ok: false, error: 'Не вдалося зберегти у Vault — подробиці в журналі (Налаштування → «Відкрити журнал»).' })
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

  private async capture(input: z.output<typeof captureSchema>): Promise<{ type: EntityType; id: string; title: string; warning?: string }> {
    const api = this.api()
    const tagIds = await this.tagIds(input.tags)
    const shot = this.screenshotSource(input.screenshot, 'screenshot')
    // Clip to the target section's limits: a long page title or a Ctrl+A selection must not fail the save.
    // Trim first: a title of spaces is empty (it would fail every section's min(1)).
    const title = clip(input.title.trim() || hostOf(input.url) || 'Без назви', MAX.title)
    // The record exists by now: a failed picture is a warning, not an error, or «Зберегти» again makes a duplicate.
    let warning: string | undefined
    const withShot = async (add: (source: FileSource) => Promise<unknown>): Promise<void> => {
      if (!shot) return
      try {
        await add(shot)
      } catch (e) {
        log.error('[capture] screenshot', e)
        warning = 'Запис збережено, але скриншот додати не вдалося.'
      }
    }
    const attach = (type: EntityType, id: string): Promise<void> => withShot((source) => api.files.add({ ref: { type, id }, source }))
    switch (input.target) {
      case 'design': {
        if (!shot) throw new UserError('Для дизайну потрібен скриншот')
        const d = await api.designs.importImage({ source: shot, input: { title, sourceUrl: input.url, notes: input.note, tagIds } })
        return { type: 'design', id: d.id, title: d.title || title }
      }
      case 'bookmark': {
        const notes = clip([input.note, input.selection].filter(Boolean).join('\n\n'), BOOKMARK_NOTES_MAX)
        const b = await api.bookmarks.create({ title, url: input.url, kind: input.kind ?? guessBookmarkKind(input.url), notes, tagIds })
        await attach('bookmark', b.id)
        return { type: 'bookmark', id: b.id, title: b.title, warning }
      }
      case 'library': {
        const lib = await libraryFrom(input.url, input.title)
        const l = await api.libraries.create({ ...lib, notes: input.note, status: 'want', tagIds })
        await attach('library', l.id)
        return { type: 'library', id: l.id, title: l.name, warning }
      }
      case 'component': {
        const c = await api.components.create({ title, sourceUrl: input.url, description: clip(input.note, COMPONENT_DESC_MAX), code: input.selection, language: input.selection.trim().startsWith('<') ? 'html' : 'tsx', tagIds })
        await withShot((source) => api.components.setCover({ id: c.id, source }))
        return { type: 'component', id: c.id, title: c.title, warning }
      }
      case 'application': {
        const host = hostOf(input.url)
        const board = (await api.jobs.boards()).find((b) => b.url && hostOf(b.url) === host)
        const a = await api.jobs.create({ title, url: input.url, companyName: input.company, description: clip(input.selection, JOB_DESC_MAX), notes: input.note, boardId: board?.id ?? null, status: 'saved', tagIds })
        await attach('application', a.id)
        return { type: 'application', id: a.id, title: a.title, warning }
      }
    }
  }
}
