import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { BellRing, FileUser, Kanban, List, Plus } from 'lucide-react'
import type { Application } from '@shared/domain/jobs'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { useUi } from '@/stores/ui-store'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EmptyState, Field, FilterChips, Page, PageHeader, SearchInput, Segmented } from '@/components/common/page'
import { useOpenParam } from '@/components/common/master-detail'
import { TagFilter } from '@/components/common/tags'
import { Choice } from '../crm/parts'
import { CompanyCombobox, type CompanyValue } from './j1-fields'
import { agoLabel, daysSince } from './j1-labels'
import { ApplicationBoard } from './application-board'
import { ApplicationList } from './application-list'
import { ApplicationEditorSheet } from './application-editor'

type View = 'kanban' | 'list'

function NewApplicationButton({ onCreated, variant = 'lime' }: { onCreated: (a: Application) => void; variant?: 'lime' | 'soft' }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState<CompanyValue>({ companyId: null, companyName: '' })
  const [boardId, setBoardId] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const { data: boards = [] } = useApi('jobs', 'boards', undefined, { enabled: open })
  const create = useApiMutation('jobs', 'create', {
    onSuccess: (a) => {
      setOpen(false)
      setTitle('')
      setCompany({ companyId: null, companyName: '' })
      setUrl('')
      onCreated(a)
    }
  })
  const submit = (): void => {
    if (!title.trim()) return
    create.mutate({ title: title.trim(), ...company, boardId, url: url.trim() })
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant}>
          <Plus /> Вакансия
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] rounded-2xl p-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field label="Позиция">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Middle Frontend Developer" />
          </Field>
          <Field label="Компания">
            <CompanyCombobox value={company} onChange={setCompany} showLink={false} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Площадка">
              <Choice value={boardId} onChange={setBoardId} none="Не указана" options={boards.map((b) => ({ value: b.id, label: b.name }))} />
            </Field>
            <Field label="Ссылка">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
          </div>
          <Button type="submit" variant="lime" disabled={!title.trim() || create.isPending}>
            Добавить и открыть
          </Button>
          <p className="text-[12px] text-muted-foreground">Статус «Отправлено» и сегодняшняя дата — площадка сразу отметится в дневной норме.</p>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function FollowUpBanner({ onOpen }: { onOpen: (id: string) => void }) {
  const navigate = useNavigate()
  const { data: list = [] } = useApi('jobs', 'followUps')
  const [now] = useState(() => Date.now())
  if (!list.length) return null
  return (
    <Card className="gap-3 bg-warn/10 py-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <BellRing className="size-4 text-warn" /> Напомнить о себе
        </CardTitle>
        <CardDescription>
          {list.length} {plural(list.length, ['вакансия', 'вакансии', 'вакансий'])}: подошёл срок напоминания или нет ответа неделю.
        </CardDescription>
        <CardAction>
          <Button variant="soft" size="sm" className="bg-card" onClick={() => navigate('/freelance/templates?situation=recruiter')}>
            Шаблоны ответов
          </Button>
        </CardAction>
      </CardHeader>
      <div className="flex flex-wrap gap-1.5 px-5">
        {list.slice(0, 8).map((a) => (
          <Button key={a.id} variant="soft" size="sm" className="max-w-[300px] bg-card font-normal" onClick={() => onOpen(a.id)}>
            <span className="truncate">
              {a.title}
              {a.company ? ` — ${a.company}` : ''}
            </span>
            <span className="text-muted-foreground">{agoLabel(daysSince(a.appliedAt, now))}</span>
          </Button>
        ))}
      </div>
    </Card>
  )
}

/** «Вакансии»: kanban/list of job applications with filters, follow-up banner and the editor sheet. */
export function ApplicationsPage() {
  const view = (useUi((s) => s.views.applications) as View | undefined) ?? 'kanban'
  const setView = useUi((s) => s.setView)
  const [search, setSearch] = useState('')
  const [boardId, setBoardId] = useState<string | undefined>()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpenId] = useOpenParam()
  const { data: boards = [] } = useApi('jobs', 'boards', { includeInactive: true })
  const { data: companies = [] } = useApi('jobs', 'companies')
  const { data: resumes = [] } = useApi('jobs', 'resumes')
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, companyId: companyId ?? undefined, resumeId: resumeId ?? undefined, tagId }
  // Kanban needs every card (and the board chips count them); the list view pages through the server.
  const { data: all = [], isLoading } = useApi('jobs', 'list', base)
  const paged = useInfiniteApi('jobs', 'list', { ...base, boardId })

  const boardChips = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of all) if (a.boardId) counts.set(a.boardId, (counts.get(a.boardId) ?? 0) + 1)
    return boards.filter((b) => counts.has(b.id)).map((b) => ({ value: b.id, label: b.name, count: counts.get(b.id) }))
  }, [all, boards])

  const list = boardId ? all.filter((a) => a.boardId === boardId) : all
  const filtered = !!(search || boardId || companyId || resumeId || tagId)

  return (
    <Page>
      <PageHeader
        title="Вакансии"
        subtitle="Перетаскивайте карточки между колонками. Собеседования и тестовые попадают в календарь автоматически."
        actions={
          <>
            <Segmented
              value={view}
              onChange={(v) => setView('applications', v)}
              options={[
                { value: 'kanban', label: <Kanban />, title: 'Канбан' },
                { value: 'list', label: <List />, title: 'Список' }
              ]}
            />
            <NewApplicationButton onCreated={(a) => setOpenId(a.id)} />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Позиция, компания, заметки" className="w-64" />
          {companies.length > 0 && (
            <Choice
              size="sm"
              value={companyId}
              onChange={setCompanyId}
              none="Все компании"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              className="w-44 rounded-full"
            />
          )}
          {resumes.length > 0 && (
            <Choice
              size="sm"
              value={resumeId}
              onChange={setResumeId}
              none="Любое резюме"
              options={resumes.map((r) => ({ value: r.id, label: r.title }))}
              className="w-44 rounded-full"
            />
          )}
          <TagFilter value={tagId} onChange={setTagId} />
        </div>
        {boardChips.length > 0 && <FilterChips options={boardChips} value={boardId} onChange={setBoardId} allLabel="Все площадки" />}
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-8 pb-6">
        <FollowUpBanner onOpen={setOpenId} />
        <div className="min-h-0 flex-1">
          {!isLoading && all.length === 0 && !filtered ? (
            <EmptyState
              icon={FileUser}
              title="Вакансий пока нет"
              hint="Добавляйте каждую вакансию, на которую откликнулись: так видно, какие площадки и версии резюме дают ответы."
              action={<NewApplicationButton onCreated={(a) => setOpenId(a.id)} />}
            />
          ) : view === 'kanban' ? (
            <ApplicationBoard applications={list} boards={boards} onOpen={setOpenId} />
          ) : (
            <ApplicationList
              applications={paged.items}
              boards={boards}
              activeId={openId}
              onOpen={setOpenId}
              loading={paged.isLoading}
              hasMore={paged.hasMore}
              loadingMore={paged.loadingMore}
              onLoadMore={paged.loadMore}
            />
          )}
        </div>
      </div>

      <ApplicationEditorSheet applicationId={openId} onClose={() => setOpenId(null)} />
    </Page>
  )
}
