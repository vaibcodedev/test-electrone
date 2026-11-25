import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'net'
import { request, type Server } from 'http'
import type { z } from 'zod'

vi.mock('electron', async () => ({
  ...(await import('./support/electron-mock')).electronMock,
  net: { fetch: vi.fn() },
  Notification: class {
    static isSupported(): boolean {
      return false
    }
  }
}))
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

import {
  CaptureServer,
  captureIssue,
  fixFrom,
  libraryFrom,
  noteFrom,
  parseLibraryPage,
  snippetFrom,
  sourceLine
} from '@main/services/capture-server'
import { PairingBroker } from '@main/services/extension-pairing'
import type { ConfigStore } from '@main/core/config-store'
import type { EventBus } from '@main/core/event-bus'
import type { Api } from '@shared/api'
import { captureSchema } from '@shared/domain/dev'
import { fieldMax } from '@shared/domain/limits'
import { SNIPPET_LANGUAGES, snippetInputSchema } from '@shared/domain/snippets'
import { fixInputSchema } from '@shared/domain/fixes'
import { LANGUAGES, guessLanguage, looksLikeCode } from '../../extension/code-language.js'
import { isNewerVersion, suggestTarget, updateAction } from '../../extension/shared.js'

type FetchFn = (url: string, init: RequestInit) => Promise<Response>
const registry = (body: unknown): FetchFn & ReturnType<typeof vi.fn> =>
  vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response)

describe('parseLibraryPage', () => {
  it('reads a scoped npm package', () => {
    const p = parseLibraryPage(
      'https://www.npmjs.com/package/@tanstack/react-query',
      '@tanstack/react-query - npm'
    )
    expect(p.npmName).toBe('@tanstack/react-query')
    expect(p.name).toBe('@tanstack/react-query')
    expect(p.repo).toBeNull()
  })

  it('reads an npm package without a scope', () => {
    const p = parseLibraryPage('https://www.npmjs.com/package/zustand', 'zustand - npm')
    expect(p).toMatchObject({
      name: 'zustand',
      npmName: 'zustand',
      npmUrl: 'https://www.npmjs.com/package/zustand'
    })
  })

  it('reads a GitHub repo root and its subpages', () => {
    for (const url of [
      'https://github.com/pmndrs/zustand',
      'https://github.com/pmndrs/zustand/tree/main'
    ]) {
      const p = parseLibraryPage(url, 'zustand')
      expect(p.repo).toEqual({ owner: 'pmndrs', name: 'zustand' })
      expect(p.githubUrl).toBe('https://github.com/pmndrs/zustand')
      expect(p.npmName).toBeNull()
    }
  })

  it('skips GitHub service sections, as the popup does', async () => {
    for (const url of [
      'https://github.com/topics/react',
      'https://github.com/orgs/vercel',
      'https://github.com/marketplace/actions'
    ]) {
      const p = parseLibraryPage(url, 'react')
      expect(p.repo).toBeNull()
      expect(p.githubUrl).toBe('')
    }
    const fetchFn = registry({ description: 'x' })
    const lib = await libraryFrom('https://github.com/topics/react', 'react', fetchFn)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(lib).toMatchObject({
      name: 'react',
      githubUrl: '',
      docsUrl: 'https://github.com/topics/react'
    })
  })

  it('drops known site tails only', () => {
    expect(parseLibraryPage('https://react-hook-form.com/', 'react-hook-form | Docs').name).toBe(
      'react-hook-form'
    )
    expect(parseLibraryPage('https://day.js.org/', 'Day.js — дати').name).toBe('Day.js — дати')
    expect(parseLibraryPage('https://ui.shadcn.com/', 'shadcn/ui · компоненти').name).toBe(
      'shadcn/ui · компоненти'
    )
  })

  it('takes the repo from GitHub tab titles', () => {
    expect(
      parseLibraryPage('https://github.com/owner/repo', 'GitHub - owner/repo: A small library').name
    ).toBe('repo')
    expect(
      parseLibraryPage('https://github.com/owner/repo', 'owner/repo: A small library · GitHub').name
    ).toBe('repo')
  })

  it('knows nothing about other sites or broken URLs', () => {
    expect(parseLibraryPage('https://example.com/lib', 'Lib')).toMatchObject({
      npmName: null,
      repo: null
    })
    expect(parseLibraryPage('not a url', 'Lib')).toMatchObject({
      name: 'Lib',
      npmName: null,
      repo: null
    })
  })
})

