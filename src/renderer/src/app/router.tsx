import { lazy, type ComponentType } from 'react'
import { createHashRouter } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { QuickAddWindow } from '@/features/quick-add'
import { DashboardPage } from '@/features/dashboard/dashboard-page'

/** Lazy-load a named export so each module is its own chunk. */
function page<M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M) {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType }))
}

const IdeasPage = page(() => import('@/modules/ideas'), 'IdeasPage')
const BoardsPage = page(() => import('@/modules/boards'), 'BoardsPage')
const BoardPage = page(() => import('@/modules/boards'), 'BoardPage')
const CardRedirect = page(() => import('@/modules/boards'), 'CardRedirect')
const ClaudePage = page(() => import('@/modules/claude'), 'ClaudePage')
const LibrariesPage = page(() => import('@/modules/libraries'), 'LibrariesPage')
const ComponentsPage = page(() => import('@/modules/components'), 'ComponentsPage')
const ComponentPage = page(() => import('@/modules/components'), 'ComponentPage')
const DesignsPage = page(() => import('@/modules/designs'), 'DesignsPage')
const MoodboardPage = page(() => import('@/modules/designs'), 'MoodboardPage')
const SnippetsPage = page(() => import('@/modules/snippets'), 'SnippetsPage')
const ClientsPage = page(() => import('@/modules/crm'), 'ClientsPage')
const ClientPage = page(() => import('@/modules/crm'), 'ClientPage')
const ProjectPage = page(() => import('@/modules/crm'), 'ProjectPage')
const ChecklistsPage = page(() => import('@/modules/checklists'), 'ChecklistsPage')
const ChecklistPage = page(() => import('@/modules/checklists'), 'ChecklistPage')
const FixesPage = page(() => import('@/modules/fixes'), 'FixesPage')
const BookmarksPage = page(() => import('@/modules/bookmarks'), 'BookmarksPage')
const EnglishPage = page(() => import('@/modules/english'), 'EnglishPage')
const ReviewPage = page(() => import('@/modules/english'), 'ReviewPage')
const CalendarPage = page(() => import('@/modules/calendar'), 'CalendarPage')
const FreelanceOverviewPage = page(() => import('@/modules/freelance'), 'FreelanceOverviewPage')
const PlatformPage = page(() => import('@/modules/freelance'), 'PlatformPage')
const ProposalRedirect = page(() => import('@/modules/freelance'), 'ProposalRedirect')
const TemplatesPage = page(() => import('@/modules/freelance'), 'TemplatesPage')
const PortfolioPage = page(() => import('@/modules/freelance'), 'PortfolioPage')
const RedFlagsPage = page(() => import('@/modules/freelance'), 'RedFlagsPage')
const GoalsPage = page(() => import('@/modules/freelance'), 'GoalsPage')
const CalculatorPage = page(() => import('@/modules/freelance'), 'CalculatorPage')
const FinanceOverviewPage = page(() => import('@/modules/finance'), 'FinanceOverviewPage')
const IncomePage = page(() => import('@/modules/finance'), 'IncomePage')
const ExpensesPage = page(() => import('@/modules/finance'), 'ExpensesPage')
const WithdrawalsPage = page(() => import('@/modules/finance'), 'WithdrawalsPage')
const NotesPage = page(() => import('@/modules/notes'), 'NotesPage')
const KnowledgeOverviewPage = page(() => import('@/modules/knowledge'), 'KnowledgeOverviewPage')
const JobsOverviewPage = page(() => import('@/modules/jobs'), 'JobsOverviewPage')
const ApplicationsPage = page(() => import('@/modules/jobs'), 'ApplicationsPage')
const InterviewsPage = page(() => import('@/modules/jobs'), 'InterviewsPage')
const CompaniesPage = page(() => import('@/modules/jobs'), 'CompaniesPage')
const ResumesPage = page(() => import('@/modules/jobs'), 'ResumesPage')
const QuestionsPage = page(() => import('@/modules/jobs'), 'QuestionsPage')
const PracticePage = page(() => import('@/modules/jobs'), 'PracticePage')
const JobBoardsPage = page(() => import('@/modules/jobs'), 'JobBoardsPage')
const JobStatsPage = page(() => import('@/modules/jobs'), 'JobStatsPage')
const DevProjectsPage = page(() => import('@/modules/dev'), 'DevProjectsPage')
const GithubPage = page(() => import('@/modules/dev'), 'GithubPage')
const WeeklyReviewPage = page(() => import('@/modules/review'), 'ReviewPage')
const GuidePage = page(() => import('@/modules/guide'), 'GuidePage')
const TrashPage = page(() => import('@/features/trash-page'), 'TrashPage')
const SettingsPage = page(() => import('@/features/settings-page'), 'SettingsPage')
const TagsPage = page(() => import('@/features/tags-page'), 'TagsPage')

