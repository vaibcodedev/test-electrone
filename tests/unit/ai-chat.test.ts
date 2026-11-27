/**
 * «Чат ШІ»: reading the model's answer (actions, citations), the context under a budget, and the actions on a
 * real database — created through the module APIs, edits through the registry, «Скасувати» for both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AiChat, AiChatMessage, AiChatSummary } from '@shared/domain/ai-chat'
import type { EntityRef } from '@shared/domain/common'
import { IdeasModule } from '@main/modules/ideas'
import { KnowledgeModule } from '@main/modules/knowledge'
import { AiActionRunner, parseLocalWhen } from '@main/services/ai/actions'
import { RegistryRecordWriter } from '@main/services/ai/record-writer'
import { AiChatService, type AiChatBase, type AiRequester } from '@main/services/ai/chat'
import { ChatStore, type AiChatHistory } from '@main/services/ai/chat-store'
import {
  BUDGET,
  CHAT_TITLE_MAX,
  chatSystem,
  chatTitle,
  historyTurns,
  keywords,
  linkCitations,
  parseChatReply,
  sourcesBlock
} from '@main/services/ai/chat-prompt'
import { UserError } from '@main/core/util'
import { FreelanceModule } from '@main/modules/freelance'
import { z } from 'zod'
import { aiActionSchema, withEdits } from '@shared/domain/ai-actions'
import { APP_SECTIONS, appMapPrompt, sectionAt } from '@shared/app-map'
import { checklistItemInputSchema } from '@shared/domain/checklists'
import { fieldMax, MAX } from '@shared/domain/limits'
import { GUIDE, HOME, HUBS, TOP_ITEMS } from '@/app/navigation'
import { recordFromLocation } from '@/features/ai-chat/context'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const reason = async (p: Promise<unknown>): Promise<string> => {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  )
  expect(e).toBeInstanceOf(UserError)
  return (e as Error).message
}

const block = (json: unknown): string => `\n\n\`\`\`vault-actions\n${JSON.stringify(json)}\n\`\`\``

describe('the answer', () => {
  it('takes the actions out of the text; invalid ones are counted, not applied', () => {
    const reply =
      '<think>hmm</think>Пропоную ідею й картку.' +
      block({
        actions: [
          { type: 'create_idea', title: 'Кеш запитів', body: 'React Query' },
          { type: 'create_card', title: '' },
          { type: 'delete_everything' },
          { type: 'create_snippet', title: 'Регекс', code: 'x', language: 'python' }
        ]
      })
    const { text, actions, skipped } = parseChatReply(reply)
    expect(text).toBe('Пропоную ідею й картку.')
    expect(actions).toEqual([
      { type: 'create_idea', title: 'Кеш запитів', body: 'React Query' },
      // A language the list doesn't know is plain text, not a failure.
      { type: 'create_snippet', title: 'Регекс', code: 'x', language: 'text', description: '' }
    ])
    expect(skipped).toBe(2)
  })

  it('reads a plain ```json block at the end and a block cut off by the token limit', () => {
    const json = parseChatReply('Готово.\n```json\n[{"type":"create_note","title":"Нотатка"}]\n```')
    expect(json.text).toBe('Готово.')
    expect(json.actions).toEqual([{ type: 'create_note', title: 'Нотатка', body: '', folder: '' }])
    const cut = parseChatReply(
      'Ось.\n```vault-actions\n{"actions":[{"type":"create_idea","title":"А"}]}'
    )
    expect(cut.actions).toHaveLength(1)
    // A code sample in the answer is not an action block.
    const code = parseChatReply('Приклад:\n```json\n{"a": 1}\n```')
    expect(code.actions).toEqual([])
    expect(code.text).toContain('{"a": 1}')
  })

  it('an image in the answer becomes a link: nothing loads from a stranger’s server by itself', () => {
    expect(parseChatReply('Ось ![схема](https://evil.example/p.png?d=1 "t") і все').text).toBe(
      'Ось [схема](https://evil.example/p.png?d=1) і все'
    )
  })

  it('at most five actions; longer titles than the module allows are refused', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ type: 'create_idea', title: `І${i}` }))
    expect(parseChatReply(block({ actions: many })).actions).toHaveLength(5)
    const long = parseChatReply(block([{ type: 'create_idea', title: 'x'.repeat(MAX.title + 1) }]))
    expect(long.actions).toEqual([])
    expect(long.skipped).toBe(1)
  })

  it('turns [n] into links to the records it cites, leaves code and unknown numbers alone', () => {
    const sources = [
      {
        n: 1,
        ref: { type: 'note', id: 'n1' } as EntityRef,
        title: 'Docker на Windows',
        cited: false
      },
      { n: 2, ref: { type: 'idea', id: 'i2' } as EntityRef, title: 'Кеш', cited: false }
    ]
    const { text, sources: out } = linkCitations(
      'Потрібен WSL2 [1]. Див. також [1, 2] і [7]. `arr[1]` лишається.',
      sources
    )
    expect(text).toBe(
      'Потрібен WSL2 [Docker на Windows](vault:note/n1). Див. також [Docker на Windows](vault:note/n1), [Кеш](vault:idea/i2) і [7]. `arr[1]` лишається.'
    )
    expect(out.map((s) => s.cited)).toEqual([true, true])
  })
})

describe('the context', () => {
  it('search words: no fillers, long words cut for other forms', () => {
    expect(keywords('Що я писав про Docker на Windows і як налаштовував WSL?')).toEqual([
      'писав',
      'docker',
      'windows',
      'налашт',
      'wsl'
    ])
    expect(keywords('що це?')).toEqual([])
  })

  it('records found in the base stay within the budget and are numbered', () => {
    const big = 'x'.repeat(5000)
    const found = Array.from({ length: 6 }, (_, i) => ({
      ref: { type: 'note' as const, id: `n${i}` },
      title: `Нотатка ${i}`,
      body: big
    }))
    const { text, sources } = sourcesBlock(found)
    expect(text.length).toBeLessThan(BUDGET.sources + 1500)
    expect(sources.map((s) => s.n)).toEqual(sources.map((_, i) => i + 1))
    expect(sources.length).toBeLessThan(6)
    expect(text).toContain('[1] Нотатка «Нотатка 0»')
    expect(sourcesBlock([]).text).toContain('<base_results>none</base_results>')
  })

  it('earlier turns alternate, start with the person and end with the assistant', () => {
    const msg = (role: 'user' | 'assistant', text: string): AiChatMessage => ({
      id: text,
      role,
      text,
      at: 0,
      context: null,
      searched: false,
      sources: [],
      actions: [],
      skipped: 0,
      model: ''
    })
    const turns = historyTurns([
      msg('assistant', 'привіт'),
      msg('user', 'а'),
      msg('assistant', 'б'),
      msg('user', 'в')
    ])
    expect(turns).toEqual([
      { role: 'user', text: 'а' },
      { role: 'assistant', text: 'б' }
    ])
  })

  it('the system prompt offers edits only with a record open', () => {
    const now = new Date(2026, 10, 25, 14, 5).getTime()
    const plain = chatSystem({ now, boards: ['Робота'], contextType: null })
    expect(plain).toContain('2026-11-25')
    expect(plain).toContain('«Робота»')
    expect(plain).not.toContain('append_text')
    expect(chatSystem({ now, boards: [], contextType: 'note' })).toContain('append_text')
  })

  it('reads a local day or day and time; a day that does not exist is refused', () => {
    expect(parseLocalWhen('2026-11-26')).toEqual({
      at: new Date(2026, 10, 26).getTime(),
      allDay: true
    })
    expect(parseLocalWhen('2026-11-26T10:30')).toEqual({
      at: new Date(2026, 10, 26, 10, 30).getTime(),
      allDay: false
    })
    expect(parseLocalWhen('2026-02-31')).toBeNull()
    expect(parseLocalWhen('завтра')).toBeNull()
  })
})

describe('the context chip', () => {
  it('finds the open record from the URL the way search and links open it', () => {
    expect(recordFromLocation('/ideas', '?open=abc')).toEqual({ type: 'idea', id: 'abc' })
    expect(recordFromLocation('/notes', '?open=n1&tag=x')).toEqual({ type: 'note', id: 'n1' })
    expect(recordFromLocation('/clients/c1', '')).toEqual({ type: 'client', id: 'c1' })
    expect(recordFromLocation('/designs/boards/m1', '')).toEqual({ type: 'moodboard', id: 'm1' })
    expect(recordFromLocation('/freelance/proposal/p1', '')).toEqual({ type: 'proposal', id: 'p1' })
    // A card opens as a sheet over its board: the card is what the person looks at.
    expect(recordFromLocation('/boards/b1', '?card=k1')).toEqual({ type: 'card', id: 'k1' })
    expect(recordFromLocation('/boards/b1', '')).toEqual({ type: 'board', id: 'b1' })
    expect(recordFromLocation('/ideas', '')).toBeNull()
    expect(recordFromLocation('/', '')).toBeNull()
    expect(recordFromLocation('/english/review', '')).toBeNull()
  })
})

/* ───────────── On a real database ───────────── */