describe('libraryFrom', () => {
  it('fills an npm package from the registry', async () => {
    const fetchFn = registry({
      description: ' Query library ',
      repository: { url: 'git+https://github.com/TanStack/query.git' }
    })
    const lib = await libraryFrom(
      'https://www.npmjs.com/package/@tanstack/react-query',
      '@tanstack/react-query - npm',
      fetchFn
    )
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://registry.npmjs.org/@tanstack%2Freact-query/latest'
    )
    expect(lib).toMatchObject({
      name: '@tanstack/react-query',
      purpose: 'Query library',
      installCmd: 'npm i @tanstack/react-query',
      githubUrl: 'https://github.com/tanstack/query',
      docsUrl: ''
    })
  })

  it('takes the npm description for a GitHub repo whose package points back to it', async () => {
    const fetchFn = registry({
      description: 'Bear necessities',
      repository: 'git+https://github.com/pmndrs/zustand.git'
    })
    const lib = await libraryFrom('https://github.com/pmndrs/zustand', 'zustand', fetchFn)
    expect(lib).toMatchObject({
      purpose: 'Bear necessities',
      npmUrl: 'https://www.npmjs.com/package/zustand',
      installCmd: 'npm i zustand'
    })
  })

  it('ignores an npm package of the same name from another repo', async () => {
    const fetchFn = registry({
      description: 'Something else',
      repository: 'git+https://github.com/someone/ui.git'
    })
    const lib = await libraryFrom('https://github.com/shadcn-ui/ui', 'ui', fetchFn)
    expect(lib).toMatchObject({ name: 'ui', purpose: '', npmUrl: '', installCmd: '' })
  })

  it('saves a documentation site as docsUrl without asking npm', async () => {
    const fetchFn = registry({})
    const lib = await libraryFrom(
      'https://react-hook-form.com/docs',
      'react-hook-form | Docs',
      fetchFn
    )
    expect(lib).toMatchObject({
      name: 'react-hook-form',
      docsUrl: 'https://react-hook-form.com/docs'
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('keeps the name when the registry fails or refuses', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('offline')
    })
    const refusing = vi.fn(async () => ({ ok: false }) as Response)
    for (const fetchFn of [throwing, refusing]) {
      const lib = await libraryFrom(
        'https://www.npmjs.com/package/zustand',
        'zustand - npm',
        fetchFn
      )
      expect(lib).toMatchObject({ name: 'zustand', purpose: '', installCmd: 'npm i zustand' })
    }
  })
})

describe('captureIssue', () => {
  const issueOf = (body: unknown): string => {
    const r = captureSchema.safeParse(body)
    if (r.success) throw new Error('expected a refusal')
    return captureIssue(r.error)
  }

  it('names the popup field without the array index', () => {
    const msg = issueOf({
      target: 'bookmark',
      url: 'https://example.com',
      tags: ['ok', 'x'.repeat(61)]
    })
    expect(msg).toMatch(/^Мітки: /)
    expect(msg).not.toMatch(/Запис|Поле/)
  })

  it('starts a long title with «Назва:»', () => {
    expect(
      issueOf({ target: 'bookmark', url: 'https://example.com', title: 'x'.repeat(501) })
    ).toMatch(/^Назва: /)
  })
})

