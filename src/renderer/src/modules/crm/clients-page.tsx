import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowUpRight, Briefcase, Plus, UserRound } from 'lucide-react'
import { PROJECT_STATUSES, type ClientSummary, type ProjectStatus, type ProjectSummary } from '@shared/domain/crm'
import { useApi } from '@/lib/query'
import { fmtDay, fmtHours, fmtMinutes, fmtMoney, plural } from '@/lib/format'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagList } from '@/components/common/tags'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BILLING_LABEL, CLIENT_STATUS_LABEL, PROJECT_STATUS_BADGE, PROJECT_STATUS_LABEL } from './labels'
import { Meter, StatTile, moneyMap } from './parts'
import { ClientDialog, ProjectDialog } from './dialogs'

type Tab = 'clients' | 'projects'

function Overview() {
  const { data } = useApi('projects', 'overview')
  if (!data) return <div className="grid h-[118px] grid-cols-4 gap-3" />
  return (
    <div className="grid grid-cols-4 gap-3">
      <StatTile tone="ink" label="Часы за месяц" value={fmtHours(data.monthMinutes)} hint={`${fmtMinutes(data.weekMinutes)} на этой неделе`} />
      <StatTile label="Оплачено в этом месяце" value={<span className="text-[24px]">{moneyMap(data.paidThisMonth)}</span>} />
      <StatTile
        label="Ожидается к оплате"
        value={<span className="text-[24px]">{moneyMap(data.outstanding)}</span>}
        hint={data.overduePayments ? `${data.overduePayments} ${plural(data.overduePayments, ['просрочена', 'просрочены', 'просрочено'])}` : 'Просрочек нет'}
      />
      <StatTile
        label="Проекты в работе"
        value={data.activeProjects}
        tone={data.overduePayments ? 'surface' : 'surface'}
        hint={plural(data.activeProjects, ['активный проект', 'активных проекта', 'активных проектов'])}
      />
    </div>
  )
}

function ClientCard({ client }: { client: ClientSummary }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(`/clients/${client.id}`)}
      className="group flex min-h-[168px] flex-col justify-between rounded-3xl bg-surface p-5 text-left transition-colors hover:bg-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-card text-[14px] font-semibold">
          {client.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="grid size-8 place-items-center rounded-full bg-card opacity-0 transition-opacity group-hover:opacity-100">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
      <div>
        <div className="truncate text-[16px] font-medium">{client.name}</div>
        <div className="truncate text-[12.5px] text-muted-foreground">
          {client.company || CLIENT_STATUS_LABEL[client.status]}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span>
            {client.activeProjectCount}/{client.projectCount} {plural(client.projectCount, ['проект', 'проекта', 'проектов'])}
          </span>
          <span>{fmtHours(client.trackedMinutes)}</span>
          <span className="text-foreground">{fmtMoney(client.paidTotal, client.currency)}</span>
          {client.outstandingTotal > 0 && (
            <span className="text-warn">ждём {fmtMoney(client.outstandingTotal, client.currency)}</span>
          )}
        </div>
      </div>
    </button>
  )
}

export function ProjectRow({ project, showClient = true }: { project: ProjectSummary; showClient?: boolean }) {
  const navigate = useNavigate()
  const overdue = project.dueAt && project.dueAt < Date.now() && project.status === 'active'
  return (
    <button
      type="button"
      onClick={() => navigate(`/projects/${project.id}`)}
      className="grid w-full grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_100px] items-center gap-5 rounded-2xl bg-surface px-5 py-3.5 text-left transition-colors hover:bg-accent"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium">{project.title}</span>
          <Badge variant={PROJECT_STATUS_BADGE[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</Badge>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {showClient && (project.clientName ?? 'Без клиента')}
          {showClient && ' · '}
          {BILLING_LABEL[project.billing]}
        </div>
        <TagList tags={project.tags} max={3} className="mt-1.5" />
      </div>
      <div className="min-w-0">
        <div className="flex justify-between text-[12px]">
          <span>{fmtHours(project.trackedMinutes)}</span>
          {project.budgetHours > 0 && <span className="text-muted-foreground">из {project.budgetHours} ч</span>}
        </div>
        {project.budgetHours > 0 && <Meter value={project.trackedMinutes / 60} max={project.budgetHours} className="mt-1.5" />}
      </div>
      <div className="min-w-0 text-[12px] leading-relaxed">
        <div>
          <span className="text-muted-foreground">Заработано </span>
          {fmtMoney(project.earnedAmount, project.currency)}
        </div>
        <div>
          <span className="text-muted-foreground">Оплачено </span>
          {fmtMoney(project.paidAmount, project.currency)}
          {project.outstandingAmount > 0 && (
            <span className="text-warn"> · долг {fmtMoney(project.outstandingAmount, project.currency)}</span>
          )}
        </div>
      </div>
      <div className={cn('text-right text-[12px]', overdue ? 'text-destructive' : 'text-muted-foreground')}>
        {project.dueAt ? `до ${fmtDay(project.dueAt)}` : '—'}
      </div>
    </button>
  )
}

export function ClientsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'clients'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProjectStatus | undefined>()
  const [clientOpen, setClientOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const { data: clients = [] } = useApi('clients', 'list')
  const { data: projects = [] } = useApi('projects', 'list', { status, search: search || undefined })

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(q))
  }, [clients, search])

  return (
    <Page>
      <PageHeader
        title="Клиенты и проекты"
        subtitle="Контакты, доступы, учёт часов и оплат в одном месте."
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
              { value: 'projects', label: 'Проекты', count: tab === 'projects' ? projects.length : undefined }
            ]}
            value={tab}
            onChange={(v) => setParams(v === 'projects' ? { tab: 'projects' } : {}, { replace: true })}
          />
          <SearchInput value={search} onChange={setSearch} placeholder={tab === 'clients' ? 'Найти клиента' : 'Найти проект'} className="w-64" />
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
              hint="Добавьте клиента — к нему привяжутся проекты, доступы, часы и оплаты."
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
          <div className="flex flex-col gap-2">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Briefcase}
            title={search || status ? 'Проектов не найдено' : 'Проектов пока нет'}
            hint="Проект хранит часы, оплаты, доступы и ссылки на стенды."
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
