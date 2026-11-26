import { useState, type ReactElement } from 'react'
import {
  BookOpenCheck,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  Languages,
  Upload
} from 'lucide-react'
import {
  WORD_KINDS,
  WORD_STAGES,
  type EnglishStats,
  type EntryKind,
  type WordStage
} from '@shared/domain/english'
import { api } from '@/lib/api'
import { useApi, useInfiniteApi, useInPlaceApi } from '@/lib/query'
import { RecordLoadError } from '@/components/common/record-load-error'
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
import { TagFilter } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { AddWordForm } from './add-word-form'
import { WordDetail } from './word-detail'
import { WordRow } from './word-row'
import { KIND_LABEL, STAGE_COLOR, STAGE_LABEL } from './labels'
import { CopyJsonButton, ImportDialog } from '@/components/common/import-dialog'
import { ImportWordsDialog } from './import-words-dialog'
import { RuleDialog } from './rule-dialog'
import { TodayPanel } from './today-panel'
import { TrainingSettings } from './training-settings'
import { noResultsHint, presentChips } from '@/components/common/filter-helpers'

const ALL_KINDS = '__all'

/**
 * Two facts at most: the size of the dictionary, then when the next word comes up (nothing left today). An empty
 * dictionary says nothing here: the empty state below already does.
 */
function subtitleOf(stats: EnglishStats | undefined): string | undefined {
  if (!stats?.total) return undefined
  const size = `${stats.total} ${plural(stats.total, ['слово', 'слова', 'слів'])}`
  // The streak and today's goal are in the panel below: here only when the next review comes.
  const second = !stats.due && stats.nextDueAt && `наступне повторення ${fmtDay(stats.nextDueAt)}`
  return second ? `${size} · ${second}` : size
}

export function EnglishPage(): ReactElement {
  const [open, setOpen] = useOpenParam()
  const [dialog, setDialog] = useState<'json' | 'file' | 'rule' | null>(null)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<WordStage | undefined>()
  const [kind, setKind] = useState<EntryKind | undefined>()
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
  const openRecord = useInPlaceApi('english', 'get', open ?? '', { enabled: !!open })
  const openWord = openRecord.data

  // The clock is the time of the last fetch: render stays pure, every row of a list reads «due» against the
  // same moment, and it moves on after each add, review and refresh (a word added a second ago is due today).
  const now = Math.max(list.dataUpdatedAt, statsUpdatedAt)

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="soft">
                  <Upload /> Імпорт <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => setDialog('file')}>
                    <FileSpreadsheet /> З CSV або Anki…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog('json')}>
                    <FileJson /> З JSON…
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="soft" onClick={() => setDialog('rule')}>
              <BookOpenCheck /> Правило
            </Button>
            <TrainingSettings />
          </>
        }
      >
        {/* Today's goal, streak, statistics and «Тренуватися»; an empty dictionary has nothing to train yet. */}
        {stats && hasWords && <TodayPanel stats={stats} />}
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
                  onValueChange={(v) => setKind(v === ALL_KINDS ? undefined : (v as EntryKind))}
                >
                  <SelectTrigger size="sm" className="w-36" aria-label="Тип">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={ALL_KINDS}>Усі типи</SelectItem>
                      {WORD_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    {/* Grammar rules apart from the words: their own filter, not «one more kind of word». */}
                    <SelectGroup>
                      <SelectItem value="rule">Граматика</SelectItem>
                    </SelectGroup>
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
            openRecord.failed ? (
              <RecordLoadError pane onRetry={openRecord.retry} onClose={() => setOpen(null)} />
            ) : open && openWord ? (
              <WordDetail key={openWord.id} word={openWord} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </div>
      <ImportDialog
        kind="word"
        open={dialog === 'json'}
        onOpenChange={(o) => setDialog(o ? 'json' : null)}
        onImported={(id) => id && setOpen(id)}
      />
      <ImportWordsDialog
        open={dialog === 'file'}
        onOpenChange={(o) => setDialog(o ? 'file' : null)}
      />
      <RuleDialog
        open={dialog === 'rule'}
        onOpenChange={(o) => setDialog(o ? 'rule' : null)}
        onCreated={(id) => {
          resetFilters()
          setOpen(id)
        }}
      />
    </Page>
  )
}
