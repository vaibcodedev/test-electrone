import { useState, type ReactNode } from 'react'
import { MoneyLines } from '@/modules/finance/parts'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowUpRight, Briefcase, CalendarDays, Plus, UserRound } from 'lucide-react'
import {
  PROJECT_STATUSES,
  type ClientSummary,
  type ProjectStatus,
  type ProjectSummary
} from '@shared/domain/crm'
import { useApi, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid, VirtualList } from '@/components/common/virtual-list'
import { countLabel, fmtDay, fmtHours, fmtMinutes, fmtMoney, plural } from '@/lib/format'
import {
  EmptyState,
  FilterChips,
  Page,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BILLING_LABEL, CLIENT_STATUS_LABEL, PROJECT_STATUS_LABEL } from './labels'
import { Meter } from './parts'
import { StatTile } from '@/components/common/stat-tile'
import { ClientDialog, ProjectDialog } from './dialogs'
import { AvoidBadge, PlatformBadge, usePlatforms } from './platform-fields'

type Tab = 'clients' | 'projects'

/** Filter value for clients/projects without a platform. */
const DIRECT = '__direct__'

/** Money is the main metric; hours are secondary (most work isn't hourly). */
function Overview() {
  const { data } = useApi('projects', 'overview')
  if (!data) return <div className="grid h-[118px] grid-cols-4 gap-3" />
  return (
    <div className="stagger grid grid-cols-4 gap-3">
      <StatTile
        tone="ink"
        label="Оплачено цього місяця"
        value={<MoneyLines value={data.paidThisMonth} compact className="text-headline" />}
      />
      <StatTile
        label="Очікується до оплати"
        value={<MoneyLines value={data.outstanding} compact className="text-headline" />}
        hint={
          data.overduePayments
            ? `${data.overduePayments} ${plural(data.overduePayments, ['прострочена', 'прострочені', 'прострочено'])}`
            : 'Прострочок немає'
        }
      />
      <StatTile
        label="Проєкти в роботі"
        value={data.activeProjects}
        hint={plural(data.activeProjects, [
          'активний проєкт',
          'активні проєкти',
          'активних проєктів'
        ])}
      />
      <StatTile
        label="Облік часу за місяць"
        value={fmtHours(data.monthMinutes)}
        hint={`${fmtMinutes(data.weekMinutes)} цього тижня`}
      />
    </div>
  )
}

