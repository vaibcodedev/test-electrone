import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Brain, Flame, Languages, X } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { WORD_KINDS, WORD_STAGES, type WordKind, type WordStage } from '@shared/domain/english'
import { useApi, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { fmtDay, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState, FilterChips, Page, PageHeader, SearchInput } from '@/components/common/page'
import { ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { TagFilter } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { AddWordForm } from './add-word-form'
import { WordDetail } from './word-detail'
import { KIND_LABEL, STAGE_LABEL } from './labels'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'

const STAGE_COLOR: Record<WordStage, string> = {
  new: 'bg-muted-foreground/50',
  learning: 'bg-warn',
  review: 'bg-info',
  mastered: 'bg-chart-1'
}

/** Full static class strings (Tailwind can't see interpolated class names). */
const STAGE_INDICATOR: Record<WordStage, string> = {
  new: '[&>[data-slot=progress-indicator]]:bg-muted-foreground/50',
  learning: '[&>[data-slot=progress-indicator]]:bg-warn',
  review: '[&>[data-slot=progress-indicator]]:bg-info',
  mastered: '[&>[data-slot=progress-indicator]]:bg-chart-1'
}

/** Stage distribution: one shadcn Progress segment per stage (width ∝ count) + Badge legend. */
function StageBar({ byStage, total }: { byStage: Record<WordStage, number>; total: number }) {
  return (
    <div className="flex min-w-[280px] flex-col gap-2">
      <div className="flex gap-1">
        {total ? (
          WORD_STAGES.map((s) =>
            byStage[s] ? (
              <Progress
                key={s}
                value={100}
                title={STAGE_LABEL[s]}
                className={cn('h-2 bg-transparent', STAGE_INDICATOR[s])}
                style={{ flexGrow: byStage[s] }}
              />
            ) : null
          )
        ) : (
          <Progress value={0} className="h-2 flex-1 bg-surface" />
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {WORD_STAGES.map((s) => (
          <Badge key={s} variant="soft" className="font-normal text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', STAGE_COLOR[s])} />
            {STAGE_LABEL[s]} <span className="text-foreground tabular-nums">{byStage[s]}</span>
          </Badge>
        ))}
      </div>
    </div>
  )
}

export function EnglishPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<WordStage | undefined>()
  const [kind, setKind] = useState<WordKind | undefined>()
  const [tagId, setTagId] = useState<string | undefined>()
  const filtered = !!(search || stage || kind || tagId)
  const resetFilters = (): void => {
    setSearch('')
    setStage(undefined)
    setKind(undefined)
    setTagId(undefined)
  }

  const { data: stats } = useApi('english', 'stats')
  const { data: all = [] } = useApi('english', 'list')
  const q = useDebounced(search.trim())
  const list = useInfiniteApi('english', 'list', { search: q || undefined, stage, kind, tagId })
  const { data: openWord } = useApi('english', 'get', open ?? '', { enabled: !!open })

  const nextDue = useMemo(() => {
    const future = all.map((w) => w.dueAt).filter((d) => d > Date.now())
    return future.length ? Math.min(...future) : null
  }, [all])

  const due = stats?.due ?? 0

  return (
    <Page>
      <PageHeader
        title="Англійська"
        subtitle={
          stats
            ? `${stats.total} ${plural(stats.total, ['слово', 'слова', 'слів'])} · сьогодні повторено ${stats.reviewedToday}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-3">
            <CopyJsonButton
              what="Слова"
              disabled={!list.items.length}
              getData={() =>
                list.items.map((w) => ({
                  term: w.term,
                  translation: w.translation,
                  kind: w.kind,
                  transcription: w.transcription,
                  example: w.example,
                  exampleTranslation: w.exampleTranslation,
                  context: w.context,
                  notes: w.notes
                }))
              }
            />
            <ImportButton kind="word" onImported={(id) => id && setOpen(id)} />
            {stats && stats.streakDays > 0 && (
              <Badge variant="soft" className="h-8 px-3 text-caption font-normal">
                <Flame className="size-4! text-warn" />
                {stats.streakDays} {plural(stats.streakDays, ['день', 'дні', 'днів'])} поспіль
              </Badge>
            )}
            <div className="flex flex-col items-end">
              {/* Never a dead end: with nothing due the trainer offers practice beyond the norm. */}
              <Button
                variant={due ? 'lime' : 'subtle'}
                size="lg"
                disabled={!stats?.total}
                onClick={() => navigate('/english/review')}
              >
                <Brain /> {due ? `Повторити ${due}` : 'Тренуватися наперед'}
              </Button>
              {!due && nextDue && (
                <span className="mt-1 text-meta text-muted-foreground">Наступний повтор {fmtDay(nextDue)}</span>
              )}
            </div>
          </div>
        }
      >
        {/* Hidden for an empty dictionary: an empty bar and four zeros say nothing the chips below don't. */}
        {stats && stats.total > 0 && <StageBar byStage={stats.byStage} total={stats.total} />}
        {/* A new word is always "new" and may not match the active filters: show it instead of hiding it. */}
        <AddWordForm onAdded={resetFilters} />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Слово, переклад, приклад" className="w-64" />
          <FilterChips
            allLabel="Усі стадії"
            options={WORD_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s], count: stats?.byStage[s] }))}
            value={stage}
            onChange={setStage}
          />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <FilterChips
            options={WORD_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            value={kind}
            onChange={(k) => setKind(k === kind ? undefined : k)}
          />
          <TagFilter value={tagId} onChange={setTagId} />
          {filtered && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={resetFilters}>
              <X /> Скинути
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1 px-8 pb-6">
        <MasterDetail
          listSize="36%"
          list={
            <VirtualGrid
              className="pr-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(w) => w.id}
              minColumnWidth={open ? 10_000 : 260}
              rowHeight={96}
              gap={6}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading && (
                  <EmptyState
                    icon={Languages}
                    title={all.length ? 'Нічого не підійшло під фільтр' : 'Словник порожній'}
                    hint={
                      all.length
                        ? 'Слова є, але фільтри їх приховують.'
                        : 'Додайте слово з робочого листування у формі вище — воно одразу потрапить у повторення.'
                    }
                    action={
                      all.length && filtered ? (
                        <Button variant="subtle" onClick={resetFilters}>
                          <X /> Скинути фільтри
                        </Button>
                      ) : undefined
                    }
                  />
                )
              }
              renderItem={(w) => {
                const active = w.id === open
                return (
                  <ListItem active={active} onClick={() => setOpen(active ? null : w.id)}>
                    {/* Term + kind on top, translation, the work sentence it came from, then stage and due. */}
                    <div className="flex items-baseline gap-2">
                      <span className="font-display min-w-0 truncate text-[19px] leading-tight">{w.term}</span>
                      {w.transcription && (
                        <span className={cn('truncate text-caption', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                          {w.transcription}
                        </span>
                      )}
                      <span className={cn('ml-auto shrink-0 text-meta', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        {KIND_LABEL[w.kind]}
                      </span>
                    </div>
                    <div className={cn('mt-0.5 truncate text-body', active ? 'text-ink-foreground/85' : 'text-foreground/85')}>
                      {w.translation || 'без перекладу'}
                    </div>
                    {w.example && (
                      <div className={cn('mt-1.5 truncate text-caption italic', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        «{w.example}»
                      </div>
                    )}
                    <div className={cn('mt-2.5 flex items-center gap-3 text-meta', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                      <span className="flex items-center gap-1.5">
                        <span className={cn('size-2 rounded-full', STAGE_COLOR[w.stage])} />
                        {STAGE_LABEL[w.stage]}
                      </span>
                      {w.dueAt <= Date.now() ? (
                        <Badge variant={active ? 'ink' : 'warn'} className={cn(active && 'bg-ink-foreground/12 text-ink-foreground')}>
                          <Brain /> час повторити
                        </Badge>
                      ) : (
                        <span>повтор {fmtDay(w.dueAt)}</span>
                      )}
                    </div>
                  </ListItem>
                )
              }}
            />
          }
          detail={open && openWord ? <WordDetail key={openWord.id} word={openWord} onClose={() => setOpen(null)} /> : null}
        />
      </div>
    </Page>
  )
}
