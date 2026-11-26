import { describe, expect, it } from 'vitest'
import { menuGroups, shownLabel, type MenuItemSpec } from '@/features/record-menu/model'

const item = (label: string, extra: Partial<MenuItemSpec> = {}): MenuItemSpec => ({
  label,
  run: () => {},
  ...extra
})
const labels = (groups: ReturnType<typeof menuGroups>): string[][] =>
  groups.map((g) =>
    g.map((e) =>
      'items' in e ? `${e.label} › ${e.items.map((i) => i.label).join(', ')}` : e.label
    )
  )

describe('record menu groups', () => {
  it('keeps the fixed order: open → state → shared + share → danger', () => {
    const groups = menuGroups(
      {
        danger: [item('У кошик')],
        share: [item('Копіювати URL')],
        state: [{ label: 'Статус', items: [item('Нове'), item('Готово', { checked: true })] }],
        open: [item('Відкрити')]
      },
      [item('Закріпити на головній'), item('Копіювати посилання')]
    )
    expect(labels(groups)).toEqual([
      ['Відкрити'],
      ['Статус › Нове, Готово'],
      ['Закріпити на головній', 'Копіювати посилання', 'Копіювати URL'],
      ['У кошик']
    ])
  })

  it('hides what is not offered and drops empty groups and submenus', () => {
    const groups = menuGroups({
      open: [item('Відкрити'), false, null],
      state: [undefined, { label: 'Мітки', items: [false] }],
      danger: [false]
    })
    expect(labels(groups)).toEqual([['Відкрити']])
  })

  it('allows one submenu level only', () => {
    const groups = menuGroups({
      state: [{ label: 'Колонка', items: [item('A'), { label: 'Глибше', items: [item('B')] }] }]
    })
    expect(labels(groups)).toEqual([['Колонка › A']])
  })

  it('marks an item that asks first with «…»', () => {
    expect(
      shownLabel(item('Видалити назавжди', { confirm: { title: '?', confirmLabel: 'Видалити' } }))
    ).toBe('Видалити назавжди…')
    expect(shownLabel(item('У кошик'))).toBe('У кошик')
  })
})
