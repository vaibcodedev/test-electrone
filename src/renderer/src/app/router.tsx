import { lazy, type ComponentType } from 'react'
import { createHashRouter } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { QuickAddWindow } from '@/features/quick-add'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { RouteError } from '@/features/route-error'

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
  { path: '/quick-add', element: <QuickAddWindow />, errorElement: <RouteError /> },
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DashboardPage />, handle: { skeleton: 'dashboard' } },
          { path: 'ideas', element: <IdeasPage />, handle: { skeleton: 'list' } },
          { path: 'boards', element: <BoardsPage />, handle: { skeleton: 'grid' } },
          { path: 'boards/:id', element: <BoardPage />, handle: { skeleton: 'board' } },
          { path: 'cards/:id', element: <CardRedirect />, handle: { skeleton: 'board' } },
          { path: 'claude', element: <ClaudePage />, handle: { skeleton: 'list' } },
          { path: 'libraries', element: <LibrariesPage />, handle: { skeleton: 'grid' } },
          { path: 'components', element: <ComponentsPage />, handle: { skeleton: 'grid' } },
          { path: 'components/:id', element: <ComponentPage />, handle: { skeleton: 'detail' } },
          { path: 'designs', element: <DesignsPage />, handle: { skeleton: 'grid' } },
          { path: 'designs/boards/:id', element: <MoodboardPage />, handle: { skeleton: 'grid' } },
          { path: 'snippets', element: <SnippetsPage />, handle: { skeleton: 'grid' } },
          { path: 'clients', element: <ClientsPage />, handle: { skeleton: 'list' } },
          { path: 'clients/:id', element: <ClientPage />, handle: { skeleton: 'detail' } },
          { path: 'projects/:id', element: <ProjectPage />, handle: { skeleton: 'detail' } },
          { path: 'checklists', element: <ChecklistsPage />, handle: { skeleton: 'grid' } },
          { path: 'checklists/:id', element: <ChecklistPage />, handle: { skeleton: 'detail' } },
          { path: 'fixes', element: <FixesPage />, handle: { skeleton: 'list' } },
          { path: 'bookmarks', element: <BookmarksPage />, handle: { skeleton: 'list' } },
          { path: 'english', element: <EnglishPage />, handle: { skeleton: 'grid' } },
          { path: 'english/review', element: <ReviewPage />, handle: { skeleton: 'focus' } },
          { path: 'calendar', element: <CalendarPage />, handle: { skeleton: 'calendar' } },
          { path: 'freelance', element: <FreelanceOverviewPage />, handle: { skeleton: 'overview' } },
          { path: 'freelance/p/:platformId', element: <PlatformPage />, handle: { skeleton: 'board' } },
          { path: 'freelance/proposal/:id', element: <ProposalRedirect />, handle: { skeleton: 'board' } },
          { path: 'freelance/templates', element: <TemplatesPage />, handle: { skeleton: 'list' } },
          { path: 'freelance/portfolio', element: <PortfolioPage />, handle: { skeleton: 'grid' } },
          { path: 'freelance/flags', element: <RedFlagsPage />, handle: { skeleton: 'list' } },
          { path: 'freelance/goals', element: <GoalsPage />, handle: { skeleton: 'grid' } },
          { path: 'freelance/calculator', element: <CalculatorPage />, handle: { skeleton: 'form' } },
          { path: 'finance', element: <FinanceOverviewPage />, handle: { skeleton: 'overview' } },
          { path: 'finance/income', element: <IncomePage />, handle: { skeleton: 'list' } },
          { path: 'finance/expenses', element: <ExpensesPage />, handle: { skeleton: 'list' } },
          { path: 'finance/withdrawals', element: <WithdrawalsPage />, handle: { skeleton: 'list' } },
          { path: 'notes', element: <NotesPage />, handle: { skeleton: 'list' } },
          { path: 'knowledge', element: <KnowledgeOverviewPage />, handle: { skeleton: 'overview' } },
          { path: 'jobs', element: <JobsOverviewPage />, handle: { skeleton: 'overview' } },
          { path: 'jobs/applications', element: <ApplicationsPage />, handle: { skeleton: 'board' } },
          { path: 'jobs/interviews', element: <InterviewsPage />, handle: { skeleton: 'list' } },
          { path: 'jobs/companies', element: <CompaniesPage />, handle: { skeleton: 'list' } },
          { path: 'jobs/resumes', element: <ResumesPage />, handle: { skeleton: 'grid' } },
          { path: 'jobs/questions', element: <QuestionsPage />, handle: { skeleton: 'list' } },
          { path: 'jobs/questions/practice', element: <PracticePage />, handle: { skeleton: 'focus' } },
          { path: 'jobs/boards', element: <JobBoardsPage />, handle: { skeleton: 'list' } },
          { path: 'jobs/stats', element: <JobStatsPage />, handle: { skeleton: 'overview' } },
          { path: 'dev', element: <DevProjectsPage />, handle: { skeleton: 'grid' } },
          { path: 'dev/github', element: <GithubPage />, handle: { skeleton: 'list' } },
          { path: 'review', element: <WeeklyReviewPage />, handle: { skeleton: 'overview' } },
          { path: 'guide', element: <GuidePage />, handle: { skeleton: 'form' } },
          { path: 'tags', element: <TagsPage />, handle: { skeleton: 'list' } },
          { path: 'trash', element: <TrashPage />, handle: { skeleton: 'list' } },
          { path: 'settings', element: <SettingsPage />, handle: { skeleton: 'form' } }
        ]
      }
    ]
  }
])