let v: Vault
let ideas: IdeasModule
let knowledge: KnowledgeModule
/** The runner as main calls it: with actions that went through the schema (defaults filled in). */
class ParsingRunner extends AiActionRunner {
  override prepare(
    action: AiActionInput,
    target: EntityRef | null
  ): ReturnType<AiActionRunner['prepare']> {
    return super.prepare(aiActionSchema.parse(action), target)
  }
  override apply(
    action: AiActionInput,
    target: EntityRef | null
  ): ReturnType<AiActionRunner['apply']> {
    return super.apply(aiActionSchema.parse(action), target)
  }
}
type AiActionInput = z.input<typeof aiActionSchema>
let runner: ParsingRunner

beforeEach(() => {
  v = openVault()
  ideas = new IdeasModule(v.m, v.boards)
  knowledge = new KnowledgeModule(v.m)
  for (const d of [ideas.descriptor, ...knowledge.descriptors]) v.registry.register(d)
  const freelance = new FreelanceModule(v.m, v.crm)
  runner = new ParsingRunner({
    api: {
      ideas: ideas.api(),
      notes: knowledge.notesApi(),
      snippets: knowledge.snippetsApi(),
      cards: v.api.cards,
      boards: v.api.boards,
      events: v.api.events,
      checklists: v.api.checklists,
      bookmarks: knowledge.bookmarksApi(),
      english: v.api.english,
      claude: knowledge.claudeApi(),
      fixes: knowledge.fixesApi(),
      libraries: knowledge.librariesApi(),
      jobs: v.api.jobs,
      templates: v.api.templates,
      redflags: freelance.redFlagsApi(),
      cases: freelance.casesApi(),
      components: v.api.components
    },
    boards: {
      list: () =>
        v.boards
          .listBoards()
          .filter((b) => !b.archived)
          .map((b) => ({ id: b.id, title: b.title })),
      columns: (id) => v.boards.columns(id)
    },
    records: new RegistryRecordWriter({
      ctx: v.db,
      registry: v.registry,
      tags: v.tags,
      search: v.search,
      revisions: v.revisions,
      trash: v.trash
    })
  })
})
afterEach(() => v.close())

