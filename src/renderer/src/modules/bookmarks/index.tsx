import { useMemo, useState } from 'react'
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
  type Bookmark,
  type BookmarkKind,
  type BookmarkPatch,
  type BookmarkStatus
} from '@shared/domain/bookmarks'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { api } from '@/lib/api'
import { fmtDate, hostOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAutosave } from '@/hooks/use-autosave'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
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
  InputField,
  PillSelect,
  countBy,
  useEscapeToClose
} from '../claude/editor-kit'

const STATUS_LABEL: Record<BookmarkStatus, string> = {
  queue: 'Прочитать',
  in_progress: 'Читаю',
  done: 'Прочитал',
  dropped: 'Бросил'
}

const KIND_LABEL: Record<BookmarkKind, string> = {
  article: 'Статья',
  video: 'Видео',
  course: 'Курс',
  docs: 'Доки',
  repo: 'Репо',
  other: 'Другое'
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
        aria-label="Прогресс"
        className="flex-1 [&_[data-slot=slider-range]]:bg-lime [&_[data-slot=slider-thumb]]:border-lime-foreground/40"
      />
      <span className="w-10 text-right text-[13px] tabular-nums">{draft}%</span>
    </div>
  )
}

function Rating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      aria-label="Оценка"
      value={value ? String(value) : ''}
      onValueChange={(v) => onChange(v ? Number(v) : 0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <ToggleGroupItem
          key={n}
          value={String(n)}
          aria-label={`${n} из 5`}
          title={`${n} из 5`}
          className="size-8 min-w-8 px-0 data-[state=on]:bg-transparent"
        >
          <Star className={cn(n <= value ? 'fill-lime text-foreground' : 'text-muted-foreground')} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function BookmarkDetail({ item, onClose }: { item: Bookmark; onClose: () => void }) {
  const update = useApiMutation('bookmarks', 'update')
  const remove = useApiMutation('bookmarks', 'remove', { successMessage: 'Перемещено в корзину' })
  const save = (patch: BookmarkPatch): void => update.mutate({ id: item.id, patch })
  const entity = { type: 'bookmark' as const, id: item.id }
  useEscapeToClose(onClose)

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
          <Button variant="lime" size="sm" onClick={() => api.app.openExternal(item.url)}>
            <ExternalLink /> Открыть
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
            <p className="text-[12px] text-muted-foreground">Закончил {fmtDate(item.finishedAt)}</p>
          )}
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle value={item.title} onSave={(title) => save({ title })} />
        <InputField label="Ссылка" value={item.url} onSave={(url) => save({ url })} placeholder="https://…" />
        <Block label="Статус">
          <PillSelect
            options={BOOKMARK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            value={item.status}
            onChange={(status) => save({ status })}
          />
        </Block>
        <div className="grid grid-cols-2 gap-6">
          <Block label="Прогресс">
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
          <Block label="Оценка">
            <Rating value={item.rating} onChange={(rating) => save({ rating })} />
          </Block>
        </div>
        <AutoMarkdown
          label="Заметки"
          value={item.notes}
          onSave={(notes) => save({ notes })}
          placeholder="Главные мысли, цитаты, что применить"
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
        subtitle="Статьи, видео и курсы: что прочитать, что читаю, что уже прочитал."
        actions={
          <Button
            variant="lime"
            onClick={async () => {
              const created = await create.mutateAsync({
                title: 'Новая закладка',
                kind: kind ?? 'article',
                status: status ?? 'queue'
              })
              setOpen(created.id)
            }}
          >
            <Plus /> Закладка
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Все"
            value={status}
            onChange={setStatus}
            options={BOOKMARK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], count: statusCounts[s] ?? 0 }))}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Название, сайт, заметки" className="w-60" />
          </div>
        </div>
        {usedKinds.length > 1 && (
          <FilterChips
            allLabel="Любой тип"
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
              getKey={(x) => x.id}
              estimateSize={88}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={!list.isLoading && (<EmptyState
                  icon={BookmarkIcon}
                  title={search || tagId || status || kind ? 'Ничего не нашлось' : 'Закладок пока нет'}
                  hint={
                    search || tagId || status || kind
                      ? 'Снимите фильтры или поищите по сайту.'
                      : 'Сохраните статью или курс на потом — ссылку можно добавить и через быстрое добавление.'
                  }
                />)}
              renderItem={(b) => {
                const active = b.id === openId
                const Icon = KIND_ICON[b.kind]
                return (
                  <ListItem active={active} onClick={() => setOpen(b.id)}>
                    <div className="flex items-center gap-3">
                      <ItemMedia
                        variant="icon"
                        className={cn('size-9', active ? 'bg-ink-foreground/10 text-ink-accent' : 'bg-card')}
                      >
                        <Icon />
                      </ItemMedia>
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            'truncate text-[13.5px] font-medium',
                            b.status === 'done' && !active && 'text-muted-foreground'
                          )}
                        >
                          {b.title}
                        </div>
                        <div className={cn('mt-0.5 flex items-center gap-2 text-[12px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                          <span className="truncate">{b.url ? hostOf(b.url) : KIND_LABEL[b.kind]}</span>
                          <span>·</span>
                          <span className="shrink-0">{STATUS_LABEL[b.status]}</span>
                          {b.rating > 0 && (
                            <span className="flex shrink-0 items-center gap-0.5">
                              <Star className="size-3 fill-current" />
                              {b.rating}
                            </span>
                          )}
                        </div>
                      </div>
                      {b.status !== 'queue' && b.status !== 'dropped' && (
                        <Progress
                          value={b.progress}
                          aria-label="Прогресс"
                          className={cn(
                            'h-1.5 w-16 shrink-0 [&>[data-slot=progress-indicator]]:bg-lime',
                            active ? 'bg-ink-foreground/15' : 'bg-card'
                          )}
                        />
                      )}
                    </div>
                    {!active && !openId && <TagList tags={b.tags} className="mt-2 pl-12" />}
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