describe('captureSchema: snippet, note, fix', () => {
  const issueOf = (body: unknown): string => {
    const r = captureSchema.safeParse(body)
    if (r.success) throw new Error('expected a refusal')
    return captureIssue(r.error)
  }

  it('accepts the new targets with their fields', () => {
    const r = captureSchema.parse({
      target: 'snippet',
      url: 'https://gist.github.com/a/1',
      selection: 'const a = 1',
      language: 'typescript'
    })
    expect(r).toMatchObject({ target: 'snippet', language: 'typescript', solution: '' })
    expect(captureSchema.parse({ target: 'note', url: 'https://x.dev' }).target).toBe('note')
    expect(
      captureSchema.parse({ target: 'fix', url: 'https://x.dev', solution: 'npm ci' }).solution
    ).toBe('npm ci')
  })

  it('still takes what an old popup sends (no language, no solution)', () => {
    const r = captureSchema.parse({
      target: 'component',
      url: 'https://ui.shadcn.com',
      selection: '<a/>'
    })
    expect(r.language).toBeUndefined()
    expect(r.solution).toBe('')
  })

  it('names the language and the solution in refusals', () => {
    expect(issueOf({ target: 'snippet', url: 'https://x.dev', language: 'cobol' })).toMatch(
      /^Мова: /
    )
    expect(issueOf({ target: 'fix', url: 'https://x.dev', solution: 'x'.repeat(200_001) })).toMatch(
      /^Рішення: /
    )
  })
})

describe('sourceLine', () => {
  it('links http(s) pages by host and keeps the markdown link whole', () => {
    expect(sourceLine('https://stackoverflow.com/questions/1/a')).toBe(
      'Джерело: [stackoverflow.com](https://stackoverflow.com/questions/1/a)'
    )
    expect(sourceLine('https://en.wikipedia.org/wiki/A_(b) c')).toBe(
      'Джерело: [en.wikipedia.org](https://en.wikipedia.org/wiki/A_%28b%29%20c)'
    )
  })

  it('leaves other addresses as text and an empty one out', () => {
    expect(sourceLine('file:///C:/notes.txt')).toBe('Джерело: file:///C:/notes.txt')
    expect(sourceLine('javascript:alert(1)')).toBe('Джерело: javascript:alert(1)')
    expect(sourceLine('  ')).toBe('')
  })
})

describe('snippetFrom / noteFrom / fixFrom', () => {
  const SO = 'Джерело: [stackoverflow.com](https://stackoverflow.com/q/1)'
  const input = (over: Record<string, unknown>): z.output<typeof captureSchema> =>
    captureSchema.parse({ url: 'https://stackoverflow.com/q/1', ...over })

  it('makes a snippet from the code with the language and the page link', () => {
    const s = snippetFrom(
      input({
        target: 'snippet',
        title: 'Debounce a function',
        selection: '\n\n  const id = setTimeout(fn, ms)\n\n',
        language: 'javascript',
        note: 'Без lodash'
      }),
      ['t1']
    )
    expect(s).toEqual({
      title: 'Debounce a function',
      code: '  const id = setTimeout(fn, ms)',
      language: 'javascript',
      description: `Без lodash\n\n${SO}`,
      tagIds: ['t1']
    })
  })

  it('saves code without a language as text and falls back to the host for the title', () => {
    const s = snippetFrom(input({ target: 'snippet', title: '   ', selection: 'x := 1' }), [])
    expect(s).toMatchObject({ title: 'stackoverflow.com', language: 'text', description: SO })
  })

  it('refuses a snippet without code under the «Код» field', () => {
    expect(() => snippetFrom(input({ target: 'snippet', selection: ' \n ' }), [])).toThrow(/^Код: /)
  })

  it('clips a long description to the snippet limit, never the link', () => {
    const s = snippetFrom(
      input({ target: 'snippet', selection: 'a'.repeat(200_000), note: 'b'.repeat(10_000) }),
      []
    )
    expect(s.description).toHaveLength(fieldMax(snippetInputSchema.shape.description))
    expect(s.description.endsWith(SO)).toBe(true)
    expect(s.code).toHaveLength(fieldMax(snippetInputSchema.shape.code))
    expect(snippetInputSchema.safeParse(s).success).toBe(true)
  })

  it('makes a note from the selection with the link at the end', () => {
    const n = noteFrom(input({ target: 'note', title: 'Цитата', selection: ' Текст статті ' }), [])
    expect(n).toEqual({ title: 'Цитата', body: `Текст статті\n\n${SO}`, tagIds: [] })
    expect(noteFrom(input({ target: 'note' }), []).body).toBe(SO)
  })

  it('makes a resolved fix when there is a solution, with the link under it', () => {
    const f = fixFrom(
      input({
        target: 'fix',
        title: 'Cannot find module',
        selection: 'Error: Cannot find module "x"\n    at require',
        note: 'Кеш',
        solution: 'rm -rf node_modules && npm i'
      }),
      []
    )
    expect(f).toMatchObject({
      errorText: 'Error: Cannot find module "x"\n    at require',
      cause: 'Кеш',
      solution: `rm -rf node_modules && npm i\n\n${SO}`,
      resolved: true
    })
  })

  it('keeps a fix without a solution open, with the link under the cause', () => {
    const f = fixFrom(input({ target: 'fix', title: 'Crash', selection: 'boom' }), [])
    expect(f).toMatchObject({ errorText: 'boom', cause: SO, solution: '', resolved: false })
  })

  it('clips a huge error text to the fix limit', () => {
    const f = fixFrom(input({ target: 'fix', title: 'Crash', selection: 'e'.repeat(200_000) }), [])
    expect(f.errorText).toHaveLength(fieldMax(fixInputSchema.shape.errorText))
    expect(fixInputSchema.safeParse(f).success).toBe(true)
  })
})