describe('actions on the base', () => {
  it('a new idea is a normal record: searchable, and «Скасувати» deletes it for good', async () => {
    const done = await runner.apply(
      { type: 'create_idea', title: 'Кешувати запити', body: 'SWR' },
      null
    )
    expect(done).toMatchObject({ kind: 'create', title: 'Кешувати запити' })
    expect(v.search.query({ text: 'Кешувати' }).map((h) => h.id)).toEqual([done.ref.id])
    runner.undo(done)
    expect(v.registry.findRow(done.ref, { withDeleted: true })).toBeUndefined()
  })

  it('a card goes to the named board and column, or to the latest board’s first column', async () => {
    expect(
      runner.prepare(
        { type: 'create_card', title: 'А', description: '', board: '', column: '' },
        null
      ).problem
    ).toBe('Спершу створіть дошку — картці нікуди піти')
    const work = v.boards.createBoard({ title: 'Робота' })
    const cols = v.boards.columns(work.id)
    const named = runner.prepare(
      { type: 'create_card', title: 'Б', description: '', board: 'робота', column: cols[1].title },
      null
    )
    expect(named.problem).toBeNull()
    expect(named.preview.fields).toEqual([
      { label: 'Дошка', value: 'Робота' },
      { label: 'Колонка', value: cols[1].title }
    ])
    const done = await runner.apply(
      { type: 'create_card', title: 'Б', description: 'опис', board: 'Нема такої', column: '' },
      null
    )
    const card = await v.api.cards.get(done.ref.id)
    expect(card).toMatchObject({ boardId: work.id, columnId: cols[0].id, description: 'опис' })
  })

  it('an event on a day only is all day; a timed one keeps its end', async () => {
    const day = await runner.apply(
      { type: 'create_event', title: 'Відпустка', description: '', start: '2026-12-01' },
      null
    )
    expect(await v.api.events.get(day.ref.id)).toMatchObject({ allDay: true, endAt: null })
    const timed = await runner.apply(
      {
        type: 'create_event',
        title: 'Дзвінок',
        description: '',
        start: '2026-12-01T10:00',
        end: '2026-12-01T11:00'
      },
      null
    )
    expect(await v.api.events.get(timed.ref.id)).toMatchObject({
      allDay: false,
      startAt: new Date(2026, 11, 1, 10).getTime(),
      endAt: new Date(2026, 11, 1, 11).getTime()
    })
    expect(
      runner.prepare(
        { type: 'create_event', title: 'X', description: '', start: '2026-13-01' },
        null
      ).problem
    ).toMatch(/дату, якої немає/)
  })

  it('«Додати текст» appends to the open record; «Скасувати» rolls it back', async () => {
    const note = await knowledge.notesApi().create({ title: 'Docker', body: 'WSL2' })
    const ref: EntityRef = { type: 'note', id: note.id }
    expect(runner.prepare({ type: 'append_text', text: 'нове' }, null).problem).toMatch(
      /Відкрийте запис/
    )
    const done = await runner.apply({ type: 'append_text', text: 'Порт 2375' }, ref)
    expect((await knowledge.notesApi().get(note.id))?.body).toBe('WSL2\n\nПорт 2375')
    expect(v.search.query({ text: '2375' }).map((h) => h.id)).toEqual([note.id])
    runner.undo(done)
    expect((await knowledge.notesApi().get(note.id))?.body).toBe('WSL2')
  })

  it('a text that would pass the record’s limit is refused', async () => {
    const event = await v.api.events.create({
      title: 'Подія',
      startAt: Date.now(),
      // A description just under the event's own limit (MAX.note): 100 more characters can't fit.
      description: 'x'.repeat(MAX.note - 10)
    })
    await expect(
      runner.apply({ type: 'append_text', text: 'y'.repeat(100) }, { type: 'event', id: event.id })
    ).rejects.toThrow(/задовгий/)
  })

  it('tags are added by name (an existing one in any case), the record keeps its own', async () => {
    const react = v.tags.create({ name: 'React', color: null })
    const own = v.tags.create({ name: 'робота', color: null })
    const idea = await ideas.api().create({ title: 'Ідея', tagIds: [own.id] })
    const ref: EntityRef = { type: 'idea', id: idea.id }
    const done = await runner.apply({ type: 'add_tags', tags: ['react', 'кеш'] }, ref)
    const names = (await ideas.api().get(idea.id))!.tags.map((t) => t.name).sort()
    expect(names).toEqual(['React', 'кеш', 'робота'])
    expect(v.tags.list().filter((t) => t.name.toLowerCase() === 'react')).toHaveLength(1)
    expect(v.tags.list().find((t) => t.id === react.id)).toBeTruthy()
    runner.undo(done)
    expect((await ideas.api().get(idea.id))!.tags.map((t) => t.name)).toEqual(['робота'])
  })

  it('a record gone to the trash can no longer be changed', async () => {
    const idea = await ideas.api().create({ title: 'Ідея' })
    await ideas.api().remove(idea.id)
    const prepared = runner.prepare(
      { type: 'append_text', text: 'а' },
      { type: 'idea', id: idea.id }
    )
    expect(prepared.problem).toBe('Цього запису вже немає або він у кошику')
  })
})

