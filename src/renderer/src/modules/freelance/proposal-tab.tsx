import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { BellRing, Kanban, List, Plus, Star } from 'lucide-react'
import type { Platform, Proposal } from '@shared/domain/freelance'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { useUi } from '@/stores/ui-store'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { EmptyState, FilterChips, SearchInput, Segmented } from '@/components/common/page'
import { useOpenParam } from '@/components/common/master-detail'
import { ProposalBoard } from './proposal-board'
import { ProposalList } from './proposal-list'
import { ProposalEditorSheet } from './proposal-editor'
import { daysSince } from './proposal-labels'

type View = 'kanban' | 'list'

function NewProposalButton({ platform, onCreated }: { platform: Platform; onCreated: (p: Proposal) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const create = useApiMutation('proposals', 'create', {
    onSuccess: (p) => {
      setOpen(false)
      setTitle('')
      onCreated(p)
    }
  })
  const submit = (): void => {
    if (!title.trim()) return
    create.mutate({ platformId: platform.id, jobTitle: title.trim(), status: 'sent', feePercent: null })
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="lime">
          <Plus /> Отклик
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 rounded-2xl p-3">
        <InputGroup>
          <InputGroupInput
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Название вакансии"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="xs" variant="default" className="rounded-full" disabled={!title.trim() || create.isPending} onClick={submit}>
              Добавить
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <p className="mt-2 px-1 text-[12px] text-muted-foreground">Остальное — ставку, коннекты, клиента — заполните в карточке.</p>
      </PopoverContent>
    </Popover>
  )
}

function StaleBanner({ platformId, onOpen }: { platformId: string; onOpen: (id: string) => void }) {
  const navigate = useNavigate()
  const { data: stale = [] } = useApi('proposals', 'stale', { platformId })
  const [now] = useState(() => Date.now())
  if (!stale.length) return null
  return (
    <Card className="gap-3 bg-warn/10 py-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <BellRing className="size-4 text-warn" /> Пора напомнить
        </CardTitle>
        <CardDescription>
          {stale.length} {plural(stale.length, ['отклик', 'отклика', 'откликов'])} без ответа 3+ дня. Одно короткое напоминание
          часто возвращает клиента.
        </CardDescription>
        <CardAction>
          <Button variant="soft" size="sm" className="bg-card" onClick={() => navigate('/freelance/templates')}>
            Шаблоны напоминаний
          </Button>
        </CardAction>
      </CardHeader>
      <div className="flex flex-wrap gap-1.5 px-5">
        {stale.slice(0, 8).map((p) => (
          <Button key={p.id} variant="soft" size="sm" className="max-w-[280px] bg-card font-normal" onClick={() => onOpen(p.id)}>
            <span className="truncate">{p.jobTitle}</span>
            <span className="text-muted-foreground tabular-nums">{daysSince(p.sentAt, now)} дн.</span>
          </Button>
        ))}
      </div>
    </Card>
  )
}

/** «Отклики» tab: kanban/list of proposals with filters, follow-up banner and the editor sheet. */
export function ProposalsTab({ platform }: { platform: Platform }) {
  const view = (useUi((s) => s.views.proposals) as View | undefined) ?? 'kanban'
  const setView = useUi((s) => s.setView)
  const [search, setSearch] = useState('')
  const [niche, setNiche] = useState<string | undefined>()
  const [starred, setStarred] = useState(false)
  const [openId, setOpenId] = useOpenParam()
  const term = useDebounced(search.trim())
  const base = { platformId: platform.id, search: term || undefined }
  // Kanban needs every card (and the niche chips count them); the list view pages through the server.
  const { data: all = [], isLoading } = useApi('proposals', 'list', base)
  const paged = useInfiniteApi('proposals', 'list', { ...base, niche, starred: starred || undefined })

  const niches = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of all) if (p.niche) counts.set(p.niche, (counts.get(p.niche) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: value, count }))
  }, [all])

  const list = all.filter((p) => (!niche || p.niche === niche) && (!starred || p.starred))

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Вакансия, клиент, текст отклика" className="w-72" />
        <Toggle
          variant="chip"
          size="sm"
          pressed={starred}
          onPressedChange={setStarred}
          aria-label="Только сильные"
        >
          <Star /> Сильные
        </Toggle>
        <div className="flex-1" />
        <Segmented
          value={view}
          onChange={(v) => setView('proposals', v)}
          options={[
            { value: 'kanban', label: <Kanban />, title: 'Канбан' },
            { value: 'list', label: <List />, title: 'Список' }
          ]}
        />
        <NewProposalButton platform={platform} onCreated={(p) => setOpenId(p.id)} />
      </div>
      {niches.length > 0 && <FilterChips options={niches} value={niche} onChange={setNiche} allLabel="Все типы" />}
      <StaleBanner platformId={platform.id} onOpen={setOpenId} />

      <div className="min-h-0 flex-1">
        {!isLoading && all.length === 0 && !search ? (
          <EmptyState
            title="Откликов пока нет"
            hint="Добавляйте каждый отклик — так станет видно, какие задачи и тексты приносят контракты."
            action={<NewProposalButton platform={platform} onCreated={(p) => setOpenId(p.id)} />}
          />
        ) : view === 'kanban' ? (
          <ProposalBoard proposals={list} currency={platform.currency} creditsName={platform.creditsName} onOpen={setOpenId} />
        ) : (
          <ProposalList
            proposals={paged.items}
            currency={platform.currency}
            activeId={openId}
            onOpen={setOpenId}
            loading={paged.isLoading}
            hasMore={paged.hasMore}
            loadingMore={paged.loadingMore}
            onLoadMore={paged.loadMore}
          />
        )}
      </div>

      <ProposalEditorSheet proposalId={openId} platform={platform} onClose={() => setOpenId(null)} />
    </div>
  )
}
