import { useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { BellRing, FileUser, Kanban, List, Plus } from 'lucide-react'
import { applicationInputSchema, type Application } from '@shared/domain/jobs'
import { isLikelyUrl, limitsOf, URL_ERROR } from '@/lib/limits'
import { normalizeUrl } from '@/lib/open-url'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { useUi } from '@/stores/ui-store'
import { daysSince, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EmptyState, Field, FilterBar, FilterChips, NoResults, Page, PageHeader, SearchInput, Segmented } from '@/components/common/page'
import { useOpenParam } from '@/components/common/master-detail'
import { TagFilter } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { Choice } from '@/components/common/choice'
import { CompanyCombobox, type CompanyValue } from './j1-fields'
import { agoLabel } from './labels'
import { ApplicationBoard } from './application-board'
import { ApplicationList } from './application-list'
import { ApplicationEditorSheet } from './application-editor'
import { ScheduleStageHost } from './schedule-stage'

const LIMITS = limitsOf(applicationInputSchema)

type View = 'kanban' | 'list'

function NewApplicationButton({ onCreated, variant = 'lime' }: { onCreated: (a: Application) => void; variant?: 'lime' | 'soft' }): ReactElement {
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
    if (!title.trim() || create.isPending) return
    create.mutate({ title: title.trim(), ...company, boardId, url: url.trim() ? normalizeUrl(url.trim()) : '' })
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant}>
          <Plus /> Вакансія
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-105 rounded-2xl p-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field label="Посада">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Напр.: Middle Frontend Developer"
              maxLength={LIMITS.title}
            />
          </Field>
          <Field label="Компанія">
            <CompanyCombobox value={company} onChange={setCompany} showLink={false} />
          </Field>
          <Field label="Майданчик">
            <Choice value={boardId} onChange={setBoardId} none="Не вказано" options={boards.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
          <Field label="Посилання" error={isLikelyUrl(url) ? undefined : URL_ERROR}>
            <Input
              type="url"
              inputMode="url"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              maxLength={LIMITS.url}
              aria-invalid={!isLikelyUrl(url) || undefined}
            />
          </Field>
          <Button type="submit" variant="lime" disabled={!title.trim() || !isLikelyUrl(url) || create.isPending}>
            Додати й відкрити
          </Button>
          <p className="text-caption text-muted-foreground">
            {title.trim()
              ? 'Статус «Надіслано» і сьогоднішня дата — майданчик одразу зарахується в денну норму.'
              : 'Вкажіть посаду, щоб додати'}
          </p>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function FollowUpBanner({ onOpen }: { onOpen: (id: string) => void }): ReactElement | null {
  const navigate = useNavigate()
  const { data: list = [] } = useApi('jobs', 'followUps')
  const [now] = useState(() => Date.now())
  if (!list.length) return null
  return (
    // A surface card: the status colour stays in the icon (docs/design-system.md → Цвета), no orange fill.
    <Card className="gap-3 py-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <BellRing className="size-4 text-warn" /> Нагадати про себе
        </CardTitle>
        <CardDescription>
          {list.length} {plural(list.length, ['вакансія', 'вакансії', 'вакансій'])}: настав час нагадування або немає відповіді тиждень.
        </CardDescription>
        <CardAction>
          <Button variant="subtle" size="sm" onClick={() => navigate('/freelance/templates?situation=follow_up')}>
            Шаблони нагадувань
          </Button>
        </CardAction>
      </CardHeader>
      <div className="flex flex-wrap gap-1.5 px-5">
        {list.slice(0, 8).map((a) => (
          <Button key={a.id} variant="subtle" size="sm" className="max-w-75 font-normal" onClick={() => onOpen(a.id)}>
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
export function ApplicationsPage(): ReactElement {
  const view = (useUi((s) => s.views.applications) as View | undefined) ?? 'kanban'
  const setView = useUi((s) => s.setView)
  const [search, setSearch] = useState('')
  const [boardId, setBoardId] = useState<string | undefined>()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [tagId, setTagId] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)
  const [openId, setOpenId] = useOpenParam()
  const { data: boards = [] } = useApi('jobs', 'boards', { includeInactive: true })
  const { data: companies = [] } = useApi('jobs', 'companies')
  const { data: resumes = [] } = useApi('jobs', 'resumes')
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, companyId: companyId ?? undefined, resumeId: resumeId ?? undefined, tagId, boardId, favorite: favorite || undefined }
  // Kanban needs every card of the filter; the list view pages through the server. Both filter on the server.
  const kanban = useApi('jobs', 'list', base, { enabled: view === 'kanban' })
  const paged = useInfiniteApi('jobs', 'list', base)
  // The whole history: the default 90 days made old boards vanish from the filter.
  const { data: stats } = useApi('jobs', 'stats', { from: 0 })

  // Board chips: only boards with applications (sent ones — «Збережено» doesn't count) plus the chosen one.
  const boardChips = useMemo(() => {
    const applied = new Map((stats?.byBoard ?? []).map((r) => [r.key, r.applied]))
    return boards
      .filter((b) => (applied.get(b.id) ?? 0) > 0 || b.id === boardId)
      .map((b) => ({ value: b.id, label: b.name, count: applied.get(b.id) ?? 0 }))
  }, [boards, stats, boardId])

  const list = kanban.data ?? []
  const isLoading = view === 'kanban' ? kanban.isLoading : paged.isLoading
  const total = view === 'kanban' ? list.length : paged.items.length
  const filtered = !!(search || boardId || companyId || resumeId || tagId || favorite)
  // What is really narrowing the list, for the «Нічого не знайдено» hint.
  const conditions = [
    search.trim() && `за запитом «${search.trim()}»`,
    boardId && `на майданчику «${boards.find((b) => b.id === boardId)?.name ?? ''}»`,
    companyId && `у компанії «${companies.find((c) => c.id === companyId)?.name ?? ''}»`,
    resumeId && `із резюме «${resumes.find((r) => r.id === resumeId)?.title ?? ''}»`,
    tagId && 'з вибраною міткою',
    favorite && 'серед обраних'
  ].filter((c): c is string => !!c)
  const resetFilters = (): void => {
    setSearch('')
    setBoardId(undefined)
    setCompanyId(null)
    setResumeId(null)
    setTagId(undefined)
    setFavorite(false)
  }

  return (
    <Page>
      <PageHeader
        title="Вакансії"
        subtitle={
          view === 'kanban'
            ? 'Перетягуйте картки між колонками. Співбесіди й тестові завдання автоматично потрапляють у календар.'
            : 'Усі вакансії з етапами й зарплатою. Співбесіди й тестові автоматично потрапляють у календар.'
        }
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
        <FilterBar
          chips={
            // No «Djinni 0 · DOU 0» row above an empty base.
            boardChips.length > 0 &&
            (total > 0 || filtered) && (
              <FilterChips options={boardChips} value={boardId} onChange={setBoardId} allLabel="Усі майданчики" label="Майданчик" />
            )
          }
          trailing={
            <>
              <FavoriteFilter type="application" value={favorite} onChange={setFavorite} />
              <TagFilter value={tagId} onChange={setTagId} />
              <SearchInput value={search} onChange={setSearch} placeholder="Посада, компанія, нотатки" />
            </>
          }
          secondary={
            (companies.length > 0 || resumes.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {companies.length > 0 && (
                  <Choice
                    size="sm"
                    value={companyId}
                    onChange={setCompanyId}
                    none="Усі компанії"
                    options={companies.map((c) => ({ value: c.id, label: c.name }))}
                    className="w-44"
                  />
                )}
                {resumes.length > 0 && (
                  <Choice
                    size="sm"
                    value={resumeId}
                    onChange={setResumeId}
                    none="Будь-яке резюме"
                    options={resumes.map((r) => ({ value: r.id, label: r.title }))}
                    className="w-44"
                  />
                )}
              </div>
            )
          }
        />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-8 pb-6">
        <FollowUpBanner onOpen={setOpenId} />
        <div className="min-h-0 flex-1">
          {!isLoading && total === 0 && !filtered ? (
            <EmptyState
              icon={FileUser}
              title="Вакансій поки немає"
              hint="Додавайте кожну вакансію, на яку відгукнулися: так видно, які майданчики й версії резюме дають відповіді."
              action={<NewApplicationButton variant="soft" onCreated={(a) => setOpenId(a.id)} />}
            />
          ) : !isLoading && total === 0 ? (
            // Not empty columns «0 / Перетягніть сюди картку»: the vacancies exist, the filters hide them.
            <NoResults icon={FileUser} hint={`Вакансій ${conditions.join(' і ')} немає.`} onReset={resetFilters} />
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
      <ScheduleStageHost />
    </Page>
  )
}