/* ───────────── The chat service ───────────── */

class MemoryHistory implements AiChatHistory {
  chats = new Map<string, AiChat>()
  list(): AiChatSummary[] {
    return [...this.chats.values()].map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messages: c.messages.length
    }))
  }
  get(id: string): AiChat | null {
    const c = this.chats.get(id)
    return c ? structuredClone(c) : null
  }
  save(chat: AiChat): void {
    this.chats.set(chat.id, structuredClone(chat))
  }
  remove(id: string): void {
    this.chats.delete(id)
  }
}

function chatSetup(answer: string): {
  chat: AiChatService
  request: ReturnType<typeof vi.fn<AiRequester['request']>>
  history: MemoryHistory
} {
  const request = vi.fn<AiRequester['request']>(async () => ({
    text: answer,
    model: 'stub',
    inputTokens: 10,
    outputTokens: 5
  }))
  const base: AiChatBase = {
    record: (ref) => {
      const row = v.registry.findRow(ref)
      if (!row) return null
      const doc = v.registry.get(ref.type).searchDoc(row)
      return { ref, title: doc.title, body: doc.body }
    },
    search: (words, { any, limit }) =>
      v.registry
        .summarize(v.search.query({ text: words.join(' '), limit }, { any }))
        .map((s) => ({ type: s.type, id: s.id })),
    boards: () => []
  }
  const history = new MemoryHistory()
  const chat = new AiChatService({
    ai: { request },
    history,
    base,
    actions: runner,
    changed: () => {}
  })
  return { chat, request, history }
}

