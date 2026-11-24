import {
  Bookmark,
  Briefcase,
  BriefcaseBusiness,
  Bug,
  Calculator,
  CalendarDays,
  CodeXml,
  Component,
  Flag,
  GraduationCap,
  House,
  Image,
  Landmark,
  Languages,
  LayoutGrid,
  Library,
  Lightbulb,
  ListChecks,
  MessageSquareQuote,
  NotebookPen,
  Package,
  Receipt,
  Send,
  Sparkles,
  SquareKanban,
  StickyNote,
  Target,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  ArrowDownToLine,
  FileUser,
  FileText,
  Globe,
  ChartColumn,
  Building2,
  MessageCircleQuestion,
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
  event: CalendarDays,
  note: NotebookPen,
  proposal: Send,
  template: MessageSquareQuote,
  case: BriefcaseBusiness,
  redflag: Flag,
  application: FileUser,
  company: Building2,
  question: MessageCircleQuestion
}

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** Entity type whose count is shown next to the item. */
  countOf?: EntityType
}

/**
 * A hub groups related sections (one nesting level in the sidebar).
 * `overview` is the hub landing page; `platforms: true` injects the user's freelance platforms.
 */
export interface NavHub {
  id: string
  title: string
  icon: LucideIcon
  overview?: string
  items: NavItem[]
  /** Freelance only: platform pages are inserted before the static items. */
  platforms?: boolean
}

export const HOME: NavItem = { path: '/', label: 'Главная', icon: House }

export const HUBS: NavHub[] = [
  {
    id: 'work',
    title: 'Работа',
    icon: SquareKanban,
    items: [
      { path: '/ideas', label: 'Идеи', icon: Lightbulb, countOf: 'idea' },
      { path: '/boards', label: 'Доски', icon: SquareKanban, countOf: 'board' },
      { path: '/calendar', label: 'Календарь', icon: CalendarDays },
      { path: '/checklists', label: 'Чек-листы', icon: ListChecks, countOf: 'checklist' }
    ]
  },
  {
    id: 'freelance',
    title: 'Фриланс',
    icon: Send,
    overview: '/freelance',
    platforms: true,
    items: [
      { path: '/clients', label: 'Клиенты и контракты', icon: Users, countOf: 'client' },
      { path: '/freelance/templates', label: 'Шаблоны', icon: MessageSquareQuote, countOf: 'template' },
      { path: '/freelance/portfolio', label: 'Портфолио', icon: BriefcaseBusiness, countOf: 'case' },
      { path: '/freelance/flags', label: 'Красные флаги', icon: Flag, countOf: 'redflag' },
      { path: '/freelance/goals', label: 'Цели', icon: Target },
      { path: '/freelance/calculator', label: 'Калькулятор ставки', icon: Calculator }
    ]
  },
  {
    id: 'jobs',
    title: 'Поиск работы',
    icon: FileUser,
    overview: '/jobs',
    items: [
      { path: '/jobs/applications', label: 'Вакансии', icon: FileUser, countOf: 'application' },
      { path: '/jobs/interviews', label: 'Собеседования', icon: CalendarDays },
      { path: '/jobs/companies', label: 'Компании', icon: Building2, countOf: 'company' },
      { path: '/jobs/resumes', label: 'Резюме', icon: FileText },
      { path: '/jobs/questions', label: 'Вопросы и тренажёр', icon: MessageCircleQuestion, countOf: 'question' },
      { path: '/jobs/boards', label: 'Площадки', icon: Globe },
      { path: '/jobs/stats', label: 'Статистика', icon: ChartColumn },
      { path: '/freelance/templates?situation=cover_letter', label: 'Шаблоны писем', icon: MessageSquareQuote }
    ]
  },
  {
    id: 'finance',
    title: 'Финансы',
    icon: Wallet,
    overview: '/finance',
    items: [
      { path: '/finance/income', label: 'Доходы', icon: TrendingUp },
      { path: '/finance/expenses', label: 'Подписки и расходы', icon: Receipt },
      { path: '/finance/withdrawals', label: 'Выводы', icon: ArrowDownToLine }
    ]
  },
  {
    id: 'knowledge',
    title: 'Знания',
    icon: Library,
    overview: '/knowledge',
    items: [
      { path: '/notes', label: 'Заметки', icon: NotebookPen, countOf: 'note' },
      { path: '/claude', label: 'Claude', icon: Sparkles, countOf: 'claude' },
      { path: '/snippets', label: 'Сниппеты', icon: CodeXml, countOf: 'snippet' },
      { path: '/components', label: 'Компоненты', icon: Component, countOf: 'component' },
      { path: '/libraries', label: 'JS-библиотеки', icon: Package, countOf: 'library' },
      { path: '/fixes', label: 'Ошибки и решения', icon: Bug, countOf: 'fix' }
    ]
  },
  {
    id: 'inspiration',
    title: 'Вдохновение и учёба',
    icon: GraduationCap,
    items: [
      { path: '/designs', label: 'Дизайны', icon: Image, countOf: 'design' },
      { path: '/bookmarks', label: 'Закладки', icon: Bookmark, countOf: 'bookmark' },
      { path: '/english', label: 'Английский', icon: Languages, countOf: 'word' }
    ]
  }
]

export const PLATFORM_ICON = Landmark

/** Flat list for the command palette and Alt+N shortcuts (overviews first, then sections). */
export const ALL_NAV_ITEMS: NavItem[] = [
  HOME,
  ...HUBS.flatMap((h) => [
    ...(h.overview ? [{ path: h.overview, label: `${h.title}: обзор`, icon: h.icon }] : []),
    ...h.items
  ])
]

/** Hub that owns a pathname (for auto-expanding the sidebar). */
export function hubOf(pathname: string): string | undefined {
  if (pathname.startsWith('/jobs')) return 'jobs'
  if (pathname.startsWith('/freelance') || pathname.startsWith('/clients') || pathname.startsWith('/projects')) return 'freelance'
  for (const h of HUBS) {
    if (h.overview && pathname === h.overview) return h.id
    if (h.items.some((i) => pathname === i.path || pathname.startsWith(i.path + '/'))) return h.id
  }
  return undefined
}
