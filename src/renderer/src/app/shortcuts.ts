import { DEFAULT_QUICK_ADD_SHORTCUT } from '@shared/domain/system'

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

/** Default global quick-add accelerator (shared with main); the user's own one is in settings.quickAddShortcut. */
export const DEFAULT_QUICK_ADD = DEFAULT_QUICK_ADD_SHORTCUT

/** Electron accelerator → display keys: 'CommandOrControl+Shift+Space' → ['Ctrl', 'Shift', 'Space']. */
export function accelToKeys(accel: string): string[] {
  return accel.replace('CommandOrControl', 'Ctrl').split('+')
}

/** Ctrl+B: folds the sidebar to a strip of icons and back (VS Code's key). */
export const SIDEBAR_SHORTCUT: ShortcutDef = {
  keys: ['Ctrl', 'B'],
  label: 'Згорнути / розгорнути бічну панель'
}

/**
 * Ctrl+B by the physical key (`code`), so it works on the Ukrainian layout too (`key` is «и» there).
 * Not with Shift or Alt, not on auto-repeat: holding the keys must not make the panel flicker.
 */
export function isSidebarToggle(
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat'>
): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !e.repeat && e.code === 'KeyB'
}

/** Ctrl+J: the «Чат ШІ» panel on the right (VS Code opens its panel with the same key). */
export const AI_CHAT_SHORTCUT: ShortcutDef = {
  keys: ['Ctrl', 'J'],
  label: 'Чат ШІ: відкрити / закрити'
}

/** Ctrl+J by the physical key: works on the Ukrainian layout («о») and in fields, not on auto-repeat. */
export function isAiChatToggle(
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat'>
): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !e.repeat && e.code === 'KeyJ'
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
        {
          keys: accelToKeys(quickAddGlobal),
          label: 'Швидко додати з будь-якої програми (навіть із трею)'
        },
        { keys: ['Ctrl', ','], label: 'Налаштування' },
        SIDEBAR_SHORTCUT,
        AI_CHAT_SHORTCUT,
        { keys: ['Ctrl', '/'], label: 'Ця довідка (або ?)' },
        { keys: ['Alt', '1…9'], label: 'Розділи в порядку бічної панелі' },
        { keys: ['[', ']'], label: 'Назад / вперед' }
      ]
    },
    {
      title: 'На сторінці',
      items: [
        { keys: ['N'], label: 'Створити (головна кнопка або поле додавання)' },
        { keys: ['/'], label: 'Перейти до пошуку в розділі' },
        { keys: ['E'], label: 'Редагувати відкритий запис' },
        { keys: ['Esc'], label: 'Вийти з редагування / закрити запис' },
        { keys: ['←', '→'], label: 'Календар, підсумки тижня: попередній / наступний період' },
        { keys: ['T'], label: 'Календар, підсумки тижня: до поточного' }
      ]
    },
    {
      title: 'Перейти: G, потім літера',
      items: Object.entries(GO_TO).map(([k, v]) => ({
        keys: ['G', k.toUpperCase()],
        label: v.label,
        sequence: true
      }))
    },
    {
      // Grades of both trainers: words (english/review-parts.tsx) / interview questions (jobs/practice-page.tsx).
      title: 'Повторення слів і тренажер питань',
      items: [
        { keys: ['Пробіл'], label: 'Показати відповідь' },
        { keys: ['1'], label: 'Не згадали / Не вдалося' },
        { keys: ['2'], label: 'Насилу' },
        { keys: ['3'], label: 'Згадали / Добре' },
        { keys: ['4'], label: 'Легко / Впевнено' },
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
    },
    {
      // features/ai-chat: the composer and the panel.
      title: 'Чат ШІ',
      items: [
        { keys: ['Enter'], label: 'Надіслати' },
        { keys: ['Shift', 'Enter'], label: 'Новий рядок' },
        { keys: ['Esc'], label: 'Зупинити відповідь або закрити панель' }
      ]
    },
    {
      // Every Markdown field (components/common/markdown-editor.tsx, keys in lib/md-editor/setup.ts).
      title: 'Текст у Markdown',
      items: [
        {
          keys: ['/'],
          label: 'Меню блоків: заголовок, список, чек-лист, таблиця… (на початку рядка)'
        },
        { keys: ['[['], label: 'Список записів для посилання' },
        { keys: ['↑', '↓'], label: 'Вибрати в меню' },
        { keys: ['Enter'], label: 'Вставити вибране (або Tab)' },
        { keys: ['Esc'], label: 'Закрити меню' },
        {
          keys: ['Enter'],
          label: 'У списку — наступний пункт; на порожньому пункті — кінець списку'
        },
        { keys: ['Tab'], label: 'Вкласти пункт списку (Shift+Tab — винести)' },
        { keys: ['Ctrl', 'B'], label: 'Жирний (у полі Markdown замість бічної панелі)' },
        { keys: ['Ctrl', 'I'], label: 'Курсив' },
        { keys: ['Ctrl', 'K'], label: 'Посилання з виділеного тексту (без виділення — пошук)' }
      ]
    }
  ]
}
