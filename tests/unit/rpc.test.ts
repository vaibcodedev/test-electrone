import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const { changedTypes, formatError } = await import('@main/ipc/rpc-utils')
const { NotFoundError, UserError } = await import('@main/core/util')

describe('changedTypes (which windows must refresh after a call)', () => {
  it('quick add tells every window which type it created', () => {
    expect(changedTypes('app', 'quickAdd', { type: 'idea', id: '1', title: 'x' })).toEqual(['idea'])
    expect(changedTypes('app', 'quickAdd', { type: 'card', id: '1', title: 'x' })).toEqual(['card'])
  })
  it('other app methods change no data (logError must not invalidate every cache)', () => {
    expect(changedTypes('app', 'logError', undefined)).toBeUndefined()
    expect(changedTypes('app', 'openExternal', undefined)).toBeUndefined()
  })
  it('reads change nothing, writes of a module report its types', () => {
    expect(changedTypes('ideas', 'list', [])).toBeUndefined()
    expect(changedTypes('ideas', 'create', {})).toEqual(['idea'])
    expect(changedTypes('jobs', 'addStage', {})).toContain('event')
  })
})

describe('formatError', () => {
  it('zod errors are validation errors', () => {
    const r = z.object({ n: z.number() }).safeParse({ n: 'x' })
    expect(formatError(r.error).code).toBe('VALIDATION')
  })
  it('keeps the code of our own errors', () => {
    expect(formatError(new UserError('Так не можна'))).toEqual({ error: 'Так не можна', code: 'USER' })
  })
  it('a missing record speaks Ukrainian and keeps its id out of the toast', () => {
    const e = new NotFoundError('idea', '3f2a-uuid')
    expect(formatError(e).error).toBe('Ідея: запис не знайдено — можливо, його видалено')
    expect(formatError(e).error).not.toContain('3f2a')
    expect(e.id).toBe('3f2a-uuid')
    expect(new NotFoundError('Колонка', '1').message).toBe('Колонка: запис не знайдено — можливо, його видалено')
  })
  // A read taken for a write: its own answer sent data:changed, every active query was fetched again, this one
  // too, and so on without end (templates.situations re-rendered the open template dozens of times a second).
  it('no method the renderer reads through a query counts as a write', () => {
    const root = resolve('src/renderer/src')
    const calls = new Set<string>()
    for (const file of readdirSync(root, { recursive: true, encoding: 'utf-8' })) {
      if (!/\.tsx?$/.test(file)) continue
      const source = readFileSync(join(root, file), 'utf-8')
      for (const m of source.matchAll(/use(?:InPlace|Infinite)?Api\(\s*'(\w+)',\s*'(\w+)'/g))
        calls.add(`${m[1]}.${m[2]}`)
    }
    expect(calls.size).toBeGreaterThan(50)
    const asWrites = [...calls].filter((call) => {
      const [ns, method] = call.split('.')
      return changedTypes(ns, method, undefined) !== undefined
    })
    expect(asWrites).toEqual([])
  })
})