export const router = createHashRouter([
  { path: '/quick-add', element: <QuickAddWindow /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'ideas', element: <IdeasPage /> },
      { path: 'boards', element: <BoardsPage /> },
      { path: 'boards/:id', element: <BoardPage /> },
      { path: 'cards/:id', element: <CardRedirect /> },
      { path: 'claude', element: <ClaudePage /> },
      { path: 'libraries', element: <LibrariesPage /> },
      { path: 'components', element: <ComponentsPage /> },
      { path: 'components/:id', element: <ComponentPage /> },
      { path: 'designs', element: <DesignsPage /> },
      { path: 'designs/boards/:id', element: <MoodboardPage /> },
      { path: 'snippets', element: <SnippetsPage /> },
      { path: 'clients', element: <ClientsPage /> },
      { path: 'clients/:id', element: <ClientPage /> },
      { path: 'projects/:id', element: <ProjectPage /> },
      { path: 'checklists', element: <ChecklistsPage /> },
      { path: 'checklists/:id', element: <ChecklistPage /> },
      { path: 'fixes', element: <FixesPage /> },
      { path: 'bookmarks', element: <BookmarksPage /> },
      { path: 'english', element: <EnglishPage /> },
      { path: 'english/review', element: <ReviewPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'freelance', element: <FreelanceOverviewPage /> },
      { path: 'freelance/p/:platformId', element: <PlatformPage /> },
      { path: 'freelance/proposal/:id', element: <ProposalRedirect /> },
      { path: 'freelance/templates', element: <TemplatesPage /> },
      { path: 'freelance/portfolio', element: <PortfolioPage /> },
      { path: 'freelance/flags', element: <RedFlagsPage /> },
      { path: 'freelance/goals', element: <GoalsPage /> },
      { path: 'freelance/calculator', element: <CalculatorPage /> },
      { path: 'finance', element: <FinanceOverviewPage /> },
      { path: 'finance/income', element: <IncomePage /> },
      { path: 'finance/expenses', element: <ExpensesPage /> },
      { path: 'finance/withdrawals', element: <WithdrawalsPage /> },
      { path: 'notes', element: <NotesPage /> },
      { path: 'knowledge', element: <KnowledgeOverviewPage /> },
      { path: 'jobs', element: <JobsOverviewPage /> },
      { path: 'jobs/applications', element: <ApplicationsPage /> },
      { path: 'jobs/interviews', element: <InterviewsPage /> },
      { path: 'jobs/companies', element: <CompaniesPage /> },
      { path: 'jobs/resumes', element: <ResumesPage /> },
      { path: 'jobs/questions', element: <QuestionsPage /> },
      { path: 'jobs/questions/practice', element: <PracticePage /> },
      { path: 'jobs/boards', element: <JobBoardsPage /> },
      { path: 'jobs/stats', element: <JobStatsPage /> },
      { path: 'dev', element: <DevProjectsPage /> },
      { path: 'dev/github', element: <GithubPage /> },
      { path: 'review', element: <WeeklyReviewPage /> },
      { path: 'guide', element: <GuidePage /> },
      { path: 'tags', element: <TagsPage /> },
      { path: 'trash', element: <TrashPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])