describe('the chat', () => {
  it('«Шукати в моїй базі» sends the records found and links the cited ones; record text needs consent', async () => {
    const note = await knowledge
      .notesApi()
      .create({ title: 'Docker на Windows', body: 'Потрібен WSL2' })
    await knowledge.notesApi().create({ title: 'Рецепт борщу', body: 'буряк' })
    const { chat, request } = chatSetup('Увімкніть WSL2 [1].')
    const result = await chat.send({ text: 'як налаштувати docker?', search: true })
    const [req, opts] = request.mock.calls[0]
    expect(req.prompt).toContain('[1] Нотатка «Docker на Windows»')
    expect(req.prompt).not.toContain('борщ')
    expect(opts).toEqual({ recordText: true, consent: undefined })
    const answer = result.messages[1]
    expect(answer.text).toBe(`Увімкніть WSL2 [Docker на Windows](vault:note/${note.id}).`)
    expect(answer.sources).toEqual([
      { n: 1, ref: { type: 'note', id: note.id }, title: 'Docker на Windows', cited: true }
    ])
    // Without the open record and the search, nothing from the base goes out.
    await chat.send({ chatId: result.id, text: 'дякую' })
    expect(request.mock.calls[1][1]).toEqual({ recordText: false, consent: undefined })
    expect(request.mock.calls[1][0].history).toEqual([
      { role: 'user', text: 'як налаштувати docker?' },
      { role: 'assistant', text: answer.text }
    ])
  })

  it('an action is applied only by its id from this chat, once; dismissed stays in the chat', async () => {
    const { chat } = chatSetup(
      'Додаю.' +
        block({
          actions: [
            { type: 'create_idea', title: 'Нова ідея' },
            { type: 'create_idea', title: 'Друга' }
          ]
        })
    )
    const c = await chat.send({ text: 'додай дві ідеї' })
    const answer = c.messages[1]
    const [first, second] = answer.actions
    expect(first).toMatchObject({
      status: 'proposed',
      preview: { label: 'Створити: ідея', type: 'idea', title: 'Нова ідея' }
    })
    // Nothing is created before «Застосувати».
    expect(await ideas.api().list()).toEqual([])
    const ref = { chatId: c.id, messageId: answer.id, actionId: first.id }
    const applied = await chat.apply(ref)
    expect(applied.kind).toBe('create')
    expect((await ideas.api().list()).map((i) => i.title)).toEqual(['Нова ідея'])
    expect(await reason(chat.apply(ref))).toBe('Цю дію вже застосовано')
    expect(await reason(chat.apply({ ...ref, actionId: 'made-up' }))).toBe(
      'Цієї дії вже немає в чаті'
    )

    const undone = await chat.undo(ref)
    expect(undone.messages[1].actions[0]).toMatchObject({ status: 'proposed', result: null })
    expect(await ideas.api().list()).toEqual([])

    const dismissed = await chat.dismiss({ ...ref, actionId: second.id })
    expect(dismissed.messages[1].actions[1].status).toBe('dismissed')
  })

  it('an edit touches only the record that was open when the person asked', async () => {
    const note = await knowledge.notesApi().create({ title: 'План', body: 'Пункт 1' })
    const other = await knowledge.notesApi().create({ title: 'Інше', body: '' })
    const { chat, request } = chatSetup(
      'Додав.' + block({ actions: [{ type: 'append_text', text: 'Пункт 2' }] })
    )
    const c = await chat.send({
      text: 'додай пункт',
      context: { type: 'note', id: note.id },
      consent: true
    })
    expect(request.mock.calls[0][0].prompt).toContain('<open_record type="Нотатка" title="План">')
    expect(request.mock.calls[0][1]).toEqual({ recordText: true, consent: true })
    const answer = c.messages[1]
    expect(answer.actions[0].preview.target).toEqual({ type: 'note', id: note.id })
    await chat.apply({ chatId: c.id, messageId: answer.id, actionId: answer.actions[0].id })
    expect((await knowledge.notesApi().get(note.id))?.body).toBe('Пункт 1\n\nПункт 2')
    expect((await knowledge.notesApi().get(other.id))?.body).toBe('')
  })

  it('an empty answer is an error, not an empty bubble', async () => {
    const { chat, history } = chatSetup('<think>…</think>')
    expect(await reason(chat.send({ text: 'привіт' }))).toBe(
      'ШІ повернув порожню відповідь — спробуйте ще раз'
    )
    expect(history.list()).toEqual([])
  })
})

