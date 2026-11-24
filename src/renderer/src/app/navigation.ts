import {
  Bookmark,
  Briefcase,
  Bug,
  CalendarDays,
  CodeXml,
  Component,
  House,
  Image,
  Languages,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Package,
  Sparkles,
  SquareKanban,
  StickyNote,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import type { EntityType } from '@shared/entity-types'

export const ENTITY_ICON: Record<EntityType, LucideIcon> = {
  idea: Lightbulb,
  board: SquareKanban,
  card: StickyNote,
  claude: Sparkles,
  library: Package,
  component: Component,
  design: Image,
  moodboard: LayoutGrid,
  snippet: CodeXml,
  client: UserRound,
  project: Briefcase,
  checklist: ListChecks,
  fix: Bug,
  bookmark: Bookmark,
  word: Languages,
  event: CalendarDays
}

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** Entity type whose count is shown next to the item. */
  countOf?: EntityType
  hotkey?: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

/** Sidebar structure. Order = keyboard shortcuts Alt+1…Alt+9 for the first nine. */
export const NAV: NavGroup[] = [
  {
    title: 'Работа',
    items: [
      { path: '/', label: 'Главная', icon: House },
      { path: '/ideas', label: 'Идеи', icon: Lightbulb, countOf: 'idea' },
      { path: '/boards', label: 'Доски', icon: SquareKanban, countOf: 'board' },
      { path: '/calendar', label: 'Календарь', icon: CalendarDays },
      { path: '/clients', label: 'Клиенты и проекты', icon: Briefcase, countOf: 'project' },
      { path: '/checklists', label: 'Чек-листы', icon: ListChecks, countOf: 'checklist' }
    ]
  },
  {
    title: 'Знания',
    items: [
      { path: '/claude', label: 'Claude', icon: Sparkles, countOf: 'claude' },
      { path: '/snippets', label: 'Сниппеты', icon: CodeXml, countOf: 'snippet' },
      { path: '/components', label: 'Компоненты', icon: Component, countOf: 'component' },
      { path: '/libraries', label: 'JS-библиотеки', icon: Package, countOf: 'library' },
      { path: '/designs', label: 'Дизайны', icon: Image, countOf: 'design' },
      { path: '/fixes', label: 'Ошибки и решения', icon: Bug, countOf: 'fix' },
      { path: '/bookmarks', label: 'Закладки', icon: Bookmark, countOf: 'bookmark' },
      { path: '/english', label: 'Английский', icon: Languages, countOf: 'word' }
    ]
  }
]

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items)
