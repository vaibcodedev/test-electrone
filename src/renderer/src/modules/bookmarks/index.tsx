import { useMemo, useState } from 'react'
import { openUrl } from '@/lib/open-url'
import {
  BookOpen,
  Bookmark as BookmarkIcon,
  ExternalLink,
  FileText,
  GitBranch,
  GraduationCap,
  Plus,
  Star,
  Video,
  type LucideIcon
} from 'lucide-react'
import {
  BOOKMARK_KINDS,
  BOOKMARK_STATUSES,
  bookmarkInputSchema,
  type Bookmark,
  type BookmarkKind,
  type BookmarkPatch,
  type BookmarkStatus
} from '@shared/domain/bookmarks'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtDate, fmtRelative, hostOf, mdPreview } from '@/lib/format'
import { cn } from '@/lib/utils'
import { limitsOf } from '@/lib/limits'
import { useAutosave } from '@/hooks/use-autosave'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ItemMedia } from '@/components/ui/item'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { DetailPane, EntityAside, ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import {
  AutoMarkdown,
  AutoTitle,
  Block,
  EditorStack,
  PillSelect,
  UrlBlock,
  countBy
} from '../claude/editor-kit'
import { ImportButton } from '@/components/common/import-dialog'

const LIMITS = limitsOf(bookmarkInputSchema)

const STATUS_LABEL: Record<BookmarkStatus, string> = {
  // A state, not a call to action: «Прочитати» next to a dot read like a link.
  queue: 'У черзі',
  in_progress: 'Читаю',
  done: 'Прочитано',
  dropped: 'Покинув'
}

/** Status reads at a glance: queue neutral, reading in progress blue, read green, dropped muted. */
const STATUS_BADGE: Record<BookmarkStatus, 'soft' | 'info' | 'success' | 'outline'> = {
  queue: 'soft',
  in_progress: 'info',
  done: 'success',
  dropped: 'outline'
}

const KIND_LABEL: Record<BookmarkKind, string> = {
  article: 'Стаття',
  video: 'Відео',
  course: 'Курс',
  docs: 'Документація',
  repo: 'Репо',
  other: 'Інше'
}

const KIND_ICON: Record<BookmarkKind, LucideIcon> = {
  article: FileText,
  video: Video,
  course: GraduationCap,
  docs: BookOpen,
  repo: GitBranch,
  other: BookmarkIcon
}

const isUrl = (v: string): boolean => /^https?:\/\//i.test(v)

function ProgressSlider({ value, onSave }: { value: number; onSave: (value: number) => void }) {
  const [draft, setDraft] = useAutosave(value, onSave, 400)
  return (
    <div className="flex h-9 items-center gap-3">
      <Slider
        min={0}
        max={100}
        step={5}
        value={[draft]}
        onValueChange={([v]) => setDraft(v)}
        aria-label="Прогрес"
        className="flex-1 [&_[data-slot=slider-range]]:bg-lime [&_[data-slot=slider-thumb]]:border-lime-foreground/40"
      />
      <span className="w-10 text-right text-body tabular-nums">{draft}%</span>
    </div>
  )
}

function Rating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      aria-label="Оцінка"
      value={value ? String(value) : ''}
      onValueChange={(v) => onChange(v ? Number(v) : 0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <ToggleGroupItem
          key={n}
          value={String(n)}
          aria-label={`${n} з 5`}
          title={`${n} з 5`}
          className="size-8 min-w-8 px-0 on:bg-transparent"
        >
          <Star className={cn(n <= value ? 'fill-lime text-foreground' : 'text-muted-foreground')} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function BookmarkDetail({ item, onClose }: { item: Bookmark; onClose: () => void }) {
  const update = useApiMutation('bookmarks', 'update')
  const remove = useApiMutation('bookmarks', 'remove', { successMessage: 'Переміщено в кошик' })
  const save = (patch: BookmarkPatch): void => update.mutate({ id: item.id, patch })
  const entity = { type: 'bookmark' as const, id: item.id }

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(item.id)
        onClose()
      }}
      headerExtra={
        isUrl(item.url) && (
          <Button variant="lime" size="sm" onClick={() => openUrl(item.url)}>
            <ExternalLink /> Відкрити
          </Button>
        )
      }
      aside={
        <EntityAside
          entity={entity}
          tags={item.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={item.createdAt}
          updatedAt={item.updatedAt}
        >
          <Block label="Тип">
            <PillSelect
              size="xs"
              options={BOOKMARK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              value={item.kind}
              onChange={(kind) => save({ kind })}
            />
          </Block>
          {item.finishedAt && (
            <p className="text-caption text-muted-foreground">Завершено {fmtDate(item.finishedAt)}</p>
          )}
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle value={item.title} onSave={(title) => save({ title })} maxLength={LIMITS.title} />
        <UrlBlock label="Посилання" value={item.url} onSave={(url) => save({ url })} maxLength={LIMITS.url} />
        <Block label="Статус">
          <PillSelect
            options={BOOKMARK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            value={item.status}
            onChange={(status) => save({ status })}
          />
        </Block>
        <div className="grid grid-cols-2 gap-6">
          <Block label="Прогрес">
            <ProgressSlider
              value={item.progress}
              onSave={(progress) =>
                save(
                  progress > 0 && item.status === 'queue'
                    ? { progress, status: 'in_progress' }
                    : { progress }
                )
              }
            />
          </Block>
          <Block label="Оцінка">
            <Rating value={item.rating} onChange={(rating) => save({ rating })} />
          </Block>
        </div>
        <AutoMarkdown
          label="Нотатки"
          value={item.notes}
          onSave={(notes) => save({ notes })}
          placeholder="Головні думки, цитати, що застосувати"
        />
      </EditorStack>
    </DetailPane>
  )
}

export function BookmarksPage() {
  const [status, setStatus] = useState<BookmarkStatus | undefined>()
  const [kind, setKind] = useState<BookmarkKind | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId }
  // Full list only feeds the chip counters; the rendered list is paged + virtualized.
  const { data: all = [] } = useApi('bookmarks', 'list', base)
  const list = useInfiniteApi('bookmarks', 'list', { ...base, kind, status })
  const { data: openItem } = useApi('bookmarks', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('bookmarks', 'create')

  const byKind = kind ? all.filter((b) => b.kind === kind) : all
  const statusCounts = useMemo(() => countBy(byKind, (b) => b.status), [byKind])
  const kindCounts = useMemo(() => countBy(all, (b) => b.kind), [all])
  const usedKinds = BOOKMARK_KINDS.filter((k) => kindCounts[k])

  return (
    <Page>
      <PageHeader
        title="Закладки"
        subtitle="Статті, відео й курси: що прочитати, що читаю, що вже прочитано."
        actions={
          <>
            <ImportButton kind="bookmark" onImported={(id) => id && setOpen(id)} />
            <Button
              variant="lime"
              onClick={async () => {
                const created = await create.mutateAsync({
                  title: 'Нова закладка',
                  kind: kind ?? 'article',
                  status: status ?? 'queue'
                })
                setOpen(created.id)
              }}
            >
              <Plus /> Закладка
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Усі"
            value={status}
            onChange={setStatus}
            options={BOOKMARK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], count: statusCounts[s] ?? 0 }))}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Назва, сайт, нотатки" className="w-60" />
          </div>
        </div>
        {usedKinds.length > 1 && (
          <FilterChips
            allLabel="Будь-який тип"
            value={kind}
            onChange={setKind}
            options={usedKinds.map((k) => ({ value: k, label: KIND_LABEL[k], count: kindCounts[k] }))}
          />
        )}
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="-mx-1 px-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(x) => x.id}
              estimateSize={88}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={!list.isLoading && (<EmptyState
                  icon={BookmarkIcon}
                  title={search || tagId || status || kind ? 'Нічого не знайшлося' : 'Закладок поки немає'}
                  hint={
                    search || tagId || status || kind
                      ? 'Зніміть фільтри або пошукайте за сайтом.'
                      : 'Збережіть статтю чи курс на потім — посилання можна додати й через швидке додавання.'
                  }
                />)}
              renderItem={(b) => {
                const active = b.id === openId
                const Icon = KIND_ICON[b.kind]
                const note = mdPreview(b.notes)
                const reading = b.status === 'in_progress' || b.status === 'done'
                return (
                  <ListItem active={active} onClick={() => setOpen(b.id)} className="@container">
                    <div className="flex items-center gap-3.5">
                      <ItemMedia
                        variant="icon"
                        className={cn('size-10 rounded-xl', active ? 'bg-ink-foreground/10 text-ink-foreground' : 'bg-foreground/[0.07]')}
                      >
                        <Icon />
                      </ItemMedia>
                      <div className="min-w-0 flex-1">
                        <div className={cn('truncate text-body font-semibold', b.status === 'done' && !active && 'text-muted-foreground')}>
                          {b.title}
                        </div>
                        <div className={cn('mt-0.5 flex min-w-0 items-center gap-1.5 text-caption', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                          <span className="shrink-0">{b.url ? hostOf(b.url) : KIND_LABEL[b.kind]}</span>
                          {/* Wide list only: the note's first line and when it was saved. */}
                          {note && <span className="hidden min-w-0 truncate @2xl:inline">— {note}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {b.rating > 0 && (
                          <span className={cn('hidden items-center gap-1 text-caption tabular-nums @md:flex', active ? 'text-ink-foreground' : 'text-foreground')}>
                            <Star className="size-3.5 fill-current text-warn" />
                            {b.rating}
                          </span>
                        )}
                        {reading && (
                          <span className="hidden items-center gap-2 @lg:flex">
                            <Progress
                              value={b.progress}
                              aria-label="Прогрес"
                              className={cn(
                                // chart-1 is contrast-checked against surfaces; on an ink row the bar uses ink colours.
                                'h-1.5 w-20',
                                active
                                  ? 'bg-ink-foreground/15 [&>[data-slot=progress-indicator]]:bg-ink-foreground'
                                  : 'bg-card [&>[data-slot=progress-indicator]]:bg-chart-1'
                              )}
                            />
                            <span className={cn('w-9 text-right text-caption tabular-nums', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                              {b.progress}%
                            </span>
                          </span>
                        )}
                        <Badge variant={active ? 'ink' : STATUS_BADGE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                        <span className={cn('hidden w-24 text-right text-meta @3xl:inline', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                          {fmtRelative(b.createdAt)}
                        </span>
                      </div>
                    </div>
                    {!active && b.tags.length > 0 && <TagList tags={b.tags} className="mt-2 pl-[3.375rem]" />}
                  </ListItem>
                )
              }}
            />
          }
          detail={openId && openItem ? <BookmarkDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
