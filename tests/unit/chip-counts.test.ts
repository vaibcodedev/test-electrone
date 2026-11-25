/** Chip counters computed in SQL (`counts` methods) under the same search and tag as the list. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeModule } from '@main/modules/knowledge'
import { IdeasModule } from '@main/modules/ideas'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
let knowledge: KnowledgeModule
let ideas: IdeasModule
beforeEach(() => {
  v = openVault()
  knowledge = new KnowledgeModule(v.m)
  ideas = new IdeasModule(v.m, v.boards)
  for (const d of [...knowledge.descriptors, ideas.descriptor]) v.registry.register(d)
})
afterEach(() => v.close())

describe('chip counts', () => {
  it('ideas per status follow the search; the trash is not counted', async () => {
    const api = ideas.api()
    await api.create({ title: 'Канбан для дому' })
    await api.create({ title: 'Канбан для роботи', status: 'planned' })
    const gone = await api.create({ title: 'Канбан у кошику' })
    await api.create({ title: 'Інше' })
    await api.remove(gone.id)
    expect(await api.counts({ search: 'канбан' })).toEqual({ inbox: 1, planned: 1 })
  })

  it('fixes split into open and resolved', async () => {
    const api = knowledge.fixesApi()
    await api.create({ title: 'CORS', resolved: false })
    await api.create({ title: 'Білий екран', resolved: true })
    expect(await api.counts()).toEqual({ open: 1, resolved: 1 })
  })

  it('bookmark statuses are counted inside the chosen kind, kinds over all', async () => {
    const api = knowledge.bookmarksApi()
    await api.create({ title: 'Відео', url: 'https://youtu.be/x', kind: 'video' })
    await api.create({ title: 'Стаття', url: 'https://example.com/a', kind: 'article', status: 'done' })
    const { byKind, byStatus } = await api.counts({ kind: 'article' })
    expect(byKind).toEqual({ video: 1, article: 1 })
    expect(byStatus).toEqual({ done: 1 })
  })

  it('most copied lists snippets and prompts by copy count, without their text', async () => {
    const snippets = knowledge.snippetsApi()
    const claude = knowledge.claudeApi()
    const s = await snippets.create({ title: 'debounce', code: 'const x = 1' })
    const p = await claude.create({ title: 'Ревʼю', kind: 'prompt', content: 'Перевір код' })
    await snippets.markCopied(s.id)
    for (let i = 0; i < 2; i++) await claude.markCopied(p.id)
    const top = await knowledge.knowledgeApi().mostCopied()
    expect(top.map((t) => [t.type, t.id, t.count])).toEqual([
      ['claude', p.id, 2],
      ['snippet', s.id, 1]
    ])
    expect(Object.keys(top[0]).sort()).toEqual(['count', 'id', 'sub', 'title', 'type'])
  })
})