function ClientCard({ client }: { client: ClientSummary }) {
  const navigate = useNavigate()
  return (
    <Item
      asChild
      variant="muted"
      className="group min-h-[168px] min-w-0 flex-col items-stretch justify-between rounded-3xl p-5"
    >
      <button type="button" onClick={() => navigate(`/clients/${client.id}`)} className="min-w-0 text-left">
        <div className="flex items-start justify-between gap-3">
          <Avatar className="size-10">
            <AvatarFallback className="bg-card text-lead font-semibold">
              {client.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <ItemContent className="gap-1">
          <ItemTitle className="w-full truncate text-lead">{client.name}</ItemTitle>
          <ItemDescription className="truncate text-caption">
            {client.company || CLIENT_STATUS_LABEL[client.status]} ·{' '}
            {BILLING_LABEL[client.defaultBilling]}
            {client.country && ` · ${client.country}`}
          </ItemDescription>
          {(client.platformId || client.status === 'avoid') && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <PlatformBadge platformId={client.platformId} />
              {client.status === 'avoid' && <AvoidBadge link={false} />}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
            <span>
              {client.activeProjectCount}/{client.projectCount}{' '}
              {plural(client.projectCount, ['проєкт', 'проєкти', 'проєктів'])}
            </span>
            <span className="text-foreground">{fmtMoney(client.paidTotal, client.currency)}</span>
            {client.outstandingTotal > 0 && (
              <span className="text-warn">
                чекаємо {fmtMoney(client.outstandingTotal, client.currency)}
              </span>
            )}
            {client.defaultBilling === 'hourly' && <span>{fmtHours(client.trackedMinutes)}</span>}
          </div>
        </ItemContent>
      </button>
    </Item>
  )
}

const STATUS_DOT: Record<ProjectSummary['status'], string> = {
  lead: 'bg-info',
  active: 'bg-chart-1',
  paused: 'bg-warn',
  done: 'bg-muted-foreground/60',
  cancelled: 'bg-destructive/70'
}

/** Middle zone: one money/time line, a thin bar under it, and «чекаємо» only when something is owed. */
function ProjectMoney({ p }: { p: ProjectSummary }) {
  const m = (v: number): string => fmtMoney(v, p.currency)
  let line: ReactNode
  let bar: ReactNode = null
  if (p.billing === 'fixed') {
    line = (
      <>
        {m(p.paidAmount)} <span className="text-muted-foreground">з {m(p.fixedPrice)}</span>
      </>
    )
    if (p.fixedPrice > 0) bar = <Meter value={p.paidAmount} max={p.fixedPrice} className="mt-1.5" />
  } else if (p.billing === 'hourly') {
    line = (
      <>
        {fmtHours(p.trackedMinutes)}
        {p.budgetHours > 0 && <span className="text-muted-foreground"> з {p.budgetHours} год</span>}
      </>
    )
    if (p.budgetHours > 0)
      bar = <Meter value={p.trackedMinutes / 60} max={p.budgetHours} className="mt-1.5" />
  } else if (p.billing === 'retainer') {
    line = (
      <>
        {m(p.fixedPrice)}{' '}
        <span className="text-muted-foreground">
          / міс · {p.retainerMonths} {plural(p.retainerMonths, ['місяць', 'місяці', 'місяців'])}
        </span>
      </>
    )
  } else {
    line = <span className="text-muted-foreground">{fmtHours(p.trackedMinutes)} враховано</span>
  }
  const money = <div className="truncate text-body tabular-nums">{line}</div>
  return (
    <div className="min-w-0">
      {p.billing !== 'none' && p.effectiveFeePercent > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>{money}</TooltipTrigger>
          <TooltipContent>
            На руки після комісії {p.effectiveFeePercent}%: {m(p.netPaidAmount)}
          </TooltipContent>
        </Tooltip>
      ) : (
        money
      )}
      {bar}
      {p.billing === 'fixed' && p.fixedPrice > 0 && p.paidAmount > p.fixedPrice ? (
        <div className="mt-1 text-caption text-warn">
          переплата {m(p.paidAmount - p.fixedPrice)}
        </div>
      ) : (
        p.billing !== 'none' &&
        p.outstandingAmount > 0 && (
          <div className="mt-1 text-caption text-warn">чекаємо {m(p.outstandingAmount)}</div>
        )
      )}
    </div>
  )
}

/**
 * Project row in three calm zones: title + status dot and a muted «клієнт · оплата · платформа» line;
 * one money line with a thin bar; deadline on the right (warn ≤3 days, destructive when overdue).
 */
export function ProjectRow({
  project,
  showClient = true
}: {
  project: ProjectSummary
  showClient?: boolean
}) {
  const navigate = useNavigate()
  const platforms = usePlatforms()
  const [today] = useState(() => Date.now())
  const platform = project.platformId ? platforms.find((x) => x.id === project.platformId) : null
  const platformName = project.platformName ?? platform?.name
  const daysLeft = project.dueAt !== null ? Math.ceil((project.dueAt - today) / 86_400_000) : null
  const live = project.status === 'active' || project.status === 'lead'
  const overdue = live && daysLeft !== null && daysLeft < 0
  const soon = live && daysLeft !== null && daysLeft >= 0 && daysLeft <= 3
  return (
    <Item asChild variant="muted" size="sm">
      <button
        type="button"
        onClick={() => navigate(`/projects/${project.id}`)}
        className="grid min-h-[76px] w-full grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_120px] items-center gap-6 px-5 py-4 text-left transition-colors hover:bg-(--tile-hover)"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-body font-semibold">{project.title}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', STATUS_DOT[project.status])} />
              {PROJECT_STATUS_LABEL[project.status]}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
            <span className="truncate">
              {showClient && `${project.clientName ?? 'Без клієнта'} · `}
              {BILLING_LABEL[project.billing]}
            </span>
            {platformName && (
              <span className="flex shrink-0 items-center gap-1.5">
                ·
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: platform?.color ?? 'var(--muted-foreground)' }}
                />
                {platformName}
              </span>
            )}
          </div>
        </div>
        <ProjectMoney p={project} />
        <div
          className={cn(
            'flex items-center justify-end gap-1.5 text-caption',
            overdue ? 'text-destructive' : soon ? 'text-warn' : 'text-muted-foreground'
          )}
        >
          {project.dueAt ? (
            <>
              <CalendarDays className="size-3.5" />
              до {fmtDay(project.dueAt)}
            </>
          ) : (
            '—'
          )}
        </div>
      </button>
    </Item>
  )
}

export function ClientsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'clients'
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

  return (
    <Page>
      <PageHeader
        title="Клієнти й контракти"
        subtitle={
          tab === 'clients' && clients.length
            ? `${countLabel(clients.length, clientList.hasMore, ['клієнт', 'клієнти', 'клієнтів'])} · контакти, доступи, оплати`
            : tab === 'projects' && projects.length
              ? `${countLabel(projects.length, projectList.hasMore, ['проєкт', 'проєкти', 'проєктів'])} · фіксована ціна, ретейнер чи погодинно`
              : 'Контакти, доступи, оплати — фіксована ціна, ретейнер чи погодинно.'
        }
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
        <Overview />
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips<Tab>
            options={[
              { value: 'clients', label: 'Клієнти', count: clientList.hasMore ? undefined : clients.length },
              { value: 'projects', label: 'Проєкти', count: projectList.hasMore ? undefined : projects.length }
            ]}
            value={tab}
            onChange={(v) =>
              setParams(v === 'projects' ? { tab: 'projects' } : {}, { replace: true })
            }
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
                { value: DIRECT, label: 'Напряму' }
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
              !clientList.isLoading && (
                <EmptyState
                  icon={UserRound}
                  title={search || platformId ? 'Нікого не знайдено' : 'Клієнтів поки немає'}
                  hint="Додайте клієнта — до нього прив’яжуться проєкти, доступи й оплати."
                  action={
                    !search && (
                      <Button variant="lime" onClick={() => setClientOpen(true)}>
                        <Plus /> Додати клієнта
                      </Button>
                    )
                  }
                />
              )
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
              !projectList.isLoading && (
                <EmptyState
                  icon={Briefcase}
                  title={search || status || platformId ? 'Проєктів не знайдено' : 'Проєктів поки немає'}
                  hint="Проєкт зберігає оплати, доступи, посилання на стенди й облік часу."
                  action={
                    <Button variant="lime" onClick={() => setProjectOpen(true)}>
                      <Plus /> Створити проєкт
                    </Button>
                  }
                />
              )
            }
          />
        )}
      </div>
      <ClientDialog open={clientOpen} onOpenChange={setClientOpen} />
      <ProjectDialog open={projectOpen} onOpenChange={setProjectOpen} />
    </Page>
  )
}
