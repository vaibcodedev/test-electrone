import { useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'
import { Briefcase, Plus, UserRound } from 'lucide-react'
import { PROJECT_STATUSES, type ProjectStatus } from '@shared/domain/crm'
import { useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid, VirtualList } from '@/components/common/virtual-list'
import { countLabel } from '@/lib/format'
import {
  EmptyState,
  FilterChips,
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
import { usePlatforms } from './platform-fields'

type Tab = 'clients' | 'projects'

/** Filter value for clients/projects without a platform. */
const DIRECT = '__direct__'

const NO_RESULTS_HINT = 'Спробуйте інший запит або оберіть усі платформи й статуси.'

const TabLabel = ({ label, count }: { label: string; count?: number }): ReactElement => (
  <>
    {label}
    {count !== undefined && <span className="tabular-nums opacity-55">{count}</span>}
  </>
)

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
  const clientList = useInfiniteApi('clients', 'list', { search: q || undefined, platformId: platform })
  const projectList = useInfiniteApi('projects', 'list', { status, search: q || undefined, platformId: platform })
  const clients = clientList.items
  const projects = projectList.items
  const filtered = !!(search || platformId || (tab === 'projects' && status))
  const resetFilters = (): void => {
    setSearch('')
    setPlatformId(undefined)
    setStatus(undefined)
  }
  const noResults = (
    <Button variant="soft" onClick={resetFilters}>
      Скинути фільтри
    </Button>
  )

  const count =
    tab === 'clients'
      ? clients.length && countLabel(clients.length, clientList.hasMore, ['клієнт', 'клієнти', 'клієнтів'])
      : projects.length && countLabel(projects.length, projectList.hasMore, ['проєкт', 'проєкти', 'проєктів'])

  return (
    <Page>
      <PageHeader
        title="Клієнти й контракти"
        subtitle={count || 'Контакти, доступи й оплати клієнтів'}
        actions={
          <>
            <Button variant="soft" onClick={() => setClientOpen(true)}>
              <UserRound /> Клієнт
            </Button>
            <Button variant="lime" onClick={() => setProjectOpen(true)}>
              <Plus /> Проєкт
            </Button>
          </>
        }
      >
        <CrmOverview />
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Tab>
            size="sm"
            options={[
              {
                value: 'clients',
                label: <TabLabel label="Клієнти" count={clientList.hasMore ? undefined : clients.length} />
              },
              {
                value: 'projects',
                label: <TabLabel label="Проєкти" count={projectList.hasMore ? undefined : projects.length} />
              }
            ]}
            value={tab}
            onChange={(v) => setParams(v === 'projects' ? { tab: 'projects' } : {}, { replace: true })}
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={tab === 'clients' ? 'Знайти клієнта' : 'Знайти проєкт'}
            className="w-64"
          />
          {platforms.length > 0 && (
            <FilterChips<string>
              allLabel="Усі платформи"
              options={[
                ...platforms.map((p) => ({ value: p.id, label: p.name })),
                { value: DIRECT, label: NO_PLATFORM }
              ]}
              value={platformId}
              onChange={setPlatformId}
            />
          )}
          {tab === 'projects' && (
            <FilterChips<ProjectStatus>
              allLabel="Усі статуси"
              options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))}
              value={status}
              onChange={setStatus}
            />
          )}
        </div>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        {tab === 'clients' ? (
          <VirtualGrid
            items={clients}
            loading={clientList.isLoading}
            getKey={(c) => c.id}
            minColumnWidth={260}
            rowHeight={200}
            hasMore={clientList.hasMore}
            loadingMore={clientList.loadingMore}
            onLoadMore={clientList.loadMore}
            renderItem={(c) => <ClientCard client={c} />}
            empty={
              !clientList.isLoading &&
              (filtered ? (
                <EmptyState icon={UserRound} title="Нікого не знайдено" hint={NO_RESULTS_HINT} action={noResults} />
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
                <EmptyState icon={Briefcase} title="Проєктів не знайдено" hint={NO_RESULTS_HINT} action={noResults} />
              ) : (
                <EmptyState
                  icon={Briefcase}
                  title="Проєктів поки немає"
                  hint="Проєкт зберігає оплати, доступи, посилання на стенди й облік часу."
                  cta={{ label: 'Створити проєкт', icon: Plus, onClick: () => setProjectOpen(true) }}
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
