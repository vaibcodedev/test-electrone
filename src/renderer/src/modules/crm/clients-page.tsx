import { useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'
import { Briefcase, Plus, UserPlus, UserRound, type LucideIcon } from 'lucide-react'
import { PROJECT_STATUSES, type ProjectStatus } from '@shared/domain/crm'
import { useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid, VirtualList } from '@/components/common/virtual-list'
import { countLabel } from '@/lib/format'
import {
  EmptyState,
  FilterBar,
  FilterChips,
  NoResults,
  Page,
  PageHeader,
  SearchInput,
  Segmented
} from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { NO_PLATFORM, PROJECT_STATUS_LABEL } from './labels'
import { ClientDialog, ProjectDialog } from './dialogs'
import { ClientCard } from './client-card'
import { CrmOverview } from './crm-overview'
import { ProjectRow } from './project-row'
import { usePlatforms } from './use-platforms'
import { noResultsHint } from '../claude/chips'

type Tab = 'clients' | 'projects'

/** Filter value for clients/projects without a platform. */
const DIRECT = '__direct__'

export function ClientsPage(): ReactElement {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'projects' ? 'projects' : 'clients'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProjectStatus | undefined>()
  const [platformId, setPlatformId] = useState<string | undefined>()
  const platforms = usePlatforms()
  const [clientOpen, setClientOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  // Search and filters run on the server; both lists load in pages of 100 and are virtualized.
  const q = useDebounced(search.trim())
  const platform = platformId === DIRECT ? 'direct' : platformId
  const clientList = useInfiniteApi('clients', 'list', {
    search: q || undefined,
    platformId: platform
  })
  const projectList = useInfiniteApi('projects', 'list', {
    status,
    search: q || undefined,
    platformId: platform
  })
  const clients = clientList.items
  const projects = projectList.items
  const filtered = !!(search || platformId || (tab === 'projects' && status))
  const resetFilters = (): void => {
    setSearch('')
    setPlatformId(undefined)
    setStatus(undefined)
  }
  const noResults = (icon: LucideIcon): ReactElement => (
    <NoResults
      icon={icon}
      hint={noResultsHint(search, !!platformId || (tab === 'projects' && !!status))}
      onReset={resetFilters}
    />
  )
  // A new base: only the empty state and its one action — no zero tiles, counts or chips above it.
  const blank =
    !filtered &&
    !clientList.isLoading &&
    !projectList.isLoading &&
    !clients.length &&
    !projects.length
  // Platform chips filter something only when there is something. They don't depend on the open tab:
  // switching tabs must not make the row blink.
  const showPlatforms =
    platforms.length > 0 && (filtered || clients.length > 0 || projects.length > 0)

  const list = tab === 'clients' ? clientList : projectList
  const n = list.items.length
  const subtitle =
    (filtered && !list.isLoading) || n
      ? countLabel(
          n,
          list.hasMore,
          tab === 'clients' ? ['клієнт', 'клієнти', 'клієнтів'] : ['проєкт', 'проєкти', 'проєктів']
        )
      : 'Контакти, доступи й оплати клієнтів'

  return (
    <Page>
      <PageHeader
        title="Клієнти й проєкти"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="soft" onClick={() => setClientOpen(true)}>
              <UserPlus /> Клієнт
            </Button>
            <Button variant="lime" onClick={() => setProjectOpen(true)}>
              <Plus /> Проєкт
            </Button>
          </>
        }
      >
        {!blank && <CrmOverview />}
        <FilterBar
          chips={
            <>
              <Segmented<Tab>
                size="sm"
                options={[
                  {
                    value: 'clients',
                    label: 'Клієнти',
                    count: blank || clientList.hasMore ? undefined : clients.length
                  },
                  {
                    value: 'projects',
                    label: 'Проєкти',
                    // The status filter is hidden on «Клієнти»: a count it narrowed would mislead.
                    count:
                      blank || projectList.hasMore || (tab === 'clients' && status)
                        ? undefined
                        : projects.length
                  }
                ]}
                value={tab}
                onChange={(v) =>
                  setParams(v === 'projects' ? { tab: 'projects' } : {}, { replace: true })
                }
              />
              {showPlatforms && (
                <FilterChips<string>
                  label="Платформа"
                  allLabel="Усі платформи"
                  options={[
                    ...platforms.map((p) => ({ value: p.id, label: p.name })),
                    { value: DIRECT, label: NO_PLATFORM }
                  ]}
                  value={platformId}
                  onChange={setPlatformId}
                />
              )}
            </>
          }
          // Nothing to search in a tab without records; the tabs themselves stay.
          trailing={
            (search ||
              filtered ||
              !(tab === 'clients' ? clientList : projectList).showEmpty ||
              (tab === 'clients' ? clients : projects).length > 0) && (
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={tab === 'clients' ? 'Знайти клієнта' : 'Знайти проєкт'}
              />
            )
          }
          secondary={
            // No row of status chips over the empty state of a base without projects.
            tab === 'projects' &&
            (filtered || projectList.isLoading || projects.length > 0) && (
              <FilterChips<ProjectStatus>
                label="Статус проєкту"
                tone="neutral"
                allLabel="Усі статуси"
                options={PROJECT_STATUSES.map((s) => ({
                  value: s,
                  label: PROJECT_STATUS_LABEL[s]
                }))}
                value={status}
                onChange={setStatus}
              />
            )
          }
        />
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        {tab === 'clients' ? (
          <VirtualGrid
            items={clients}
            loading={clientList.isLoading}
            getKey={(c) => c.id}
            minColumnWidth={260}
            rowHeight={248}
            hasMore={clientList.hasMore}
            loadingMore={clientList.loadingMore}
            onLoadMore={clientList.loadMore}
            renderItem={(c) => <ClientCard client={c} />}
            empty={
              !clientList.isLoading &&
              (filtered ? (
                noResults(UserRound)
              ) : (
                <EmptyState
                  icon={UserRound}
                  title="Клієнтів поки немає"
                  hint="Додайте клієнта — до нього прив’яжуться проєкти, доступи й оплати."
                  cta={{ label: 'Додати клієнта', icon: Plus, onClick: () => setClientOpen(true) }}
                />
              ))
            }
          />
        ) : (
          <VirtualList
            items={projects}
            loading={projectList.isLoading}
            getKey={(p) => p.id}
            estimateSize={88}
            gap={8}
            hasMore={projectList.hasMore}
            loadingMore={projectList.loadingMore}
            onLoadMore={projectList.loadMore}
            renderItem={(p) => <ProjectRow project={p} />}
            empty={
              !projectList.isLoading &&
              (filtered ? (
                noResults(Briefcase)
              ) : (
                <EmptyState
                  icon={Briefcase}
                  title="Проєктів поки немає"
                  hint="Проєкт зберігає оплати, доступи, посилання на стенди й облік часу."
                  cta={{
                    label: 'Створити проєкт',
                    icon: Plus,
                    onClick: () => setProjectOpen(true)
                  }}
                />
              ))
            }
          />
        )}
      </div>
      <ClientDialog open={clientOpen} onOpenChange={setClientOpen} />
      <ProjectDialog open={projectOpen} onOpenChange={setProjectOpen} />
    </Page>
  )
}
