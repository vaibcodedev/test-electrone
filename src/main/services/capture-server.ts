import { log } from '../core/logger'
import { ZodError, type z } from 'zod'
import { fieldMax, MAX } from '@shared/domain/limits'
import { libraryInputSchema } from '@shared/domain/libraries'
import { bookmarkInputSchema, type BookmarkKind } from '@shared/domain/bookmarks'
import { componentInputSchema } from '@shared/domain/components'
import { applicationInputSchema } from '@shared/domain/jobs'
import { snippetInputSchema, type SnippetInput } from '@shared/domain/snippets'
import { noteInputSchema, type NoteInput } from '@shared/domain/notes'
import { fixInputSchema, type FixInput } from '@shared/domain/fixes'
import { UserError } from '../core/util'
import { showNotification } from '../core/notify'
import { formatError } from '../ipc/rpc-utils'
import { configureZod } from '@shared/zod-locale'
import { app, net } from 'electron'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { randomBytes, timingSafeEqual } from 'crypto'
import { join } from 'path'
import type { Api } from '@shared/api'
import {
  CAPTURE_TARGETS,
  captureSchema,
  type CaptureClient,
  type CaptureInfo,
  type PairAnswer,
  type PairRequestView
} from '@shared/domain/dev'
import { designInputSchema, type FileSource } from '@shared/domain/designs'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import { hostOf } from '@shared/url'
import type { ConfigStore } from '../core/config-store'
import type { EventBus } from '../core/event-bus'
import { isExtensionOrigin, PairingBroker, type PairRequest } from './extension-pairing'

configureZod()

const MAX_BODY = 30 * 1024 * 1024
/** captureSchema.screenshot.max: checked before parsing, so the popup learns that the picture is the problem. */
const SCREENSHOT_MAX = fieldMax(captureSchema.shape.screenshot)
const TOO_LARGE = 'Скриншот завеликий — виділіть меншу область або збережіть без скриншота.'
const BAD_KEY =
  'Ключ не підходить. Скопіюйте новий у Vault: Налаштування → «Розширення для Chrome».'
const PAIR_FORBIDDEN = 'Під’єднатися до Vault може лише розширення браузера.'
const PAIR_RATE = 'Забагато запитів на під’єднання. Зачекайте хвилину й спробуйте ще раз.'
const PAIR_GONE = 'Запит уже не дійсний. Натисніть «Під’єднати до Vault» у розширенні ще раз.'
/** Pairing protocol version in /ping and in the 401 reply: a popup that sees it offers «Під’єднати до Vault». */
const PAIR_PROTOCOL = 1
/** Paired extensions remembered for Settings (Chrome, Edge, a second profile…). */
const CLIENTS_MAX = 10

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
  kind: 'Вид закладки',
  language: 'Мова',
  solution: 'Рішення'
}

export function captureIssue(e: ZodError): string {
  const issue = e.issues[0]
  const label = CAPTURE_LABEL[String(issue?.path[0])]
  return label ? `${label}: ${issue.message}` : formatError(e).error
}

const clip = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text)
const PURPOSE_MAX = fieldMax(libraryInputSchema.shape.purpose)
const BOOKMARK_NOTES_MAX = fieldMax(bookmarkInputSchema.shape.notes)
const COMPONENT_DESC_MAX = fieldMax(componentInputSchema.shape.description)
const JOB_DESC_MAX = fieldMax(applicationInputSchema.shape.description)
const SNIPPET_CODE_MAX = fieldMax(snippetInputSchema.shape.code)
const SNIPPET_DESC_MAX = fieldMax(snippetInputSchema.shape.description)
const NOTE_BODY_MAX = fieldMax(noteInputSchema.shape.body)
const FIX_ERROR_MAX = fieldMax(fixInputSchema.shape.errorText)
const FIX_CAUSE_MAX = fieldMax(fixInputSchema.shape.cause)
const FIX_SOLUTION_MAX = fieldMax(fixInputSchema.shape.solution)
// The popup's «Нотатка» may be longer than a section's notes (older popups: 10 000): clipped, never refused.
const DESIGN_NOTES_MAX = fieldMax(designInputSchema.shape.notes)
const LIBRARY_NOTES_MAX = fieldMax(libraryInputSchema.shape.notes)
const JOB_NOTES_MAX = fieldMax(applicationInputSchema.shape.notes)

