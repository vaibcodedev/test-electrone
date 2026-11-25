import { useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { Brain, Languages, X } from 'lucide-react'
import { WORD_KINDS, WORD_STAGES, type WordKind, type WordStage } from '@shared/domain/english'
import { useApi, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { fmtDay, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState, FilterBar, FilterChips, Page, PageHeader, SearchInput } from '@/components/common/page'
import { MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { TagFilter } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AddWordForm } from './add-word-form'
import { WordDetail } from './word-detail'
import { WordRow } from './word-row'
import { KIND_LABEL, STAGE_LABEL } from './labels'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'
import { presentChips } from '../claude/chips'

/** Full static class strings (Tailwind can't see interpolated class names). */
const STAGE_INDICATOR: Record<WordStage, string> = {
  new: '[&>[data-slot=progress-indicator]]:bg-muted-foreground/50',
  learning: '[&>[data-slot=progress-indicator]]:bg-warn',
  review: '[&>[data-slot=progress-indicator]]:bg-info',
  mastered: '[&>[data-slot=progress-indicator]]:bg-chart-1'
}

const ALL_KINDS = '__all'

/**
 * Stage distribution: one shadcn Progress segment per stage (width ∝ count), the count in a tooltip, and
 * the «Вивчено X з Y» caption every progress bar has. Shown only with two stages or more: a single stage
 * is one grey line that says nothing the chips don't.
 */
function StageBar({ byStage, total }: { byStage: Record<WordStage, number>; total: number }): ReactElement | null {
  if (WORD_STAGES.filter((s) => byStage[s]).length < 2) return null
  return (
    <div className="flex items-center gap-3">
      <div role="group" aria-label="Слова за стадіями" className="flex min-w-[280px] flex-1 gap-1">
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
      <span className="shrink-0 text-meta text-muted-foreground tabular-nums">
        Вивчено {byStage.mastered} з {total}
      </span>
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

  const { data: stats, dataUpdatedAt: statsUpdatedAt } = useApi('english', 'stats')
  const { data: all = [] } = useApi('english', 'list')
  const q = useDebounced(search.trim())
  const list = useInfiniteApi('english', 'list', { search: q || undefined, stage, kind, tagId })
  const { data: openWord } = useApi('english', 'get', open ?? '', { enabled: !!open })

  // The clock is the time of the last fetch: render stays pure, every row of a list reads «due» against the
  // same moment, and it moves on after each add, review and refresh (a word added a second ago is due today).
  const now = Math.max(list.dataUpdatedAt, statsUpdatedAt)
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
                stats.reviewedToday > 0 && `сьогодні повторено ${stats.reviewedToday}`,
                stats.streakDays > 0 && `${stats.streakDays} ${plural(stats.streakDays, ['день', 'дні', 'днів'])} поспіль`,
                !due && nextDue && `наступний повтор ${fmtDay(nextDue)}`
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        actions={
          <>
            {hasWords && (
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
            )}
            <ImportButton kind="word" onImported={(id) => id && setOpen(id)} />
            {/* Soft: the lime one is «Додати» in the form below, the one N presses. Never a dead end: with
                nothing due the trainer offers practice beyond the norm. */}
            {hasWords && (
              <Button variant="soft" onClick={() => navigate('/english/review')}>
                <Brain /> {due ? `Повторити ${due}` : 'Тренуватися наперед'}
              </Button>
            )}
          </>
        }
      >
        {stats && hasWords && <StageBar byStage={stats.byStage} total={stats.total} />}
        {/* A new word is always "new" and may not match the active filters: show it instead of hiding it. */}
        <AddWordForm onAdded={resetFilters} />
        {/* No row of filters over an empty dictionary (it stays while the stats load: nothing jumps). */}
        {(!stats || hasWords || filtered) && (
          <FilterBar
            chips={
              <FilterChips
                allLabel="Усі стадії"
                options={presentChips(WORD_STAGES, stats?.byStage ?? {}, (s) => STAGE_LABEL[s], stage)}
                value={stage}
                onChange={setStage}
              />
            }
            trailing={
              <>
                <Select value={kind ?? ALL_KINDS} onValueChange={(v) => setKind(v === ALL_KINDS ? undefined : (v as WordKind))}>
                  <SelectTrigger size="sm" className="w-36" aria-label="Тип">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_KINDS}>Усі типи</SelectItem>
                    {WORD_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <TagFilter value={tagId} onChange={setTagId} />
                <SearchInput value={search} onChange={setSearch} placeholder="Слово, переклад, приклад" className="w-72" />
              </>
            }
          />
        )}
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
