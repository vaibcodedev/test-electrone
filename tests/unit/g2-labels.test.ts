import { describe, expect, it } from 'vitest'
import { fillTemplate, templateVariables, variableLabel } from '@/modules/freelance/g2-labels'

describe('templateVariables', () => {
  it('returns {variables} in order of first appearance, without duplicates', () => {
    expect(templateVariables('Hi {name}, about {task}. Thanks, {my_name}. {name}!')).toEqual([
      'name',
      'task',
      'my_name'
    ])
  })
  it('supports Cyrillic, digits and dashes', () => {
    expect(templateVariables('Привіт, {імя}! {budget-range} {v2}')).toEqual([
      'імя',
      'budget-range',
      'v2'
    ])
  })
  it('ignores empty braces, spaces inside and JSON-like text', () => {
    expect(templateVariables('{} { name } {"a": 1}')).toEqual([])
  })
  it('no variables → []', () => {
    expect(templateVariables('plain text')).toEqual([])
  })
})

describe('fillTemplate', () => {
  it('replaces every occurrence', () => {
    expect(fillTemplate('{name}, {name}! Ціна {price}', { name: 'Анна', price: '500 $' })).toBe(
      'Анна, Анна! Ціна 500 $'
    )
  })
  it('keeps unknown or empty variables as {token} so nothing is silently lost', () => {
    expect(fillTemplate('Hi {name}, {task}', { name: '   ' })).toBe('Hi {name}, {task}')
  })
  it('trims the inserted values', () => {
    expect(fillTemplate('[{x}]', { x: '  a b  ' })).toBe('[a b]')
  })
  it('does not interpret $ patterns in values', () => {
    expect(fillTemplate('Total: {total}', { total: "$& $1 $$ $'" })).toBe("Total: $& $1 $$ $'")
  })
  it('a value containing another {token} is not expanded again', () => {
    expect(fillTemplate('{a} {b}', { a: '{b}', b: 'B' })).toBe('{b} B')
  })
})

describe('variableLabel', () => {
  it('known keys get Ukrainian labels (case-insensitive)', () => {
    expect(variableLabel('name')).toBe('Ім’я клієнта')
    expect(variableLabel('NAME')).toBe('Ім’я клієнта')
    expect(variableLabel('my_availability')).toBe('Коли я вільний')
  })
  it('unknown keys become a readable capitalised phrase', () => {
    expect(variableLabel('budget_range')).toBe('Budget range')
    expect(variableLabel('due-date')).toBe('Due date')
    expect(variableLabel('термін')).toBe('Термін')
  })
  it('numbered variables keep the number', () => {
    expect(variableLabel('question_1')).toBe('Питання 1')
    expect(variableLabel('hours_2')).toBe('Години 2')
    expect(variableLabel('part_3')).toBe('Частина 3')
    expect(variableLabel('step-1')).toBe('Крок 1')
  })
})