describe('the history file', () => {
  it('survives a restart; a damaged chat is dropped alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vault-chats-'))
    const file = join(dir, 'ai-chats.json')
    const store = new ChatStore(file)
    const chat: AiChat = { id: 'c1', title: 'Перший', createdAt: 1, updatedAt: 2, messages: [] }
    store.save(chat)
    store.save({ ...chat, id: 'c2', title: 'Другий', updatedAt: 3 })
    store.flush()
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { chats: unknown[] }
    expect(raw.chats).toHaveLength(2)
    expect(new ChatStore(file).list().map((c) => c.title)).toEqual(['Другий', 'Перший'])
  })
})

/* ───────────── The app map ───────────── */

describe('the chat knows the app', () => {
  it('every menu item has its entry in the map, with the label the sidebar shows', () => {
    const menu = [
      HOME,
      ...TOP_ITEMS,
      GUIDE,
      ...HUBS.flatMap((h) => [
        ...(h.overview ? [{ path: h.overview, label: h.title }] : []),
        ...h.items
      ])
    ]
    for (const item of menu) {
      const entry = APP_SECTIONS.find((s) => s.path === item.path)
      expect(entry, item.path).toBeTruthy()
      expect(entry?.label, item.path).toBe(item.label)
    }
    for (const h of HUBS)
      for (const item of h.items)
        expect(APP_SECTIONS.find((s) => s.path === item.path)?.hub, item.path).toBe(h.title)
  })

  it('the map stays compact and finds the section of any page', () => {
    expect(appMapPrompt().length).toBeLessThan(2400)
    expect(sectionAt('/checklists')?.action).toBe('create_checklist')
    expect(sectionAt('/checklists/abc')?.label).toBe('Чек-листи')
    expect(sectionAt('/freelance/templates?situation=cover_letter')?.label).toBe('Шаблони')
    expect(sectionAt('/freelance/templates')?.label).toBe('Шаблони')
    expect(sectionAt('/notes?open=n1')?.label).toBe('Нотатки')
    expect(sectionAt('/projects/p1')?.label).toBe('Клієнти й проєкти')
    expect(sectionAt('/')?.label).toBe('Головна')
  })

  it('the system prompt carries the map, the current page and the rule against swapping types', () => {
    const now = new Date(2026, 10, 25, 14, 5).getTime()
    const prompt = chatSystem({ now, boards: [], contextType: null, page: '/checklists' })
    expect(prompt).toContain('Інструменти › Чек-листи')
    expect(prompt).toContain('The person is now on «Інструменти › Чек-листи» (/checklists)')
    expect(prompt).toContain('- create_checklist {title')
    expect(prompt).toContain('«чек-лист» → create_checklist')
    expect(prompt).toContain('a checklist is not a note')
    expect(prompt).toContain('Сховати розділ')
    expect(prompt).not.toContain('- append_text')
    expect(chatSystem({ now, boards: [], contextType: null })).not.toContain('The person is now on')
  })
})

