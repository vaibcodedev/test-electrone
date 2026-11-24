import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowUpRight, Briefcase, Plus, UserRound } from 'lucide-react'
import {
  PROJECT_STATUSES,
  type ClientSummary,
  type ProjectStatus,
  type ProjectSummary
} from '@shared/domain/crm'
import { useApi } from '@/lib/query'
import { fmtDay, fmtHours, fmtMinutes, fmtMoney, plural } from '@/lib/format'
import {
  EmptyState,
  FilterChips,
  Page,
  PageBody,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import { TagList } from '@/components/common/tags'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'
import {
  BILLING_LABEL,
  CLIENT_STATUS_LABEL,
  PROJECT_STATUS_BADGE,
  PROJECT_STATUS_LABEL
} from './labels'
import { Meter, StatTile } from './parts'
import { moneyMap } from './money'
import { ClientDialog, ProjectDialog } from './dialogs'
import { AvoidBadge, NetPaid, PlatformBadge, usePlatforms } from './platform-fields'

type Tab = 'clients' | 'projects'

/** Filter value for clients/projects without a platform. */
const DIRECT = '__direct__'

/** Money is the main metric; hours are secondary (most work isn't hourly). */
function Overview() {
  const { data } = useApi('projects', 'overview')
  if (!data) return <div className="grid h-[118px] grid-cols-4 gap-3" />
  return (
    <div className="grid grid-cols-4 gap-3">
      <StatTile
        tone="ink"
        label="Оплачено в этом месяце"
        value={<span className="text-[24px]">{moneyMap(data.paidThisMonth)}</span>}
      />
      <StatTile
        label="Ожидается к оплате"
        value={<span className="text-[24px]">{moneyMap(data.outstanding)}</span>}
        hint={
          data.overduePayments
            ? `${data.overduePayments} ${plural(data.overduePayments, ['просрочена', 'просрочены', 'просрочено'])}`
            : 'Просрочек нет'
        }
      />
      <StatTile
        label="Проекты в работе"
        value={data.activeProjects}
        hint={plural(data.activeProjects, [
          'активный проект',
          'активных проекта',
          'активных проектов'
        ])}
      />
      <StatTile
        label="Учёт времени за месяц"
        value={fmtHours(data.monthMinutes)}
        hint={`${fmtMinutes(data.weekMinutes)} на этой неделе`}
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
      className="group min-h-[168px] flex-col items-stretch justify-between rounded-3xl p-5"
    >
      <button type="button" onClick={() => navigate(`/clients/${client.id}`)} className="text-left">
        <div className="flex items-start justify-between gap-3">
          <Avatar className="size-10">
            <AvatarFallback className="bg-card text-lead font-semibold">
              {client.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <ItemContent className="gap-1">
          <ItemTitle className="w-full truncate text-[16px]">{client.name}</ItemTitle>
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
              {plural(client.projectCount, ['проект', 'проекта', 'проектов'])}
            </span>
            <span className="text-foreground">{fmtMoney(client.paidTotal, client.currency)}</span>
            {client.outstandingTotal > 0 && (
              <span className="text-warn">
                ждём {fmtMoney(client.outstandingTotal, client.currency)}
              </span>
            )}
            {client.defaultBilling === 'hourly' && <span>{fmtHours(client.trackedMinutes)}</span>}
          </div>
        </ItemContent>
      </button>
    </Item>
  )
}

/** The progress metric that matters for each billing type. */
function BillingProgress({ project: p }: { project: ProjectSummary }) {
  if (p.billing === 'hourly') {
    return (
      <>
        <div className="flex justify-between text-caption">
          <span>{fmtHours(p.trackedMinutes)}</span>
          {p.budgetHours > 0 && <span className="text-muted-foreground">из {p.budgetHours} ч</span>}
        </div>
        {p.budgetHours > 0 && (
          <Meter value={p.trackedMinutes / 60} max={p.budgetHours} className="mt-1.5" />
        )}
      </>
    )
  }
  if (p.billing === 'fixed') {
    return (
      <>
        <div className="flex justify-between text-caption">
          <span>
            оплачено {p.fixedPrice ? Math.round((p.paidAmount / p.fixedPrice) * 100) : 0}%
          </span>
          <span className="text-muted-foreground">{fmtMoney(p.fixedPrice, p.currency)}</span>
        </div>
        {p.fixedPrice > 0 && <Meter value={p.paidAmount} max={p.fixedPrice} className="mt-1.5" />}
      </>
    )
  }
  if (p.billing === 'retainer') {
    return (
      <div className="text-caption">
        {fmtMoney(p.fixedPrice, p.currency)} <span className="text-muted-foreground">/ мес</span>
        <div className="text-muted-foreground">
          {p.retainerMonths} {plural(p.retainerMonths, ['месяц', 'месяца', 'месяцев'])}
        </div>
      </div>
    )
  }
  return (
    <div className="text-caption text-muted-foreground">{fmtHours(p.trackedMinutes)} учтено</div>
  )
}

export function ProjectRow({
  project,
  showClient = true
}: {
  project: ProjectSummary
  showClient?: boolean
}) {
  const navigate = useNavigate()
  const [today] = useState(() => Date.now())
  const overdue = project.dueAt !== null && project.dueAt < today && project.status === 'active'
  const paid = project.billing !== 'none'
  return (
    <Item asChild variant="muted" size="sm">
      <button
        type="button"
        onClick={() => navigate(`/projects/${project.id}`)}
        className="grid w-full grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_100px] items-center gap-5 px-5 py-3.5 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lead font-medium">{project.title}</span>
            <Badge variant={PROJECT_STATUS_BADGE[project.status]}>
              {PROJECT_STATUS_LABEL[project.status]}
            </Badge>
            <PlatformBadge platformId={project.platformId} name={project.platformName} />
          </div>
          <div className="mt-0.5 truncate text-caption text-muted-foreground">
            {showClient && `${project.clientName ?? 'Без клиента'} · `}
            {BILLING_LABEL[project.billing]}
          </div>
          <TagList tags={project.tags} max={3} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <BillingProgress project={project} />
        </div>
        <div className="min-w-0 text-caption leading-relaxed">
          {paid ? (
            <>
              <div>
                <span className="text-muted-foreground">Оплачено </span>
                {fmtMoney(project.paidAmount, project.currency)}
              </div>
              <NetPaid project={project} className="block" />
              {project.outstandingAmount > 0 ? (
                <div className="text-warn">
                  ждём {fmtMoney(project.outstandingAmount, project.currency)}
                </div>
              ) : (
                <div className="text-muted-foreground">долгов нет</div>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">без оплаты</span>
          )}
        </div>
        <div
          className={cn(
            'text-right text-caption',
            overdue ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {project.dueAt ? `до ${fmtDay(project.dueAt)}` : '—'}
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
  const { data: clients = [] } = useApi('clients', 'list')
  const { data: allProjects = [] } = useApi('projects', 'list', {
    status,
    search: search || undefined
  })
  const projects = useMemo(
    () =>
      !platformId
        ? allProjects
        : platformId === DIRECT
          ? allProjects.filter((p) => !p.platformId)
          : allProjects.filter((p) => p.platformId === platformId),
    [allProjects, platformId]
  )

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    const byPlatform = !platformId
      ? clients
      : platformId === DIRECT
        ? clients.filter((c) => !c.platformId)
        : clients.filter((c) => c.platformId === platformId)
    if (!q) return byPlatform
    return byPlatform.filter((c) =>
      `${c.name} ${c.company} ${c.email} ${c.country}`.toLowerCase().includes(q)
    )
  }, [clients, search, platformId])

  return (
    <Page>
      <PageHeader
        title="Клиенты и проекты"
        subtitle="Контакты, доступы, оплаты — фикс, абонемент или почасово."
        actions={
          <>
            <Button variant="soft" onClick={() => setClientOpen(true)}>
              <UserRound /> Клиент
            </Button>
            <Button variant="lime" onClick={() => setProjectOpen(true)}>
              <Plus /> Проект
            </Button>
          </>
        }
      >
        <Overview />
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips<Tab>
            options={[
              { value: 'clients', label: 'Клиенты', count: clients.length },
              {
                value: 'projects',
                label: 'Проекты',
                count: tab === 'projects' ? projects.length : undefined
              }
            ]}
            value={tab}
            onChange={(v) =>
              setParams(v === 'projects' ? { tab: 'projects' } : {}, { replace: true })
            }
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={tab === 'clients' ? 'Найти клиента' : 'Найти проект'}
            className="w-64"
          />
          {platforms.length > 0 && (
            <FilterChips<string>
              allLabel="Все платформы"
              options={[
                ...platforms.map((p) => ({ value: p.id, label: p.name })),
                { value: DIRECT, label: 'Напрямую' }
              ]}
              value={platformId}
              onChange={setPlatformId}
            />
          )}
          {tab === 'projects' && (
            <FilterChips<ProjectStatus>
              allLabel="Все статусы"
              options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))}
              value={status}
              onChange={setStatus}
            />
          )}
        </div>
      </PageHeader>
      <PageBody>
        {tab === 'clients' ? (
          filteredClients.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {filteredClients.map((c) => (
                <ClientCard key={c.id} client={c} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={UserRound}
              title={search ? 'Никого не нашли' : 'Клиентов пока нет'}
              hint="Добавьте клиента — к нему привяжутся проекты, доступы и оплаты."
              action={
                !search && (
                  <Button variant="lime" onClick={() => setClientOpen(true)}>
                    <Plus /> Добавить клиента
                  </Button>
                )
              }
            />
          )
        ) : projects.length ? (
          <ItemGroup className="gap-2">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </ItemGroup>
        ) : (
          <EmptyState
            icon={Briefcase}
            title={search || status ? 'Проектов не найдено' : 'Проектов пока нет'}
            hint="Проект хранит оплаты, доступы, ссылки на стенды и учёт времени."
            action={
              <Button variant="lime" onClick={() => setProjectOpen(true)}>
                <Plus /> Создать проект
              </Button>
            }
          />
        )}
      </PageBody>
      <ClientDialog open={clientOpen} onOpenChange={setClientOpen} />
      <ProjectDialog open={projectOpen} onOpenChange={setProjectOpen} />
    </Page>
  )
}
