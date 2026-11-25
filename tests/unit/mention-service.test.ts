/** «Згадки» and link resolving on a real database: found through the search index, live records only. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MentionService } from '@main/services/mention-service'
import { wikiLink } from '@shared/wikilinks'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
let mentions: MentionService
beforeEach(() => {
  v = openVault()
  mentions = new MentionService(v.db, v.registry)
})
afterEach(() => v.close())

async function boardWithCard(
  title: string,
  description = ''
): Promise<{ boardId: string; cardId: string }> {
  const board = await v.api.boards.create({ title })
  const col = v.boards.columns(board.id)[0]
  const card = await v.api.cards.create({
    boardId: board.id,
    columnId: col.id,
    title: `Картка ${title}`,
    description
  })
  return { boardId: board.id, cardId: card.id }
}

describe('mentions of a record', () => {
  it('lists the records whose text links to it, with the words around the link', async () => {
    const target = await v.api.boards.create({ title: 'Реліз 2.0' })
    const link = wikiLink({ type: 'board', id: target.id }, 'Реліз')
    const { cardId } = await boardWithCard(
      'Інша',
      `Нотатки\n- Перевірити ${link} до п’ятниці\n${link}`
    )
    await v.api.boards.create({ title: 'Без посилань', description: 'просто текст' })

    const list = mentions.list({ type: 'board', id: target.id })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      type: 'card',
      id: cardId,
      title: 'Картка Інша',
      // The link reads as the target's current title, not the label typed back then.
      label: 'Реліз 2.0',
      fragment: { before: 'Перевірити ', after: ' до п’ятниці' },
      count: 2
    })
  })

  it('follows edits: a removed link, a record in the trash and a self-link do not count', async () => {
    const target = await v.api.boards.create({ title: 'Ціль' })
    const link = wikiLink({ type: 'board', id: target.id }, 'Ціль')
    const { cardId } = await boardWithCard('Джерело', `див. ${link}`)
    await v.api.boards.update({ id: target.id, patch: { description: `сам на себе ${link}` } })
    expect(mentions.list({ type: 'board', id: target.id }).map((m) => m.id)).toEqual([cardId])

    await v.api.cards.update({ id: cardId, patch: { description: 'посилання прибрали' } })
    expect(mentions.list({ type: 'board', id: target.id })).toEqual([])

    await v.api.cards.update({ id: cardId, patch: { description: `знову ${link}` } })
    await v.api.cards.remove(cardId)
    expect(mentions.list({ type: 'board', id: target.id })).toEqual([])
  })

  it('a card of a board in the trash is no source (registry.live)', async () => {
    const target = await v.api.boards.create({ title: 'Ціль' })
    const { boardId } = await boardWithCard(
      'Кошик',
      `див. ${wikiLink({ type: 'board', id: target.id }, 'Ціль')}`
    )
    expect(mentions.list({ type: 'board', id: target.id })).toHaveLength(1)
    await v.api.boards.remove(boardId)
    expect(mentions.list({ type: 'board', id: target.id })).toEqual([])
  })
})

describe('resolving links in a text', () => {
  it('live → current title; in the trash → trashed; purged or unknown → missing', async () => {
    const live = await v.api.boards.create({ title: 'Стара назва' })
    await v.api.boards.update({ id: live.id, patch: { title: 'Нова назва' } })
    const trashed = await v.api.boards.create({ title: 'У кошику' })
    await v.api.boards.remove(trashed.id)
    const purged = await v.api.boards.create({ title: 'Назавжди' })
    await v.api.boards.remove(purged.id)
    v.trash.purge({ type: 'board', id: purged.id })
    const { boardId, cardId } = await boardWithCard('Батько')
    await v.api.boards.remove(boardId)

    expect(
      mentions.resolve([
        { type: 'board', id: live.id },
        { type: 'board', id: trashed.id },
        { type: 'board', id: purged.id },
        { type: 'card', id: cardId },
        { type: 'note', id: 'never-existed' }
      ])
    ).toEqual([
      { type: 'board', id: live.id, title: 'Нова назва', state: 'live' },
      { type: 'board', id: trashed.id, title: 'У кошику', state: 'trashed' },
      { type: 'board', id: purged.id, title: '', state: 'missing' },
      // A card of a trashed board went to the trash with it.
      { type: 'card', id: cardId, title: 'Картка Батько', state: 'trashed' },
      { type: 'note', id: 'never-existed', title: '', state: 'missing' }
    ])
  })

  it('the api validates its input', async () => {
    await expect(mentions.api().resolve([{ type: 'nope', id: 'x' } as never])).rejects.toThrow()
    await expect(mentions.api().list({ type: 'board', id: '' })).rejects.toThrow()
  })
})