/* ───────────── Actions for every content section ───────────── */

describe('actions for every content section', () => {
  const sections = [
    { title: 'Дизайн', items: ['Макет', { text: 'Мобільна версія', hint: '375 px' }] },
    { title: 'Запуск', items: ['Домен', 'Аналітика', 'Форма'] }
  ]

  it('each action is checked by its module’s limits; unknown types are dropped', () => {
    const ok = parseChatReply(
      block({
        actions: [
          { type: 'create_checklist', title: 'Лендинг', sections },
          { type: 'create_word', term: 'rollout', translation: 'викатка', kind: 'slang' },
          { type: 'create_template', title: 'Відгук', body: 'Hi {client}', situation: 'nonsense' },
          { type: 'create_payment', amount: 100 },
          { type: 'create_checklist', title: 'Порожній', sections: [] }
        ]
      })
    )
    expect(ok.actions.map((a) => a.type)).toEqual([
      'create_checklist',
      'create_word',
      'create_template'
    ])
    expect(ok.actions[1]).toMatchObject({ kind: 'word' })
    expect(ok.actions[2]).toMatchObject({ situation: 'other' })
    expect(ok.skipped).toBe(2)
    const itemMax = fieldMax(checklistItemInputSchema.shape.text)
    const long = parseChatReply(
      block([
        { type: 'create_checklist', title: 'X', sections: [{ items: ['y'.repeat(itemMax + 1)] }] }
      ])
    )
    expect(long.actions).toEqual([])
  })

  it('a checklist is created with its sections and items, as the import does', async () => {
    const done = await runner.apply(
      { type: 'create_checklist', title: 'Запуск лендингу', description: 'Перед здачею', sections },
      null
    )
    expect(done).toMatchObject({ kind: 'create', ref: { type: 'checklist' } })
    const c = await v.api.checklists.get(done.ref.id)
    expect(c).toMatchObject({
      title: 'Запуск лендингу',
      kind: 'template',
      description: 'Перед здачею'
    })
    expect(c?.items.map((i) => [i.section, i.text, i.hint])).toEqual([
      ['Дизайн', 'Макет', ''],
      ['Дизайн', 'Мобільна версія', '375 px'],
      ['Запуск', 'Домен', ''],
      ['Запуск', 'Аналітика', ''],
      ['Запуск', 'Форма', '']
    ])
  })

  it('a board gets its own columns, the last one is «done»', async () => {
    const done = await runner.apply(
      {
        type: 'create_board',
        title: 'Лендинг',
        columns: ['Ідеї', 'Роблю', 'Перевірка', 'Тест', 'Здано']
      },
      null
    )
    const d = await v.api.boards.details(done.ref.id)
    expect(d?.columns.map((c) => [c.title, c.isDone])).toEqual([
      ['Ідеї', false],
      ['Роблю', false],
      ['Перевірка', false],
      ['Тест', false],
      ['Здано', true]
    ])
  })

  it('a card with checks, a word, a template and a question land in their sections', async () => {
    v.boards.createBoard({ title: 'Робота' })
    const card = await runner.apply(
      { type: 'create_card', title: 'Верстка', checks: ['Хедер', 'Футер'] },
      null
    )
    expect((await v.api.cards.get(card.ref.id))?.checklist.map((c) => c.text)).toEqual([
      'Хедер',
      'Футер'
    ])
    const word = await runner.apply(
      { type: 'create_word', term: 'rollout', translation: 'викатка', example: 'Staged rollout' },
      null
    )
    expect(await v.api.english.get(word.ref.id)).toMatchObject({
      term: 'rollout',
      translation: 'викатка'
    })
    const tpl = await runner.apply(
      {
        type: 'create_template',
        title: 'Перший відгук',
        body: 'Hi {client}',
        situation: 'proposal'
      },
      null
    )
    expect(await v.api.templates.get(tpl.ref.id)).toMatchObject({
      body: 'Hi {client}',
      situation: 'proposal'
    })
    const q = await runner.apply(
      { type: 'create_question', question: 'Що таке замикання?', answer: 'Функція з оточенням' },
      null
    )
    expect(q).toMatchObject({ title: 'Що таке замикання?', ref: { type: 'question' } })
  })

  it('«Змінити»: only the offered fields are taken, and they pass the module’s limits', () => {
    const action = aiActionSchema.parse({ type: 'create_checklist', title: 'Старий', sections })
    const edited = withEdits(action, { title: 'Новий', sections: 'зламати', type: 'create_note' })
    expect(edited).toMatchObject({ type: 'create_checklist', title: 'Новий' })
    expect(edited).toEqual({ ...action, title: 'Новий' })
    expect(() => withEdits(action, { title: '' })).toThrow()
    expect(() => withEdits(action, { title: 'x'.repeat(MAX.title + 1) })).toThrow()
  })
})

