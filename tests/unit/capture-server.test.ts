import { describe, expect, it, vi } from 'vitest'

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

import { captureIssue, libraryFrom, parseLibraryPage } from '@main/services/capture-server'
import { captureSchema } from '@shared/domain/dev'

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
