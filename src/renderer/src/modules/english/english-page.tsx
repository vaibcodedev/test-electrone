import { useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { Brain, Languages, X } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { WORD_KINDS, WORD_STAGES, type WordKind, type WordStage } from '@shared/domain/english'
import { useApi, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { fmtDay, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState, FilterChips, Page, PageHeader, SearchInput } from '@/components/common/page'
import { MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { TagFilter } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AddWordForm } from './add-word-form'
import { WordDetail } from './word-detail'
import { WordRow } from './word-row'
import { KIND_LABEL, STAGE_LABEL } from './labels'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'

/** Full static class strings (Tailwind can't see interpolated class names). */
const STAGE_INDICATOR: Record<WordStage, string> = {
  new: '[&>[data-slot=progress-indicator]]:bg-muted-foreground/50',
  learning: '[&>[data-slot=progress-indicator]]:bg-warn',
  review: '[&>[data-slot=progress-indicator]]:bg-info',
  mastered: '[&>[data-slot=progress-indicator]]:bg-chart-1'
}

/**
 * Stage distribution: one shadcn Progress segment per stage (width ∝ count), the count in a tooltip.
 * No legend: the stage chips below already show the same numbers.
 */
function StageBar({ byStage }: { byStage: Record<WordStage, number> }): ReactElement {
  return (
    <div className="flex min-w-[280px] gap-1" aria-label="Слова за стадіями">
      {WORD_STAGES.map((s) =>
        byStage[s] ? (
          <Tooltip key={s}>
            <TooltipTrigger asChild>
              <Progress
                value={100}
                tabIndex={0}
                aria-label={`${STAGE_LABEL[s]}: ${byStage[s]}`}
                className={cn('h-2 bg-transparent', STAGE_INDICATOR[s])}
                style={{ flexGrow: byStage[s] }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {STAGE_LABEL[s]}: {byStage[s]}
            </TooltipContent>
          </Tooltip>
        ) : null
      )}
    </div>
  )
}

export function EnglishPage(): ReactElement {
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

  // One clock per visit: render stays pure, and «due» doesn't flip between rows of the same list.
  const [now] = useState(() => Date.now())
  const nextDue = useMemo(() => {
    const future = all.map((w) => w.dueAt).filter((d) => d > now)
    return future.length ? Math.min(...future) : null
  }, [all, now])

  const due = stats?.due ?? 0
  const hasWords = !!stats?.total

  return (
    <Page>
      <PageHeader
        title="Англійська"
        subtitle={
          stats
            ? [
                `${stats.total} ${plural(stats.total, ['слово', 'слова', 'слів'])}`,
                `сьогодні повторено ${stats.reviewedToday}`,
                stats.streakDays > 0 && `${stats.streakDays} ${plural(stats.streakDays, ['день', 'дні', 'днів'])} поспіль`
              ]
                .filter(Boolean)
                .join(' · ')
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
            <div className="flex flex-col items-end">
              {/* Never a dead end: with nothing due the trainer offers practice beyond the norm. */}
              <Button variant={due ? 'lime' : 'soft'} size="lg" disabled={!hasWords} onClick={() => navigate('/english/review')}>
                <Brain /> {due ? `Повторити ${due}` : 'Тренуватися наперед'}
              </Button>
              {!due && nextDue && (
                <span className="mt-1 text-meta text-muted-foreground">Наступний повтор {fmtDay(nextDue)}</span>
              )}
            </div>
          </div>
        }
      >
        {/* Hidden for an empty dictionary: an empty bar says nothing the chips below don't. */}
        {stats && hasWords && <StageBar byStage={stats.byStage} />}
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
            tone="neutral"
            options={WORD_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            value={kind}
            onChange={setKind}
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
                !list.isLoading &&
                (hasWords && filtered ? (
                  <EmptyState
                    icon={Languages}
                    title="Нічого не знайдено"
                    hint={[
                      search.trim() && `За запитом «${search.trim()}» нічого немає.`,
                      (stage || kind || tagId) && 'Спробуйте зняти фільтри.'
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    action={
                      <Button variant="soft" onClick={resetFilters}>
                        <X /> Скинути фільтри
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={Languages}
                    title="Словник порожній"
                    hint="Додайте слово з робочого листування у формі вище — воно одразу потрапить у повторення."
                  />
                ))
              }
              renderItem={(w) => {
                const active = w.id === open
                return <WordRow word={w} active={active} now={now} onOpen={() => setOpen(active ? null : w.id)} />
              }}
            />
          }
          detail={open && openWord ? <WordDetail key={openWord.id} word={openWord} onClose={() => setOpen(null)} /> : null}
        />
      </div>
    </Page>
  )
}
