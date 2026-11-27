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
import type { NavHubId, QuickAddTarget } from '@shared/domain/system'

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
  id: NavHubId
  title: string
  icon: LucideIcon
  overview?: string
  items: NavItem[]
  /** Freelance only: platform pages are inserted before the static items. */
  platforms?: boolean
}

export const HOME: NavItem = { path: '/', label: 'Головна', icon: House }
export const CALENDAR: NavItem = { path: '/calendar', label: 'Календар', icon: CalendarDays }
export const REVIEW: NavItem = { path: '/review', label: 'Підсумки тижня', icon: CalendarCheck }
export const GUIDE: NavItem = { path: '/guide', label: 'Гайд', icon: BookOpen }

/**
 * Cross-cutting sections under «Головна», outside any hub, in menu order. Each has its own switch in
 * «Налаштування → Меню».
 */
export const TOP_ITEMS: readonly NavItem[] = [CALENDAR, REVIEW]

export const HUBS: NavHub[] = [
  {
    id: 'work',
    title: 'Інструменти',
    icon: SquareKanban,
    items: [
      { path: '/boards', label: 'Дошки', icon: SquareKanban, countOf: 'board' },
      { path: '/checklists', label: 'Чек-листи', icon: ListChecks, countOf: 'checklist' },
      { path: '/freelance/templates', label: 'Шаблони', icon: MessageSquareQuote, countOf: 'template' }
    ]
  },
  {
    id: 'freelance',
    title: 'Фриланс',
    icon: Send,
    overview: '/freelance',
    platforms: true,
    items: [
      { path: '/clients', label: 'Клієнти й проєкти', icon: Users, countOf: 'client' },
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
      { path: '/jobs/boards', label: 'Сайти вакансій', icon: Globe },
      { path: '/jobs/stats', label: 'Статистика', icon: ChartColumn }
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
      { path: '/finance/withdrawals', label: 'Виплати з платформ', icon: ArrowDownToLine }
    ]
  },
  {
    id: 'dev',
    title: 'Розробка',
    icon: TerminalSquare,
    items: [
      { path: '/ideas', label: 'Ідеї', icon: Lightbulb, countOf: 'idea' },
      { path: '/dev', label: 'Локальні проєкти', icon: FolderGit2 },
      { path: '/dev/github', label: 'GitHub', icon: GitBranch }
    ]
  },
  {
    id: 'knowledge',
    title: 'База знань',
    icon: Library,
    overview: '/knowledge',
    items: [
      { path: '/notes', label: 'Нотатки', icon: NotebookPen, countOf: 'note' },
      { path: '/claude', label: 'ШІ-база', icon: Sparkles, countOf: 'claude' },
      { path: '/snippets', label: 'Сніпети', icon: CodeXml, countOf: 'snippet' },
      { path: '/components', label: 'Компоненти', icon: Component, countOf: 'component' },
      { path: '/libraries', label: 'Бібліотеки', icon: Package, countOf: 'library' },
      { path: '/fixes', label: 'Фікси', icon: Bug, countOf: 'fix' },
      { path: '/designs', label: 'Галерея', icon: Image, countOf: 'design' },
      { path: '/bookmarks', label: 'Закладки', icon: Bookmark, countOf: 'bookmark' }
    ]
  },
  {
    id: 'inspiration',
    title: 'Навчання',
    icon: GraduationCap,
    items: [
      { path: '/english', label: 'Англійська', icon: Languages, countOf: 'word' },
      { path: '/jobs/questions', label: 'До співбесід', icon: MessageCircleQuestion, countOf: 'question' }
    ]
  }
]

/**
 * Always in the menu, never offered in «Налаштування → Меню»: Головна, the guide and the footer icons
 * (Мітки, Кошик, Налаштування). They are not in HUBS, so the visibility switches never reach them.
 */
export const ALWAYS_SHOWN: readonly string[] = ['/', GUIDE.path, '/tags', '/trash', '/settings']

/**
 * Flat list for the command palette and Alt+1…9, in sidebar order: Головна, the top items, each hub (overview,
 * then sections), and the guide last — in the sidebar it is a footer icon, so Alt+3 must not open it.
 * Takes the hubs that are shown (useNavVisibility), so the numbers follow the menu the user sees.
 */
export function navOrder(hubs: NavHub[] = HUBS, top: readonly NavItem[] = TOP_ITEMS): NavItem[] {
  return [
    HOME,
    ...top,
    ...hubs.flatMap((h) => [
      ...(h.overview ? [{ path: h.overview, label: `${h.title}: огляд`, icon: h.icon }] : []),
      ...h.items
    ]),
    GUIDE
  ]
}

/** Quick-add target → the menu item that owns it: a hidden section offers no quick-add chip or tile. */
export const QUICK_ADD_PLACE: Record<QuickAddTarget, string> = {
  idea: '/ideas',
  card: '/boards',
  claude: '/claude',
  snippet: '/snippets',
  bookmark: '/bookmarks',
  word: '/english',
  event: '/calendar'
}

/** Is the location at this nav path? A path also matches its sub-pages. */
export function isAt(path: string, pathname: string): boolean {
  return pathname === path || pathname.startsWith(path + '/')
}

/** Hub that owns a location (for auto-expanding the sidebar). */
export function hubOf(pathname: string): NavHubId | undefined {
  // The menu decides: the most specific item wins over a path prefix («/jobs/questions» is in «Навчання»).
  let best: { id: NavHubId; length: number } | undefined
  for (const h of HUBS) {
    for (const i of h.items) {
      if (isAt(i.path, pathname) && i.path.length > (best?.length ?? 0))
        best = { id: h.id, length: i.path.length }
    }
  }
  if (best) return best.id
  const overview = HUBS.find((h) => h.overview === pathname)
  if (overview) return overview.id
  // Pages without a menu item of their own.
  if (pathname.startsWith('/jobs')) return 'jobs'
  if (pathname.startsWith('/freelance') || pathname.startsWith('/projects')) return 'freelance'
  return undefined
}