type Capture = z.output<typeof captureSchema>

/** The record title: a title of spaces is empty (it would fail every section's min(1)), a long one is clipped. */
const captureTitle = (input: Capture): string =>
  clip(input.title.trim() || hostOf(input.url) || 'Без назви', MAX.title)

/** Characters that would end a markdown link destination early. */
const LINK_UNSAFE: Record<string, string> = {
  '(': '%28',
  ')': '%29',
  '<': '%3C',
  '>': '%3E',
  ' ': '%20'
}

/**
 * «Джерело: [stackoverflow.com](https://…)» — snippets, notes and fixes have no link field, so the page goes
 * into their markdown. Only http(s) becomes a link; anything else stays plain text. '' without an address.
 */
export function sourceLine(url: string): string {
  const raw = url.trim()
  if (!raw) return ''
  const host = /^https?:\/\//i.test(raw) ? hostOf(raw) : null
  if (!host) return `Джерело: ${raw}`
  return `Джерело: [${host}](${raw.replace(/[()<> ]/g, (c) => LINK_UNSAFE[c])})`
}

/** Text + blank line + source line within `max`: the text is clipped, never the link. */
function withSource(text: string, url: string, max: number): string {
  const line = sourceLine(url)
  if (!line) return clip(text, max)
  if (!text) return line
  return `${clip(text, Math.max(0, max - line.length - 2))}\n\n${line}`
}

/** Selected code: blank lines around it go, the first line's indentation stays. */
const trimCode = (code: string): string => code.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd()

/** «Сніпет»: the selection is the code, «Опис» + the page link the description. */
export function snippetFrom(input: Capture, tagIds: string[]): SnippetInput {
  const code = clip(trimCode(input.selection), SNIPPET_CODE_MAX)
  // «Код: …» lands under the code field in the popup.
  if (!code) throw new UserError('Код: виділіть код на сторінці або вставте його сюди')
  return {
    title: captureTitle(input),
    code,
    // Old servers' popups never send «snippet»; a current one always sends the language it showed.
    language: input.language ?? 'text',
    description: withSource(input.note.trim(), input.url, SNIPPET_DESC_MAX),
    tagIds
  }
}

/** «Нотатка»: the selected text (and an extra comment, if any) with the page link at the end. */
export function noteFrom(input: Capture, tagIds: string[]): NoteInput {
  const text = [input.selection.trim(), input.note.trim()].filter(Boolean).join('\n\n')
  return {
    title: captureTitle(input),
    body: withSource(text, input.url, NOTE_BODY_MAX),
    tagIds
  }
}

/**
 * «Помилка»: the selection is the error text, «Рішення» is optional — without it the fix stays open.
 * The page link goes where the answer is: under the solution, or under the cause while there is none.
 */
export function fixFrom(input: Capture, tagIds: string[]): FixInput {
  const solution = input.solution.trim()
  const cause = input.note.trim()
  return {
    title: captureTitle(input),
    errorText: clip(trimCode(input.selection), FIX_ERROR_MAX),
    cause: solution ? clip(cause, FIX_CAUSE_MAX) : withSource(cause, input.url, FIX_CAUSE_MAX),
    solution: solution ? withSource(solution, input.url, FIX_SOLUTION_MAX) : '',
    resolved: !!solution,
    tagIds
  }
}

/** Fallback for old extension versions: the current popup always sends `kind` itself. */
function guessBookmarkKind(url: string): BookmarkKind {
  const host = hostOf(url) ?? ''
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
    if (m)
      return {
        ...none,
        npmName: decodeURIComponent(m[1]),
        npmUrl: `https://www.npmjs.com/package/${m[1]}`
      }
  } else if (host === 'github.com') {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)/)
    if (m && !GITHUB_SERVICE.has(m[1]))
      return {
        ...none,
        repo: { owner: m[1], name: m[2] },
        githubUrl: `https://github.com/${m[1]}/${m[2]}`
      }
  }
  return none
}

