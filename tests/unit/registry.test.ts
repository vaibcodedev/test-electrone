import { describe, expect, it } from 'vitest'
import { isDraft, type AnyRow, type EntityDescriptor } from '@main/core/registry'

const note = {
  type: 'note',
  draft: { titleField: 'title', contentFields: ['body'] }
} as unknown as EntityDescriptor
const idea = { type: 'idea' } as unknown as EntityDescriptor
const library = {
  type: 'library',
  draft: { titleField: 'name', contentFields: ['purpose', 'npmUrl'] }
} as unknown as EntityDescriptor

const row = (over: Partial<AnyRow> = {}): AnyRow => ({
  id: '1',
  createdAt: 1000,
  updatedAt: 1000,
  deletedAt: null,
  title: 'Нова нотатка',
  body: '',
  ...over
})

describe('isDraft', () => {
  it('untouched record with a default title and no content is a draft', () => {
    expect(isDraft(note, row())).toBe(true)
  })
  it('old Russian default titles still count; surrounding spaces are ignored', () => {
    expect(isDraft(note, row({ title: 'Новая заметка' }))).toBe(true)
    expect(isDraft(note, row({ title: '  Нова нотатка ' }))).toBe(true)
  })
  it('null / whitespace-only content is empty', () => {
    expect(isDraft(note, row({ body: null }))).toBe(true)
    expect(isDraft(note, row({ body: ' \n\t ' }))).toBe(true)
  })
  it('a custom title is not a draft', () => {
    expect(isDraft(note, row({ title: 'Мої думки' }))).toBe(false)
  })
  it('edited after creation (updatedAt !== createdAt) is not a draft', () => {
    expect(isDraft(note, row({ updatedAt: 1001 }))).toBe(false)
  })
  it('any content is not a draft', () => {
    expect(isDraft(note, row({ body: 'текст' }))).toBe(false)
  })
  it('a record in the trash is not a draft', () => {
    expect(isDraft(note, row({ deletedAt: 5 }))).toBe(false)
  })
  it('types without a draft descriptor never are drafts', () => {
    expect(isDraft(idea, row({ title: 'Нова нотатка' }))).toBe(false)
  })
  it('the title field comes from the descriptor (library.name = new-package)', () => {
    const lib: AnyRow = {
      id: '2',
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      name: 'new-package',
      purpose: '',
      npmUrl: null
    }
    expect(isDraft(library, lib)).toBe(true)
    expect(isDraft(library, { ...lib, npmUrl: 'https://npmjs.com/x' })).toBe(false)
    // another type's default title doesn't count
    expect(isDraft(library, { ...lib, name: 'Нова нотатка' })).toBe(false)
  })
  it('a non-string content value (0, false) counts as content', () => {
    expect(isDraft(note, row({ body: 0 }))).toBe(false)
  })
})
