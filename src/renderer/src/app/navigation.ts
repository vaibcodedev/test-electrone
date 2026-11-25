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
  TerminalSquare,
  FolderGit2,
  GitBranch,
  CalendarCheck,
  BookOpen,
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

export const HOME: NavItem = { path: '/', label: 'Головна', icon: House }
export const REVIEW: NavItem = { path: '/review', label: 'Підсумки тижня', icon: CalendarCheck }
export const GUIDE: NavItem = { path: '/guide', label: 'Гайд', icon: BookOpen }

export const HUBS: NavHub[] = [
  {
    id: 'work',
    title: 'Робота',
    icon: SquareKanban,
    items: [
      { path: '/ideas', label: 'Ідеї', icon: Lightbulb, countOf: 'idea' },
      { path: '/boards', label: 'Дошки', icon: SquareKanban, countOf: 'board' },
      { path: '/calendar', label: 'Календар', icon: CalendarDays },
      { path: '/checklists', label: 'Чек-листи', icon: ListChecks, countOf: 'checklist' }
    ]
  },
  {
    id: 'freelance',
    title: 'Фриланс',
    icon: Send,
    overview: '/freelance',
    platforms: true,
    items: [
      { path: '/clients', label: 'Клієнти й контракти', icon: Users, countOf: 'client' },
      { path: '/freelance/templates', label: 'Шаблони', icon: MessageSquareQuote, countOf: 'template' },
      { path: '/freelance/portfolio', label: 'Портфоліо', icon: BriefcaseBusiness, countOf: 'case' },
      { path: '/freelance/flags', label: 'Червоні прапорці', icon: Flag, countOf: 'redflag' },
      { path: '/freelance/goals', label: 'Цілі', icon: Target },
      { path: '/freelance/calculator', label: 'Калькулятор ставки', icon: Calculator }
    ]
  },
  {
    id: 'jobs',
    title: 'Пошук роботи',
    icon: FileUser,
    overview: '/jobs',
    items: [
      { path: '/jobs/applications', label: 'Вакансії', icon: FileUser, countOf: 'application' },
      { path: '/jobs/interviews', label: 'Співбесіди', icon: CalendarDays },
      { path: '/jobs/companies', label: 'Компанії', icon: Building2, countOf: 'company' },
      { path: '/jobs/resumes', label: 'Резюме', icon: FileText },
      { path: '/jobs/questions', label: 'Питання й тренажер', icon: MessageCircleQuestion, countOf: 'question' },
      { path: '/jobs/boards', label: 'Майданчики', icon: Globe },
      { path: '/jobs/stats', label: 'Статистика', icon: ChartColumn },
      { path: '/freelance/templates?situation=cover_letter', label: 'Шаблони листів', icon: MessageSquareQuote }
    ]
  },
  {
    id: 'finance',
    title: 'Фінанси',
    icon: Wallet,
    overview: '/finance',
    items: [
      { path: '/finance/income', label: 'Доходи', icon: TrendingUp },
      { path: '/finance/expenses', label: 'Підписки й витрати', icon: Receipt },
      { path: '/finance/withdrawals', label: 'Виведення', icon: ArrowDownToLine }
    ]
  },
  {
    id: 'dev',
    title: 'Розробка',
    icon: TerminalSquare,
    items: [
      { path: '/dev', label: 'Мої проєкти', icon: FolderGit2 },
      { path: '/dev/github', label: 'GitHub', icon: GitBranch }
    ]
  },
  {
    id: 'knowledge',
    title: 'Знання',
    icon: Library,
    overview: '/knowledge',
    items: [
      { path: '/notes', label: 'Нотатки', icon: NotebookPen, countOf: 'note' },
      { path: '/claude', label: 'Claude', icon: Sparkles, countOf: 'claude' },
      { path: '/snippets', label: 'Сніпети', icon: CodeXml, countOf: 'snippet' },
      { path: '/components', label: 'Компоненти', icon: Component, countOf: 'component' },
      { path: '/libraries', label: 'JS-бібліотеки', icon: Package, countOf: 'library' },
      { path: '/fixes', label: 'Помилки й рішення', icon: Bug, countOf: 'fix' }
    ]
  },
  {
    id: 'inspiration',
    title: 'Натхнення й навчання',
    icon: GraduationCap,
    items: [
      { path: '/designs', label: 'Дизайни', icon: Image, countOf: 'design' },
      { path: '/bookmarks', label: 'Закладки', icon: Bookmark, countOf: 'bookmark' },
      { path: '/english', label: 'Англійська', icon: Languages, countOf: 'word' }
    ]
  }
]

/** Flat list for the command palette and Alt+N shortcuts (overviews first, then sections). */
export const ALL_NAV_ITEMS: NavItem[] = [
  HOME,
  REVIEW,
  GUIDE,
  ...HUBS.flatMap((h) => [
    ...(h.overview ? [{ path: h.overview, label: `${h.title}: огляд`, icon: h.icon }] : []),
    ...h.items
  ])
]

/**
 * Is the location at this nav path? A path with a query («/freelance/templates?situation=cover_letter»)
 * matches only when those params are in `search`; a plain path also matches its sub-pages.
 */
export function isAt(path: string, pathname: string, search = ''): boolean {
  const [base, query] = path.split('?')
  if (!query) return pathname === base || pathname.startsWith(base + '/')
  if (pathname !== base) return false
  const have = new URLSearchParams(search)
  return [...new URLSearchParams(query)].every(([k, v]) => have.get(k) === v)
}

/** Hub that owns a location (for auto-expanding the sidebar). Items with a query win over plain paths. */
export function hubOf(pathname: string, search = ''): string | undefined {
  const byQuery = HUBS.find((h) => h.items.some((i) => i.path.includes('?') && isAt(i.path, pathname, search)))
  if (byQuery) return byQuery.id
  if (pathname.startsWith('/jobs')) return 'jobs'
  if (pathname.startsWith('/dev')) return 'dev'
  if (pathname.startsWith('/freelance') || pathname.startsWith('/clients') || pathname.startsWith('/projects')) return 'freelance'
  for (const h of HUBS) {
    if (h.overview && pathname === h.overview) return h.id
    if (h.items.some((i) => pathname === i.path || pathname.startsWith(i.path + '/'))) return h.id
  }
  return undefined
}