/** «owner/repo» (lower case) from any package.json `repository` form: git+https, git@, github:, shorthand. */
function repoSlug(repository: unknown): string | null {
  const raw =
    typeof repository === 'string' ? repository : (repository as { url?: unknown } | null)?.url
  if (typeof raw !== 'string') return null
  const m = raw.match(/(?:github\.com[/:]|github:|^)([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?]|$)/i)
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null
}

type LibraryFields = {
  name: string
  npmUrl: string
  githubUrl: string
  docsUrl: string
  installCmd: string
  purpose: string
}

/**
 * npm / GitHub page → library fields, with the description from the npm registry.
 * A GitHub repo only takes an npm package whose `repository` points back to it: «shadcn-ui/ui» is not the «ui» package.
 * Other sites are documentation pages: their address becomes `docsUrl` and npm is not asked.
 */
export async function libraryFrom(
  url: string,
  title: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response> = net.fetch
): Promise<LibraryFields> {
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
    const r = await fetchFn(
      `https://registry.npmjs.org/${encodeURIComponent(lookup).replace(/^%40/, '@')}/latest`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!r.ok) return result
    const j = (await r.json()) as { description?: unknown; repository?: unknown }
    const slug = repoSlug(j.repository)
    if (page.repo && slug !== `${page.repo.owner}/${page.repo.name}`.toLowerCase()) return result
    // npm descriptions have no length limit; the library field does.
    result.purpose = clip(
      typeof j.description === 'string' ? j.description.trim() : '',
      PURPOSE_MAX
    )
    result.npmUrl ||= `https://www.npmjs.com/package/${lookup}`
    result.installCmd ||= `npm i ${lookup}`
    if (!result.githubUrl && slug) result.githubUrl = `https://github.com/${slug}`
  } catch (e) {
    // Offline, slow registry or not a package: the library is saved without a description.
    log.warn('[capture] npm registry', e)
  }
  return result
}

/** The extension shipped with Vault: resources/extension when installed, the repo's extension/ in development. */
export function bundledExtensionDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'extension')
    : join(app.getAppPath(), 'extension')
}

/** What the bridge needs to know about the extension folder (ExtensionFolder implements it). */
export interface ExtensionFolderInfo {
  readonly dir: string
  readonly version: string | null
  readonly extensionId: string | null
}

export interface CaptureServerOptions {
  pairing?: PairingBroker
  folder?: ExtensionFolderInfo
}

/**
 * Local bridge for the Vault Chrome extension.
 * - listens on 127.0.0.1 only (never the network);
 * - every request must carry the secret key shown in Settings (X-Vault-Key), compared in constant time;
 * - the one exception is pairing (/pair): an extension origin asks, the person clicks «Дозволити» in Vault,
 *   and only then the extension gets the key (rules in PairingBroker);
 * - only chrome-extension:// origins get CORS headers.
 */
export class CaptureServer {
  private server: Server | null = null
  private listening = false
  private readonly pairing: PairingBroker
  private readonly folder: ExtensionFolderInfo

