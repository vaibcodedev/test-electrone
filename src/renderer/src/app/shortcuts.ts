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
  h: { route: '/', label: 'Главная' },
  w: { route: '/review', label: 'Итоги недели' },
  i: { route: '/ideas', label: 'Идеи' },
  b: { route: '/boards', label: 'Доски' },
  c: { route: '/calendar', label: 'Календарь' },
  f: { route: '/freelance', label: 'Фриланс' },
  j: { route: '/jobs', label: 'Поиск работы' },
  m: { route: '/finance', label: 'Финансы' },
  n: { route: '/notes', label: 'Заметки' },
  s: { route: '/snippets', label: 'Сниппеты' },
  a: { route: '/claude', label: 'Claude' },
  d: { route: '/dev', label: 'Мои проекты' },
  e: { route: '/english', label: 'Английский' },
  t: { route: '/trash', label: 'Корзина' }
}

export function shortcutGroups(quickAddGlobal: string): ShortcutGroup[] {
  return [
    {
      title: 'Везде',
      items: [
        { keys: ['Ctrl', 'K'], label: 'Найти что угодно' },
        { keys: ['Ctrl', 'N'], label: 'Быстро добавить' },
        { keys: quickAddGlobal.replace('CommandOrControl', 'Ctrl').split('+'), label: 'Быстро добавить из любой программы (даже из трея)' },
        { keys: ['Ctrl', ','], label: 'Настройки' },
        { keys: ['Ctrl', '/'], label: 'Эта справка (или ?)' },
        { keys: ['Alt', '1…9'], label: 'Разделы по порядку' },
        { keys: ['[', ']'], label: 'Назад / вперёд' }
      ]
    },
    {
      title: 'На странице',
      items: [
        { keys: ['N'], label: 'Создать (главная кнопка страницы)' },
        { keys: ['/'], label: 'Перейти в поиск по разделу' },
        { keys: ['Esc'], label: 'Закрыть открытую запись' }
      ]
    },
    {
      title: 'Перейти: G, затем буква',
      items: Object.entries(GO_TO).map(([k, v]) => ({ keys: ['G', k.toUpperCase()], label: v.label, sequence: true }))
    },
    {
      title: 'Повторение (Английский, вопросы)',
      items: [
        { keys: ['Пробел'], label: 'Показать ответ' },
        { keys: ['1', '2', '3', '4'], label: 'Забыл · Трудно · Хорошо · Легко' },
        { keys: ['Esc'], label: 'Выйти' }
      ]
    },
    {
      title: 'Быстрое добавление',
      items: [
        { keys: ['Enter'], label: 'Сохранить' },
        { keys: ['Tab'], label: 'Сменить тип' },
        { keys: ['Shift', 'Enter'], label: 'Новая строка' }
      ]
    }
  ]
}
