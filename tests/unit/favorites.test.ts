/**
 * «Обране» (pins kind 'favorite'): favourites go first in a section's own list, the «Обране» chip filters
 * list and counters alike, and manual orders, queues and the trash are left alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ideas as ideasTable } from '@main/db/schema'
import { KnowledgeModule } from '@main/modules/knowledge'
import { IdeasModule } from '@main/modules/ideas'
import { PinService } from '@main/services/pin-service'
import { newId } from '@main/core/util'
import type { EntityType } from '@shared/entity-types'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
let knowledge: KnowledgeModule
let ideas: IdeasModule
let pins: PinService
const star = (type: EntityType, id: string): void => {
  pins.toggle({ type, id }, 'favorite')
}
const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id)

beforeEach(() => {
  v = openVault()
  knowledge = new KnowledgeModule(v.m)
  ideas = new IdeasModule(v.m, v.boards)
  for (const d of [...knowledge.descriptors, ideas.descriptor]) v.registry.register(d)
  pins = new PinService(v.db, v.registry)
})
afterEach(() => v.close())

describe('favourites first in a section list', () => {
  it('ideas: favourites lead, the rest keep the impact / last-edited order', async () => {
    const api = ideas.api()
    for (const [title, impact] of [
      ['А', 0],
      ['Б', 3],
      ['В', 1],
      ['Г', 2],
      ['Ґ', 0]
    ] as const)
      await api.create({ title, impact })
    const before = ids(await api.list())
    const favs = [before[3], before[1]]
    for (const id of favs) star('idea', id)

    const after = ids(await api.list())
    // Among themselves the favourites keep the old order too.
    const favsInOrder = before.filter((id) => favs.includes(id))
    expect(after).toEqual([...favsInOrder, ...before.filter((id) => !favs.includes(id))])
  })

  it('pages of 100 over 250 notes: favourites first, no row repeated or skipped', async () => {
    const api = knowledge.notesApi()
    const all: string[] = []
    for (let i = 0; i < 250; i++)
      all.push((await api.create({ title: `Нотатка ${i}`, body: 'x' })).id)
    const favs = [all[10], all[120], all[249]]
    for (const id of favs) star('note', id)

    const pages = [
      ...(await api.list({ limit: 100, offset: 0 })),
      ...(await api.list({ limit: 100, offset: 100 })),
      ...(await api.list({ limit: 100, offset: 200 }))
    ]
    expect(pages).toHaveLength(250)
    expect(new Set(ids(pages)).size).toBe(250)
    expect(new Set(ids(pages).slice(0, 3))).toEqual(new Set(favs))
  })

  it('snippets through createCrudApi: no change in the module needed', async () => {
    const api = knowledge.snippetsApi()
    const old = await api.create({ title: 'debounce', code: 'x' })
    await api.create({ title: 'throttle', code: 'y' })
    star('snippet', old.id)
    expect(ids(await api.list())[0]).toBe(old.id)
  })

  it('boards: an archived favourite stays below the live boards', async () => {
    const api = v.api.boards
    const a = await api.create({ title: 'Стара обрана' })
    const archived = await api.create({ title: 'Архівна обрана' })
    const c = await api.create({ title: 'Свіжа' })
    await api.update({ id: archived.id, patch: { archived: true } })
    star('board', a.id)
    star('board', archived.id)
    expect(ids(await api.list())).toEqual([a.id, c.id, archived.id])
  })
})

describe('the «Обране» chip', () => {
  it('filters notes and their folder counters, ideas and their status counters', async () => {
    const notes = knowledge.notesApi()
    const n1 = await notes.create({ title: 'Робоча', folder: 'Робота', body: 'x' })
    await notes.create({ title: 'Ще робоча', folder: 'Робота', body: 'x' })
    await notes.create({ title: 'Дім', folder: 'Дім', body: 'x' })
    star('note', n1.id)
    expect(ids(await notes.list({ favorite: true }))).toEqual([n1.id])
    expect(await notes.folderCounts({ favorite: true })).toEqual([{ folder: 'Робота', count: 1 }])
    expect(await notes.list({ favorite: false })).toHaveLength(3)

    const api = ideas.api()
    const i1 = await api.create({ title: 'Обрана', status: 'planned' })
    await api.create({ title: 'Звичайна' })
    star('idea', i1.id)
    expect(await api.counts({ favorite: true })).toEqual({ planned: 1 })
    expect(await api.counts({})).toEqual({ planned: 1, inbox: 1 })
  })
})

describe('where the order is yours, ★ only marks', () => {
  it('cards of a column and designs of a moodboard keep their manual order', async () => {
    const board = await v.api.boards.create({ title: 'Дошка' })
    const col = v.boards.columns(board.id)[0]
    for (const title of ['1', '2', '3'])
      await v.api.cards.create({ boardId: board.id, columnId: col.id, title })
    const cardsBefore = ids((await v.api.boards.details(board.id))!.cards)
    star('card', cardsBefore[2])
    expect(ids((await v.api.boards.details(board.id))!.cards)).toEqual(cardsBefore)

    const mb = await v.media.moodboardsApi().create({ title: 'Добірка' })
    const designs = v.media.designsApi()
    const d = [await designs.create({ title: 'А' }), await designs.create({ title: 'Б' })]
    await v.media.moodboardsApi().addDesigns({ moodboardId: mb.id, designIds: ids(d) })
    const designsBefore = ids((await v.media.moodboardsApi().details(mb.id))!.designs)
    star('design', designsBefore[1])
    expect(ids((await v.media.moodboardsApi().details(mb.id))!.designs)).toEqual(designsBefore)
  })

  it('the review queues of words and questions do not change', async () => {
    for (const term of ['apple', 'banana', 'cherry']) await v.api.english.create({ term })
    const queue = ids(await v.api.english.queue(10))
    star('word', queue[queue.length - 1])
    expect(ids(await v.api.english.queue(10))).toEqual(queue)

    for (const question of ['Що таке замикання?', 'Що таке event loop?'])
      await v.api.jobs.createQuestion({ question })
    const practice = ids(await v.api.jobs.practiceQueue({}))
    star('question', practice[practice.length - 1])
    expect(ids(await v.api.jobs.practiceQueue({}))).toEqual(practice)
  })
})

describe('pins.refs', () => {
  it('leaves out the trash and cards of a trashed board, brings them back after a restore', async () => {
    const note = await knowledge.notesApi().create({ title: 'Нотатка', body: 'x' })
    const board = await v.api.boards.create({ title: 'Дошка' })
    const card = await v.api.cards.create({
      boardId: board.id,
      columnId: v.boards.columns(board.id)[0].id,
      title: 'Картка'
    })
    star('note', note.id)
    star('card', card.id)
    const api = pins.api()
    expect(await api.refs('favorite')).toEqual([
      { type: 'note', id: note.id },
      { type: 'card', id: card.id }
    ])

    await knowledge.notesApi().remove(note.id)
    await v.api.boards.remove(board.id)
    expect(await api.refs('favorite')).toEqual([])
    expect(await api.refs('pin')).toEqual([])

    v.trash.restore({ type: 'note', id: note.id })
    v.trash.restore({ type: 'board', id: board.id })
    expect(await api.refs('favorite')).toHaveLength(2)
  })

  it('more favourites than one SQLite statement takes: checked in chunks', () => {
    const many = Array.from({ length: 1200 }, () => newId())
    expect(v.registry.liveIds('idea', many).size).toBe(0)
  })
})

describe('the SQL', () => {
  it('the EXISTS stays bound to the outer row', () => {
    const { sql } = v.db.orm.select().from(ideasTable).orderBy(ideas.repo.favoritesFirst()).toSQL()
    expect(sql).toContain('"pins"."entity_id" = "ideas"."id"')
    expect(sql).toMatch(/order by exists \(select 1 from "pins"/i)
  })

  it('a page of 100 out of 5 000 ideas, 50 of them favourites, takes under 50 ms', async () => {
    const ts = Date.now()
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      id: newId(),
      title: `Ідея ${i}`,
      body: '',
      status: 'inbox',
      impact: i % 4,
      boardId: null,
      createdAt: ts + i,
      updatedAt: ts + i,
      deletedAt: null
    }))
    v.db.tx(() => {
      for (let i = 0; i < rows.length; i += 500)
        v.db.orm
          .insert(ideasTable)
          .values(rows.slice(i, i + 500))
          .run()
    })
    for (const r of rows.slice(0, 50)) star('idea', r.id)
    const api = ideas.api()
    await api.list({ limit: 100 })
    const started = performance.now()
    const page = await api.list({ limit: 100 })
    expect(performance.now() - started).toBeLessThan(50)
    expect(new Set(ids(page.slice(0, 50)))).toEqual(new Set(ids(rows.slice(0, 50))))
  })
})
