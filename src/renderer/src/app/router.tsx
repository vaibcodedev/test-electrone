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
      { path: 'tags', element: <TagsPage /> },
      { path: 'trash', element: <TrashPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])
