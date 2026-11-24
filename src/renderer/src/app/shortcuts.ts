/**
 * Single source of truth for keyboard shortcuts: the global handler (use-global-shortcuts.ts)
 * and the help dialog (Ctrl+/) both read from here.
 * `keys` use display names; `combo` is what the handler matches.
 */
export interface ShortcutDef {
  /** Display keys, e.g. ['Ctrl', 'K'] or ['G', 'I'] for a sequence. */
  keys: string[]
  label: string
  /** "sequence" = press keys one after another (within 1 s). */
  sequence?: boolean
}

export interface ShortcutGroup {
  title: string
  items: ShortcutDef[]
}

/** G-then-letter navigation (Linear-style). Letter → route. */
export const GO_TO: Record<string, { route: string; label: string }> = {
  h: { route: '/', label: 'Головна' },
  w: { route: '/review', label: 'Підсумки тижня' },
  i: { route: '/ideas', label: 'Ідеї' },
  b: { route: '/boards', label: 'Дошки' },
  c: { route: '/calendar', label: 'Календар' },
  f: { route: '/freelance', label: 'Фриланс' },
  j: { route: '/jobs', label: 'Пошук роботи' },
  m: { route: '/finance', label: 'Фінанси' },
  n: { route: '/notes', label: 'Нотатки' },
  s: { route: '/snippets', label: 'Сніпети' },
  a: { route: '/claude', label: 'Claude' },
  d: { route: '/dev', label: 'Мої проєкти' },
  e: { route: '/english', label: 'Англійська' },
  t: { route: '/trash', label: 'Кошик' }
}

export function shortcutGroups(quickAddGlobal: string): ShortcutGroup[] {
  return [
    {
      title: 'Всюди',
      items: [
        { keys: ['Ctrl', 'K'], label: 'Знайти будь-що' },
        { keys: ['Ctrl', 'N'], label: 'Швидко додати' },
        { keys: quickAddGlobal.replace('CommandOrControl', 'Ctrl').split('+'), label: 'Швидко додати з будь-якої програми (навіть із трею)' },
        { keys: ['Ctrl', ','], label: 'Налаштування' },
        { keys: ['Ctrl', '/'], label: 'Ця довідка (або ?)' },
        { keys: ['Alt', '1…9'], label: 'Розділи по черзі' },
        { keys: ['[', ']'], label: 'Назад / вперед' }
      ]
    },
    {
      title: 'На сторінці',
      items: [
        { keys: ['N'], label: 'Створити (головна кнопка сторінки)' },
        { keys: ['/'], label: 'Перейти до пошуку в розділі' },
        { keys: ['E'], label: 'Редагувати відкритий запис' },
        { keys: ['Esc'], label: 'Вийти з редагування / закрити запис' }
      ]
    },
    {
      title: 'Перейти: G, потім літера',
      items: Object.entries(GO_TO).map(([k, v]) => ({ keys: ['G', k.toUpperCase()], label: v.label, sequence: true }))
    },
    {
      title: 'Повторення (англійська, питання)',
      items: [
        { keys: ['Пробіл'], label: 'Показати відповідь' },
        { keys: ['1', '2', '3', '4'], label: 'Не згадав · Насилу · Згадав · Легко' },
        { keys: ['Esc'], label: 'Вийти' }
      ]
    },
    {
      title: 'Швидке додавання',
      items: [
        { keys: ['Enter'], label: 'Зберегти' },
        { keys: ['Tab'], label: 'Змінити тип' },
        { keys: ['Shift', 'Enter'], label: 'Новий рядок' }
      ]
    }
  ]
}