describe('CaptureServer: the new targets over HTTP', () => {
  const KEY = 'k'.repeat(32)
  const record = async (i: { title: string }): Promise<{ id: string; title: string }> => ({
    id: 'id1',
    title: i.title
  })
  const created = {
    snippets: vi.fn(record),
    notes: vi.fn(record),
    fixes: vi.fn(record)
  }
  const api = {
    tags: { create: vi.fn(async ({ name }: { name: string }) => ({ id: `tag-${name}` })) },
    files: { add: vi.fn() },
    snippets: { create: created.snippets },
    notes: { create: created.notes },
    fixes: { create: created.fixes }
  }
  const config = {
    settings: { captureEnabled: true, capturePort: 0 },
    secret: () => KEY,
    setSecret: () => undefined,
    onSettingsChange: () => () => undefined
  }
  let server: CaptureServer
  let base = ''

  beforeAll(async () => {
    server = new CaptureServer(
      config as unknown as ConfigStore,
      () => api as unknown as Api,
      { dataChanged: vi.fn() } as unknown as EventBus,
      () => undefined,
      ''
    )
    server.start()
    const http = (server as unknown as { server: Server }).server
    if (!http.listening) await new Promise((resolve) => http.once('listening', resolve))
    base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })
  afterAll(() => server.stop())

  const post = async (
    body: unknown
  ): Promise<{ status: number; json: Record<string, unknown> }> => {
    const res = await fetch(`${base}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vault-Key': KEY },
      body: JSON.stringify(body)
    })
    return { status: res.status, json: (await res.json()) as Record<string, unknown> }
  }

  it('lists its targets in /ping for the popup', async () => {
    const res = await fetch(`${base}/ping`, { headers: { 'X-Vault-Key': KEY } })
    const json = (await res.json()) as { targets: string[] }
    expect(json.targets).toEqual(expect.arrayContaining(['snippet', 'note', 'fix', 'design']))
  })

  it('saves a snippet with its tags and says where', async () => {
    const r = await post({
      target: 'snippet',
      url: 'https://gist.github.com/a/1',
      title: 'useDebounce',
      selection: 'export const x = 1',
      language: 'typescript',
      tags: ['react']
    })
    expect(r).toMatchObject({
      status: 200,
      json: { ok: true, type: 'snippet', id: 'id1', title: 'useDebounce', section: 'Сніпети' }
    })
    expect(created.snippets).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'export const x = 1',
        language: 'typescript',
        tagIds: ['tag-react']
      })
    )
  })

  it('saves a note and a fix', async () => {
    const note = await post({ target: 'note', url: 'https://x.dev/a', title: 'A', selection: 'B' })
    expect(note.json).toMatchObject({ type: 'note', section: 'Нотатки' })
    const fix = await post({ target: 'fix', url: 'https://x.dev/a', title: 'E', selection: 'boom' })
    expect(fix.json).toMatchObject({ type: 'fix', section: 'Помилки й рішення' })
    expect(created.fixes).toHaveBeenLastCalledWith(expect.objectContaining({ resolved: false }))
  })

  it('refuses a snippet without code and an unknown language with the field label', async () => {
    const empty = await post({ target: 'snippet', url: 'https://x.dev', title: 'A', selection: '' })
    expect(empty.status).toBe(400)
    expect(empty.json.error).toMatch(/^Код: /)
    const lang = await post({
      target: 'snippet',
      url: 'https://x.dev',
      selection: 'a',
      language: 'cobol'
    })
    expect(lang.status).toBe(400)
    expect(lang.json.error).toMatch(/^Мова: /)
  })

  it('creates no tags for a refused capture', async () => {
    api.tags.create.mockClear()
    const snippet = await post({
      target: 'snippet',
      url: 'https://x.dev',
      selection: ' \n',
      tags: ['orphan']
    })
    expect(snippet.status).toBe(400)
    const design = await post({ target: 'design', url: 'https://x.dev', tags: ['orphan'] })
    expect(design.status).toBe(400)
    expect(design.json.error).toBe('Для дизайну потрібен скриншот')
    expect(api.tags.create).not.toHaveBeenCalled()
  })
})

describe('extension: language and target hints', () => {
  it('guesses snippet languages from code', () => {
    const cases: [string, string | null][] = [
      ['const a: number = 1', 'typescript'],
      ['import x from "y"\nconsole.log(x)', 'javascript'],
      ['export function A() {\n  return <div className="a" />\n}', 'tsx'],
      ['const el = <Button size="sm">Ок</Button>', 'tsx'],
      // Generics are not tags.
      [
        'export function useDebounce<T>(value: T, delay = 300): T {\n  const [v] = useState<T>(value)\n  return v\n}',
        'typescript'
      ],
      ['function debounce(fn, ms) {\n  let t\n  return (...args) => fn(...args)\n}', 'javascript'],
      ['<!doctype html>\n<html></html>', 'html'],
      ['.btn {\n  color: red;\n}', 'css'],
      ['{"a": 1}', 'json'],
      ['npm i zustand', 'bash'],
      ['SELECT id FROM users WHERE a = 1', 'sql'],
      ['query Me { me { id } }', 'graphql'],
      ['{% if x %}{{ product.title }}{% endif %}', 'liquid'],
      ['def foo(x):\n    return x', null],
      ['', null]
    ]
    for (const [code, lang] of cases) expect([code, guessLanguage(code)]).toEqual([code, lang])
    // Every id the popup offers is a snippet language.
    for (const [id] of LANGUAGES) expect(SNIPPET_LANGUAGES).toContain(id)
  })

  it('tells code from prose', () => {
    expect(looksLikeCode('def foo(x):\n    return x')).toBe(true)
    expect(looksLikeCode('const a = 1')).toBe(true)
    expect(looksLikeCode('Це просто речення про те, як працює React.')).toBe(false)
    expect(looksLikeCode('')).toBe(false)
  })

  it('suggests «Сніпет» for code on GitHub files, gists and Stack Exchange only', () => {
    const code = 'const a = 1'
    expect(suggestTarget('https://stackoverflow.com/questions/1/x', code)).toBe('snippet')
    expect(suggestTarget('https://unix.stackexchange.com/questions/1/x', 'ls -la')).toBe('snippet')
    expect(suggestTarget('https://gist.github.com/user/abc', code)).toBe('snippet')
    expect(suggestTarget('https://github.com/o/r/blob/main/src/a.ts', code)).toBe('snippet')
    // Prose, no selection or another site: the old hints.
    expect(suggestTarget('https://stackoverflow.com/questions/1/x', 'Дякую, допомогло!')).toBe(
      'bookmark'
    )
    expect(suggestTarget('https://github.com/o/r', code)).toBe('library')
    expect(suggestTarget('https://example.com/post', code)).toBe('bookmark')
  })
})

describe('CaptureServer: pairing over HTTP', () => {
  const KEY = 'p'.repeat(32)
  const EXT_ID = 'ighcmeieigdefhjpidfbcainaoopopbk'
  const ORIGIN = `chrome-extension://${EXT_ID}`
  const OTHER = `chrome-extension://${'c'.repeat(32)}`
  const config = {
    settings: { captureEnabled: true, capturePort: 0 },
    secrets: { captureKey: KEY } as Record<string, string | null>,
    captureClients: [] as { origin: string; approvedAt: number }[],
    secret(name: string) {
      return this.secrets[name] ?? null
    },
    setSecret(name: string, value: string | null) {
      this.secrets[name] = value
    },
    onSettingsChange: () => () => undefined
  }
  const changes: (string | null)[] = []
  let server: CaptureServer
  let base = ''
  let port = 0

  beforeAll(async () => {
    server = new CaptureServer(
      config as unknown as ConfigStore,
      () => ({}) as Api,
      { dataChanged: vi.fn() } as unknown as EventBus,
      () => undefined,
      '',
      {
        // No rate limit between the tests' requests; one case below checks it with its own broker.
        pairing: new PairingBroker({ minGapMs: 0, perMinute: 1000 }),
        folder: { dir: '/ext', version: '0.3.0', extensionId: EXT_ID }
      }
    )
    server.onPairChange((p) => changes.push(p?.origin ?? null))
    server.start()
    const http = (server as unknown as { server: Server }).server
    if (!http.listening) await new Promise((resolve) => http.once('listening', resolve))
    port = (http.address() as AddressInfo).port
    base = `http://127.0.0.1:${port}`
  })
  afterAll(() => server.stop())

  const call = async (
    path: string,
    headers: Record<string, string> = { Origin: ORIGIN },
    method = 'POST'
  ): Promise<{ status: number; json: Record<string, unknown> }> => {
    const res = await fetch(`${base}${path}`, { method, headers })
    return { status: res.status, json: (await res.json()) as Record<string, unknown> }
  }

  it('tells a popup without a key that this Vault can pair, and reports the extension version', async () => {
    const nokey = await call('/ping', {}, 'GET')
    expect(nokey).toMatchObject({ status: 401, json: { ok: false, app: 'vault', pair: 1 } })
    const ok = await call('/ping', { 'X-Vault-Key': KEY }, 'GET')
    expect(ok.json).toMatchObject({ ok: true, app: 'vault', extension: '0.3.0', pair: 1 })
  })

  it('refuses pairing to web pages, requests without an origin and foreign hosts', async () => {
    expect((await call('/pair', { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('/pair', {})).status).toBe(403)
    // DNS rebinding: the page's own host name, resolved to 127.0.0.1.
    const rebound = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/pair',
          method: 'POST',
          headers: { Host: `evil.example:${port}`, Origin: ORIGIN }
        },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        }
      )
      req.on('error', reject)
      req.end()
    })
    expect(rebound).toBe(403)
    expect(server.pendingPair()).toBeNull()
  })

  it('gives the key only after «Дозволити», once, to the extension that asked', async () => {
    changes.length = 0
    const opened = await call('/pair')
    expect(opened.json).toMatchObject({ ok: true, expiresIn: 60_000 })
    const id = opened.json.id as string
    expect(server.pendingPair()).toMatchObject({ id, origin: ORIGIN, vault: true })
    expect(changes).toEqual([ORIGIN])
    const waiting = await call(`/pair/${id}`)
    expect(waiting.json).toMatchObject({ ok: true, state: 'waiting' })
    expect(waiting.json.key).toBeUndefined()
    // Another extension polling the same id learns nothing.
    expect((await call(`/pair/${id}`, { Origin: OTHER })).json).toEqual({
      ok: true,
      state: 'expired'
    })
    server.answerPair({ id, allow: true })
    expect(changes).toEqual([ORIGIN, null])
    expect(config.captureClients.map((c) => c.origin)).toEqual([ORIGIN])
    expect(server.info().clients).toEqual([
      expect.objectContaining({ origin: ORIGIN, vault: true })
    ])
    expect((await call(`/pair/${id}`)).json).toEqual({ ok: true, state: 'approved', key: KEY })
    expect((await call(`/pair/${id}`)).json).toEqual({ ok: true, state: 'expired' })
  })

  it('says «denied» after «Відхилити» and refuses an answer for a replaced request', async () => {
    const first = (await call('/pair')).json.id as string
    const second = (await call('/pair', { Origin: OTHER })).json.id as string
    expect(server.pendingPair()).toMatchObject({ id: second, origin: OTHER, vault: false })
    expect(() => server.answerPair({ id: first, allow: true })).toThrow(/не дійсний/)
    server.answerPair({ id: second, allow: false })
    expect((await call(`/pair/${second}`, { Origin: OTHER })).json).toEqual({
      ok: true,
      state: 'denied'
    })
    expect(config.captureClients.map((c) => c.origin)).toEqual([ORIGIN])
  })

  it('closes the question when the extension cancels', async () => {
    changes.length = 0
    const id = (await call('/pair')).json.id as string
    expect((await call(`/pair/${id}/cancel`, { Origin: OTHER })).json).toEqual({ ok: false })
    expect(server.pendingPair()?.id).toBe(id)
    expect((await call(`/pair/${id}/cancel`)).json).toEqual({ ok: true })
    expect(server.pendingPair()).toBeNull()
    expect(changes).toEqual([ORIGIN, null])
    expect(() => server.answerPair({ id, allow: true })).toThrow(/не дійсний/)
  })

  it('rotates the key and forgets paired extensions on «Відключити»', () => {
    server.regenerate()
    expect(config.secrets.captureKey).not.toBe(KEY)
    expect(server.info().clients).toEqual([])
  })

  it('rate-limits asking', async () => {
    const limited = new CaptureServer(
      { ...config, settings: { captureEnabled: true, capturePort: 0 } } as unknown as ConfigStore,
      () => ({}) as Api,
      { dataChanged: vi.fn() } as unknown as EventBus,
      () => undefined,
      '',
      { pairing: new PairingBroker({ minGapMs: 5000 }) }
    )
    limited.start()
    const http = (limited as unknown as { server: Server }).server
    if (!http.listening) await new Promise((resolve) => http.once('listening', resolve))
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/pair`
    const ask = (): Promise<Response> => fetch(url, { method: 'POST', headers: { Origin: ORIGIN } })
    expect((await ask()).status).toBe(200)
    const second = await ask()
    expect(second.status).toBe(429)
    expect(((await second.json()) as { error: string }).error).toMatch(/Забагато/)
    limited.stop()
  })
})

describe('extension: self-update', () => {
  it('compares manifest versions numerically', () => {
    expect(isNewerVersion('0.3.10', '0.3.9')).toBe(true)
    expect(isNewerVersion('0.4', '0.3.9')).toBe(true)
    expect(isNewerVersion('0.3.0', '0.3')).toBe(false)
    expect(isNewerVersion('0.2.9', '0.3.0')).toBe(false)
    expect(isNewerVersion(null, '0.3.0')).toBe(false)
    expect(isNewerVersion('0.3.x', '0.3.0')).toBe(false)
  })

  it('reloads once per newer version, never in a loop', () => {
    expect(updateAction('0.3.1', '0.3.0', undefined)).toBe('reload')
    expect(updateAction('0.3.1', '0.3.0', '0.3.0')).toBe('reload')
    // Reloaded for 0.3.1 and still 0.3.0: Chrome loads another folder.
    expect(updateAction('0.3.1', '0.3.0', '0.3.1')).toBe('stale')
    expect(updateAction('0.3.0', '0.3.0', undefined)).toBeNull()
    // An older Vault never downgrades the extension.
    expect(updateAction('0.2.0', '0.3.0', undefined)).toBeNull()
    expect(updateAction(undefined, '0.3.0', undefined)).toBeNull()
  })
})