describe('the chat applies the edited action and brings a cancelled one back', () => {
  it('«Застосувати» after «Змінити» creates the edited checklist; «Повернути» reopens a cancelled card', async () => {
    const { chat, request } = chatSetup(
      'Ось шаблон.' +
        block({
          actions: [
            {
              type: 'create_checklist',
              title: 'Лендинг',
              sections: [{ title: 'А', items: ['Б'] }]
            },
            { type: 'create_idea', title: 'Зайве' }
          ]
        })
    )
    const c = await chat.send({ text: 'Додай шаблон чек-листа для лендингу', page: '/checklists' })
    expect(request.mock.calls[0][0].system).toContain('The person is now on «Інструменти › Чек-листи»')
    const answer = c.messages[1]
    const [list, idea] = answer.actions
    const ref = { chatId: c.id, messageId: answer.id, actionId: list.id }
    const applied = await chat.apply({ ...ref, edits: { title: 'Запуск лендингу' } })
    expect(applied.title).toBe('Запуск лендингу')
    expect((await v.api.checklists.get(applied.ref.id))?.title).toBe('Запуск лендингу')
    expect(applied.chat.messages[1].actions[0].action).toMatchObject({ title: 'Запуск лендингу' })

    const ideaRef = { ...ref, actionId: idea.id }
    await expect(chat.apply({ ...ideaRef, edits: { title: '' } })).rejects.toThrow()
    expect((await chat.dismiss(ideaRef)).messages[1].actions[1].status).toBe('dismissed')
    expect((await chat.reopen(ideaRef)).messages[1].actions[1].status).toBe('proposed')
  })
})

describe('chat titles and «Повторити відповідь»', () => {
  it('a title is the first sentence, short, without trailing punctuation', () => {
    expect(chatTitle('Додай ідею: кешувати запити')).toBe('Додай ідею')
    expect(chatTitle('Що в мене на завтра?')).toBe('Що в мене на завтра')
    expect(
      chatTitle('  \nДодай шаблон чек-листа для створення лендингу. Достатньо детальний.')
    ).toBe('Додай шаблон чек-листа для створення лендингу')
    const long = chatTitle(`Опиши ${'дуже '.repeat(30)}довгу річ`)
    expect(long.length).toBeLessThanOrEqual(CHAT_TITLE_MAX + 1)
    expect(long.endsWith('…')).toBe(true)
    expect(chatTitle('…')).toBe('Новий чат')
  })

  it('«Повторити відповідь» replaces the last question and answer instead of adding a turn', async () => {
    const { chat, request } = chatSetup('Відповідь')
    const first = await chat.send({ text: 'Перше питання' })
    const second = await chat.send({ chatId: first.id, text: 'Друге питання' })
    expect(second.messages).toHaveLength(4)
    const again = await chat.send({ chatId: first.id, text: 'Друге питання', retry: true })
    expect(again.messages.map((m) => m.text)).toEqual([
      'Перше питання',
      'Відповідь',
      'Друге питання',
      'Відповідь'
    ])
    // The model sees the history without the replaced turn.
    expect(request.mock.calls[2][0].history).toEqual([
      { role: 'user', text: 'Перше питання' },
      { role: 'assistant', text: 'Відповідь' }
    ])
  })
})
