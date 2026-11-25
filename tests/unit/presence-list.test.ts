/** usePresenceList: a removed menu item stays in place while it folds away; an added one is marked to unfold. */
import { describe, expect, it } from 'vitest'
import { mergePresence, type PresenceEntry } from '@/hooks/use-presence-list'

const key = (s: string): string => s
const start = (items: string[]): PresenceEntry<string>[] =>
  items.map((item) => ({ key: item, item, leaving: false, entering: false }))
const view = (list: PresenceEntry<string>[]): string[] =>
  list.map((e) => `${e.key}${e.leaving ? '-' : ''}${e.entering ? '+' : ''}`)

describe('mergePresence', () => {
  it('a removed item stays where it was, marked leaving', () => {
    expect(view(mergePresence(start(['a', 'b', 'c']), ['a', 'c'], key))).toEqual(['a', 'b-', 'c'])
  })

  it('the first item removed stays first', () => {
    expect(view(mergePresence(start(['a', 'b']), ['b'], key))).toEqual(['a-', 'b'])
  })

  it('an added item is marked entering; items that were there are not', () => {
    expect(view(mergePresence(start(['a', 'c']), ['a', 'b', 'c'], key))).toEqual(['a', 'b+', 'c'])
  })

  it('an item shown again while still folding comes back as a plain item', () => {
    const folding = mergePresence(start(['a', 'b']), ['a'], key)
    expect(view(mergePresence(folding, ['a', 'b'], key))).toEqual(['a', 'b'])
  })

  it('several removed in a row keep their order', () => {
    expect(view(mergePresence(start(['a', 'b', 'c', 'd']), ['a', 'd'], key))).toEqual([
      'a',
      'b-',
      'c-',
      'd'
    ])
  })
})