  constructor(
    private readonly config: ConfigStore,
    private readonly api: () => Api,
    private readonly bus: EventBus,
    private readonly openRoute: (route: string) => void,
    private readonly icon: string,
    opts: CaptureServerOptions = {}
  ) {
    this.pairing = opts.pairing ?? new PairingBroker()
    // Lazily: the bundled path asks Electron, which a unit test without a folder does not have.
    this.folder = opts.folder ?? {
      get dir() {
        return bundledExtensionDir()
      },
      version: null,
      extensionId: null
    }
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

  /** A new key disconnects every extension holding the old one («Відключити»): the paired list goes too. */
  regenerate(): string {
    this.config.setSecret('captureKey', null)
    this.config.captureClients = []
    return this.token()
  }

  get extensionDir(): string {
    return this.folder.dir
  }

  info(): CaptureInfo {
    const s = this.config.settings
    return {
      enabled: s.captureEnabled,
      port: s.capturePort,
      token: this.token(),
      extensionDir: this.folder.dir,
      extensionVersion: this.folder.version,
      running: this.listening,
      clients: this.config.captureClients.map((c): CaptureClient => ({
        ...c,
        vault: this.isVaultExtension(c.origin)
      }))
    }
  }

  /** The request waiting for «Дозволити» / «Відхилити», as the dialog shows it. */
  pendingPair(): PairRequestView | null {
    return this.view(this.pairing.pending())
  }

  /** The dialog follows every change: a new request, a replaced one, an answer, expiry. */
  onPairChange(listener: (pending: PairRequestView | null) => void): () => void {
    return this.pairing.onChange((r) => listener(this.view(r)))
  }

  /** The person's answer in Vault. A request replaced or expired under the dialog is refused, never approved. */
  answerPair({ id, allow }: PairAnswer): void {
    const pending = this.pairing.pending()
    if (!pending || pending.id !== id || !this.pairing.answer(id, allow))
      throw new UserError(PAIR_GONE)
    log.info(`[capture] pairing ${allow ? 'allowed' : 'denied'} for ${pending.origin}`)
    if (allow) this.remember(pending.origin)
  }

  private view(r: PairRequest | null): PairRequestView | null {
    return r
      ? {
          id: r.id,
          origin: r.origin,
          vault: this.isVaultExtension(r.origin),
          expiresAt: r.expiresAt
        }
      : null
  }

  private isVaultExtension(origin: string): boolean {
    const id = this.folder.extensionId
    return !!id && origin === `chrome-extension://${id}`
  }

  private remember(origin: string): void {
    const rest = this.config.captureClients.filter((c) => c.origin !== origin)
    this.config.captureClients = [{ origin, approvedAt: Date.now() }, ...rest].slice(0, CLIENTS_MAX)
  }

  /** The port start() last tried: a server that failed to listen has no address, yet that port was tried. */
  private port: number | null = null

  start(): void {
    const s = this.config.settings
    if (!s.captureEnabled || this.server) return
    this.port = s.capturePort
    this.server = createServer((req, res) => void this.handle(req, res))
    this.server.on('error', (e: NodeJS.ErrnoException) => {
      this.listening = false
      // Usually another Vault (the installed one next to `npm run dev`) already listens there: the extension
      // talks to it. Expected, so a warning, not an error with a stack.
      if (e.code === 'EADDRINUSE')
        log.warn(
          `[capture] port ${s.capturePort} is taken (another Vault?) — capture is off in this one`
        )
      else log.error('[capture]', e)
    })
    this.server.listen(s.capturePort, '127.0.0.1', () => {
      this.listening = true
    })
  }

  stop(): void {
    this.server?.close()
    this.server = null
    this.port = null
    this.listening = false
    this.pairing.dispose()
  }

  /** Any settings change lands here: only turning capture on/off or a new port touches the server. */
  private restart(): void {
    const s = this.config.settings
    if (!s.captureEnabled) return this.stop()
    if (!this.server || this.port !== s.capturePort) {
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

  /** Host is this server itself: a page that rebinds its own domain to 127.0.0.1 sends another Host. */
  private ownHost(req: IncomingMessage): boolean {
    const port = (this.server?.address() as AddressInfo | null)?.port
    const host = req.headers.host ?? ''
    return !!port && (host === `127.0.0.1:${port}` || host === `localhost:${port}`)
  }

  /**
   * POST /pair — an extension asks for access without a key: one waiting request, the window comes up with
   * «Дозволити розширенню доступ?». POST /pair/<id> — its poll: waiting / approved (+ the key, once) / denied /
   * expired; POST /pair/<id>/cancel — «Скасувати». POST, not GET: Chrome adds the Origin header to an extension's GET only for hosts it may not
   * access, and 127.0.0.1 is in its host_permissions. Only extension origins on our own Host get an answer;
   * the key is never logged.
   */
  private handlePair(req: IncomingMessage, res: ServerResponse, path: string): void {
    const origin = req.headers.origin
    if (!this.ownHost(req) || !isExtensionOrigin(origin))
      return this.json(res, 403, { ok: false, error: PAIR_FORBIDDEN })
    if (req.method === 'POST' && path === '/pair') {
      const opened = this.pairing.open(origin)
      if (!opened.ok) return this.json(res, 429, { ok: false, error: PAIR_RATE })
      log.info(`[capture] pairing requested by ${origin}`)
      return this.json(res, 200, { ok: true, id: opened.id, expiresIn: opened.expiresIn })
    }
    const m = path.match(/^\/pair\/([\w-]{1,64})$/)
    if (req.method === 'POST' && m) {
      const poll = this.pairing.poll(m[1], origin)
      if (poll.state === 'approved')
        return this.json(res, 200, { ok: true, state: 'approved', key: this.token() })
      return this.json(res, 200, { ok: true, ...poll })
    }
    // «Скасувати» in the popup: the question in Vault goes away with it.
    const cancel = path.match(/^\/pair\/([\w-]{1,64})\/cancel$/)
    if (req.method === 'POST' && cancel)
      return this.json(res, 200, { ok: this.pairing.cancel(cancel[1], origin) })
    return this.json(res, 404, { ok: false, error: 'Невідомий запит' })
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
      req.on('end', () =>
        size > MAX_BODY
          ? reject(new TooLargeError(TOO_LARGE))
          : resolve(Buffer.concat(chunks).toString('utf8'))
      )
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
    const path = (req.url ?? '').split('?')[0]
    if (path === '/pair' || path.startsWith('/pair/')) return this.handlePair(req, res, path)
    // `app` + `pair`: a popup without a key learns that Vault is here and can pair; old popups read `error` only.
    if (!this.authorized(req))
      return this.json(res, 401, { ok: false, error: BAD_KEY, app: 'vault', pair: PAIR_PROTOCOL })
    try {
      if (req.method === 'GET' && req.url === '/ping')
        // `targets`: what this Vault saves — a newer popup asks for an update instead of a refusal; old ones ignore it.
        // `extension`: the version in the extension folder — an older extension reloads itself to pick it up.
        return this.json(res, 200, {
          ok: true,
          app: 'vault',
          version: app.getVersion(),
          targets: CAPTURE_TARGETS,
          extension: this.folder.version,
          pair: PAIR_PROTOCOL
        })
      if (req.method === 'POST' && req.url === '/capture') {
        if (Number(req.headers['content-length']) > MAX_BODY) throw new TooLargeError(TOO_LARGE)
        const body = JSON.parse(await this.readBody(req)) as { screenshot?: unknown } | null
        if (typeof body?.screenshot === 'string' && body.screenshot.length > SCREENSHOT_MAX)
          throw new TooLargeError(TOO_LARGE)
        const input = captureSchema.safeParse(body)
        if (!input.success)
          return this.json(res, 400, { ok: false, error: captureIssue(input.error) })
        const saved = await this.capture(input.data)
        this.bus.dataChanged('all')
        const meta = ENTITY_META[saved.type]
        showNotification(
          { title: 'Збережено у Vault', body: `${meta.label}: ${saved.title}`, icon: this.icon },
          () => this.openRoute(meta.route(saved.id))
        )
        // `section` tells the popup where to look («Збережено в розділі «Галерея»»); old popups ignore it.
        return this.json(res, 200, { ok: true, ...saved, section: meta.plural })
      }
      if (req.method === 'POST' && req.url === '/open') {
        const { type, id } = (JSON.parse(await this.readBody(req)) ?? {}) as {
          type?: unknown
          id?: unknown
        }
        if (
          typeof type !== 'string' ||
          !Object.hasOwn(ENTITY_META, type) ||
          typeof id !== 'string' ||
          !id
        ) {
          return this.json(res, 400, { ok: false, error: 'Невідомий запис' })
        }
        this.openRoute(ENTITY_META[type as EntityType].route(id))
        return this.json(res, 200, { ok: true })
      }
      return this.json(res, 404, { ok: false, error: 'Невідомий запит' })
    } catch (e) {
      if (e instanceof TooLargeError) return this.json(res, 413, { ok: false, error: e.message })
      // Same wording as the app (zod issues → «Назва: занадто довго…»), never a raw JSON dump in the popup.
      if (e instanceof ZodError || e instanceof UserError)
        return this.json(res, 400, { ok: false, error: formatError(e).error })
      if (e instanceof SyntaxError)
        return this.json(res, 400, { ok: false, error: 'Некоректний запит від розширення' })
      log.error('[capture]', e)
      return this.json(res, 500, {
        ok: false,
        error:
          'Не вдалося зберегти у Vault — подробиці в журналі: Налаштування → Дані → «Відкрити журнал».'
      })
    }
  }

  private screenshotSource(dataUrl: string | null, name: string): FileSource | null {
    if (!dataUrl) return null
    const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/)
    if (!m) return null
    const ext = m[1] === 'image/jpeg' ? 'jpg' : m[1].split('/')[1]
    return {
      kind: 'bytes',
      name: `${name}.${ext}`,
      mime: m[1],
      data: new Uint8Array(Buffer.from(m[2], 'base64'))
    }
  }

  private async tagIds(names: string[]): Promise<string[]> {
    const ids: string[] = []
    for (const name of names) ids.push((await this.api().tags.create({ name })).id)
    return ids
  }

  private async capture(
    input: Capture
  ): Promise<{ type: EntityType; id: string; title: string; warning?: string }> {
    const api = this.api()
    const shot = this.screenshotSource(input.screenshot, 'screenshot')
    // Refusals come before the tags are created: a rejected capture leaves no orphan tags.
    if (input.target === 'design' && !shot) throw new UserError('Для дизайну потрібен скриншот')
    if (input.target === 'snippet') snippetFrom(input, [])
    const tagIds = await this.tagIds(input.tags)
    // Clip to the target section's limits: a long page title or a Ctrl+A selection must not fail the save.
    const title = captureTitle(input)
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
    const attach = (type: EntityType, id: string): Promise<void> =>
      withShot((source) => api.files.add({ ref: { type, id }, source }))
    switch (input.target) {
      case 'design': {
        if (!shot) throw new UserError('Для дизайну потрібен скриншот') // narrows `shot`
        const d = await api.designs.importImage({
          source: shot,
          input: { title, sourceUrl: input.url, notes: clip(input.note, DESIGN_NOTES_MAX), tagIds }
        })
        return { type: 'design', id: d.id, title: d.title || title }
      }
      case 'bookmark': {
        const notes = clip(
          [input.note, input.selection].filter(Boolean).join('\n\n'),
          BOOKMARK_NOTES_MAX
        )
        const b = await api.bookmarks.create({
          title,
          url: input.url,
          kind: input.kind ?? guessBookmarkKind(input.url),
          notes,
          tagIds
        })
        await attach('bookmark', b.id)
        return { type: 'bookmark', id: b.id, title: b.title, warning }
      }
      case 'library': {
        const lib = await libraryFrom(input.url, input.title)
        const l = await api.libraries.create({
          ...lib,
          notes: clip(input.note, LIBRARY_NOTES_MAX),
          status: 'want',
          tagIds
        })
        await attach('library', l.id)
        return { type: 'library', id: l.id, title: l.name, warning }
      }
      case 'component': {
        const c = await api.components.create({
          title,
          sourceUrl: input.url,
          description: clip(input.note, COMPONENT_DESC_MAX),
          code: input.selection,
          language: input.selection.trim().startsWith('<') ? 'html' : 'tsx',
          tagIds
        })
        await withShot((source) => api.components.setCover({ id: c.id, source }))
        return { type: 'component', id: c.id, title: c.title, warning }
      }
      case 'application': {
        // No host, no board: two unparsable addresses must not «match» each other.
        const host = hostOf(input.url)
        const board = host
          ? (await api.jobs.boards()).find((b) => b.url && hostOf(b.url) === host)
          : undefined
        const a = await api.jobs.create({
          title,
          url: input.url,
          companyName: input.company,
          description: clip(input.selection, JOB_DESC_MAX),
          notes: clip(input.note, JOB_NOTES_MAX),
          boardId: board?.id ?? null,
          status: 'saved',
          tagIds
        })
        await attach('application', a.id)
        return { type: 'application', id: a.id, title: a.title, warning }
      }
      // The popup sends no picture for these three; one from another client is kept as an attachment.
      case 'snippet': {
        const sn = await api.snippets.create(snippetFrom(input, tagIds))
        await attach('snippet', sn.id)
        return { type: 'snippet', id: sn.id, title: sn.title, warning }
      }
      case 'note': {
        const n = await api.notes.create(noteFrom(input, tagIds))
        await attach('note', n.id)
        return { type: 'note', id: n.id, title: n.title, warning }
      }
      case 'fix': {
        const f = await api.fixes.create(fixFrom(input, tagIds))
        await attach('fix', f.id)
        return { type: 'fix', id: f.id, title: f.title, warning }
      }
    }
  }
}
