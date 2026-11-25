import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { Brain, Languages } from 'lucide-react'
import {
  WORD_KINDS,
  WORD_STAGES,
  type EnglishStats,
  type WordKind,
  type WordStage
} from '@shared/domain/english'
import { api } from '@/lib/api'
import { useApi, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { fmtDay, plural } from '@/lib/format'
import {
  EmptyState,
  FilterBar,
  FilterChips,
  NoResults,
  Page,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import { MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { ProgressLine } from '@/components/common/progress-line'
import { TagFilter } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { AddWordForm } from './add-word-form'
import { WordDetail } from './word-detail'
import { WordRow } from './word-row'
import { KIND_LABEL, STAGE_COLOR, STAGE_LABEL } from './labels'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'
import { noResultsHint, presentChips } from '@/components/common/filter-helpers'

const ALL_KINDS = '__all'

/**
 * Two facts at most: the size of the dictionary, then when the next word comes up (nothing due now) or the
 * streak. An empty dictionary says nothing here: the empty state below already does.
 */
function subtitleOf(stats: EnglishStats | undefined): string | undefined {
  if (!stats?.total) return undefined
  const size = `${stats.total} ${plural(stats.total, ['слово', 'слова', 'слів'])}`
  const second =
    !stats.due && stats.nextDueAt
      ? `наступне повторення ${fmtDay(stats.nextDueAt)}`
      : stats.streakDays > 0 &&
        `${stats.streakDays} ${plural(stats.streakDays, ['день', 'дні', 'днів'])} поспіль`
  return second ? `${size} · ${second}` : size
}

export function EnglishPage(): ReactElement {
  const navigate = useNavigate()
  const [open, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<WordStage | undefined>()
  const [kind, setKind] = useState<WordKind | undefined>()
  const [tagId, setTagId] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)
  const filtered = !!(search || stage || kind || tagId || favorite)
  const resetFilters = (): void => {
    setSearch('')
    setStage(undefined)
    setKind(undefined)
    setTagId(undefined)
    setFavorite(false)
  }

  const { data: stats, dataUpdatedAt: statsUpdatedAt } = useApi('english', 'stats')
  const q = useDebounced(search.trim())
  const list = useInfiniteApi('english', 'list', {
    search: q || undefined,
    stage,
    kind,
    tagId,
    favorite: favorite || undefined
  })
  const { data: openWord } = useApi('english', 'get', open ?? '', { enabled: !!open })

  // The clock is the time of the last fetch: render stays pure, every row of a list reads «due» against the
  // same moment, and it moves on after each add, review and refresh (a word added a second ago is due today).
  const now = Math.max(list.dataUpdatedAt, statsUpdatedAt)

  const due = stats?.due ?? 0
  const hasWords = !!stats?.total

  return (
    <Page>
      <PageHeader
        title="Англійська"
        subtitle={subtitleOf(stats)}
        actions={
          <>
            {hasWords && (
              <CopyJsonButton
                what="Слова"
                disabled={!stats?.total}
                // Every word under the current filters, not just the pages loaded into the list.
                getData={async () =>
                  (await api.english.list({ search: q || undefined, stage, kind, tagId })).map(
                    (w) => ({
                      term: w.term,
                      translation: w.translation,
                      kind: w.kind,
                      transcription: w.transcription,
                      example: w.example,
                      exampleTranslation: w.exampleTranslation,
                      context: w.context,
                      notes: w.notes
                    })
                  )
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
        {/* A fresh dictionary (all «Нові») has nothing learned yet: no empty bar. The split by stage is in the chips. */}
        {stats && hasWords && stats.byStage.new < stats.total && (
          <ProgressLine
            value={stats.byStage.mastered}
            total={stats.total}
            label={`Вивчено ${stats.byStage.mastered} з ${stats.total}`}
          />
        )}
        {/* A new word is always "new" and may not match the active filters: show it instead of hiding it. */}
        <AddWordForm onAdded={resetFilters} />
        {/* No row of filters over an empty dictionary (it stays while the stats load: nothing jumps). */}
        {(!stats || hasWords || filtered) && (
          <FilterBar
            chips={
              <FilterChips
                label="Стадія"
                allLabel="Усі стадії"
                // The dots are the legend of the same dots in the rows.
                options={presentChips(
                  WORD_STAGES,
                  stats?.byStage ?? {},
                  (s) => STAGE_LABEL[s],
                  stage
                ).map((o) => ({
                  ...o,
                  dot: STAGE_COLOR[o.value]
                }))}
                value={stage}
                onChange={setStage}
              />
            }
            trailing={
              <>
                <Select
                  value={kind ?? ALL_KINDS}
                  onValueChange={(v) => setKind(v === ALL_KINDS ? undefined : (v as WordKind))}
                >
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
                <FavoriteFilter type="word" value={favorite} onChange={setFavorite} />
                <TagFilter value={tagId} onChange={setTagId} />
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Слово, переклад, приклад"
                />
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
                  <NoResults
                    icon={Languages}
                    hint={noResultsHint(search, !!(stage || kind || tagId || favorite))}
                    onReset={resetFilters}
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
                return (
                  <WordRow
                    word={w}
                    active={active}
                    now={now}
                    showKind={!kind}
                    onOpen={() => setOpen(active ? null : w.id)}
                  />
                )
              }}
            />
          }
          detail={
            open && openWord ? (
              <WordDetail key={openWord.id} word={openWord} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </div>
    </Page>
  )
}
