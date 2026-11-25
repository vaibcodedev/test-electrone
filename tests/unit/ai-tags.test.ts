/** «Запропонувати мітки»: reading the model's answer and turning it into chips. */
import { describe, expect, it } from 'vitest'
import type { Tag, TagWithUsage } from '@shared/domain/common'
import {
  buildTagPrompt,
  normalizeTagName,
  parseTagReply,
  toSuggestions
} from '@main/services/ai/tags'

const tag = (name: string, usage = 1): TagWithUsage => ({
  id: `id-${name}`,
  name,
  color: '#a3e635',
  createdAt: 0,
  usage
})

describe('parseTagReply', () => {
  it('reads {"tags": [...]}, a bare array and a ```json fence', () => {
    expect(parseTagReply('{"tags": ["react", "hooks"]}')).toEqual(['react', 'hooks'])
    expect(parseTagReply('["shopify"]')).toEqual(['shopify'])
    expect(parseTagReply('Ось:\n```json\n{"tags":["дизайн"]}\n```')).toEqual(['дизайн'])
  })

  it('drops <think> reasoning before the answer', () => {
    expect(parseTagReply('<think>{"tags":["wrong"]} maybe</think>{"tags":["right"]}')).toEqual([
      'right'
    ])
  })

  it('falls back to a list when the model ignored the format', () => {
    expect(parseTagReply('Tags:\n- react\n- state management\n2) zustand')).toEqual([
      'react',
      'state management',
      'zustand'
    ])
    expect(parseTagReply('css, layout')).toEqual(['css', 'layout'])
  })

  it('ignores values that are not strings', () => {
    expect(parseTagReply('{"tags": ["ok", 3, null, {"x": 1}]}')).toEqual(['ok'])
  })
})

describe('toSuggestions', () => {
  const existing = [tag('React', 5), tag('Shopify', 2)]

  it('an existing tag keeps its spelling, id and colour (case-insensitive match)', () => {
    expect(toSuggestions(['react', 'нова тема'], existing, [])).toEqual([
      { name: 'React', tagId: 'id-React', color: '#a3e635' },
      { name: 'нова тема', tagId: null, color: null }
    ])
  })

  it('skips tags the record already has and repeats; at most five', () => {
    const current: Tag[] = [existing[1]]
    const names = ['shopify', 'a', 'A', 'b', 'c', 'd', 'e', 'f']
    expect(toSuggestions(names, existing, current).map((s) => s.name)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e'
    ])
  })

  it('cleans «#», quotes and spaces; never longer than a tag may be', () => {
    expect(normalizeTagName('  #"front  end".  ')).toBe('front end')
    expect(normalizeTagName('x'.repeat(100))).toHaveLength(60)
    expect(toSuggestions(['#', '  '], [], [])).toEqual([])
  })
})

describe('buildTagPrompt', () => {
  it('lists the most used tags first and fences the record as data', () => {
    const prompt = buildTagPrompt({
      title: 'Кеш у React Query',
      body: 'staleTime',
      existing: [tag('rare', 1), tag('popular', 9)],
      current: []
    })
    expect(prompt).toContain('Existing tags: popular, rare')
    expect(prompt).toContain('<record>\nКеш у React Query\n\nstaleTime\n</record>')
  })

  it('keeps only the first 6000 characters of a long record', () => {
    const prompt = buildTagPrompt({
      title: 't',
      body: 'x'.repeat(10_000),
      existing: [],
      current: []
    })
    expect(prompt.length).toBeLessThan(6200)
  })
})
