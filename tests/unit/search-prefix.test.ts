import { describe, expect, it } from 'vitest'
import { ENTITY_TYPES } from '@shared/entity-types'
import {
  SEARCH_PREFIX,
  parseSearch,
  suggestPrefixes,
  withPrefix
} from '@/lib/search-prefix'

describe('search prefixes', () => {
  it('gives every entity type its own prefix', () => {
    expect(new Set(Object.values(SEARCH_PREFIX)).size).toBe(ENTITY_TYPES.length)
    for (const type of ENTITY_TYPES) {
      expect(parseSearch(withPrefix(type, 'abc'))).toEqual({ type, query: 'abc' })
    }
  })

  it('reads a prefix with or without a space, in any case', () => {
    expect(parseSearch('сн:debounce')).toEqual({ type: 'snippet', query: 'debounce' })
    expect(parseSearch('  НТ:  план на тиждень ')).toEqual({
      type: 'note',
      query: 'план на тиждень'
    })
    expect(parseSearch('ід:')).toEqual({ type: 'idea', query: '' })
  })

  it('keeps unknown prefixes as ordinary text', () => {
    for (const text of ['http://example.com', 'todo: fix', 'сн debounce', 'a сн: b']) {
      expect(parseSearch(text)).toEqual({ type: null, query: text })
    }
  })

  it('suggests filters by prefix and by section name', () => {
    expect(suggestPrefixes('сн')[0]).toBe('snippet')
    expect(suggestPrefixes('Сніп')).toEqual(['snippet'])
    expect(suggestPrefixes('питання')).toEqual(['question'])
    expect(suggestPrefixes('пр')[0]).toBe('project')
    expect(suggestPrefixes('с')).toEqual([])
    expect(suggestPrefixes('zzz')).toEqual([])
    expect(suggestPrefixes('?')).toHaveLength(ENTITY_TYPES.length)
  })
})
