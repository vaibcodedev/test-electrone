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
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtDate, hostOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAutosave } from '@/hooks/use-autosave'
import { Button } from '@/components/ui/button'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { DetailPane, EntityAside, ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { AutoInput, AutoMarkdown, AutoTitle, Block, PillSelect, countBy, useEscapeToClose } from '../claude/editor-kit'

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
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer accent-[var(--lime)]"
        aria-label="Прогресс"
      />
      <span className="w-10 text-right text-[13px] tabular-nums">{draft}%</span>
    </div>
  )
}

function Rating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Оценка">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          title={`${n} из 5`}
          onClick={() => onChange(value === n ? 0 : n)}
          className="grid size-8 place-items-center rounded-full hover:bg-surface"
        >
          <Star className={cn('size-4', n <= value ? 'fill-[var(--lime)] text-foreground' : 'text-muted-foreground')} />
        </button>
      ))}
    </div>
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
          <section className="flex flex-col gap-2">
            <h3 className="text-[12px] text-muted-foreground">Тип</h3>
            <PillSelect
              size="xs"
              options={BOOKMARK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              value={item.kind}
              onChange={(kind) => save({ kind })}
            />
          </section>
          {item.finishedAt && (
            <p className="text-[12px] text-muted-foreground">Закончил {fmtDate(item.finishedAt)}</p>
          )}
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        <AutoTitle value={item.title} onSave={(title) => save({ title })} />
        <Block label="Ссылка">
          <AutoInput value={item.url} onSave={(url) => save({ url })} placeholder="https://…" />
        </Block>
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
        <Block label="Заметки">
          <AutoMarkdown
            value={item.notes}
            onSave={(notes) => save({ notes })}
            placeholder="Главные мысли, цитаты, что применить"
          />
        </Block>
      </div>
    </DetailPane>
  )
}

export function BookmarksPage() {
  const [status, setStatus] = useState<BookmarkStatus | undefined>()
  const [kind, setKind] = useState<BookmarkKind | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const { data: all = [], isLoading } = useApi('bookmarks', 'list', { search: search || undefined, tagId })
  const { data: openItem } = useApi('bookmarks', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('bookmarks', 'create')

  const byKind = kind ? all.filter((b) => b.kind === kind) : all
  const statusCounts = useMemo(() => countBy(byKind, (b) => b.status), [byKind])
  const kindCounts = useMemo(() => countBy(all, (b) => b.kind), [all])
  const items = status ? byKind.filter((b) => b.status === status) : byKind
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
            <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1">
              {!isLoading && items.length === 0 && (
                <EmptyState
                  icon={BookmarkIcon}
                  title={search || tagId || status || kind ? 'Ничего не нашлось' : 'Закладок пока нет'}
                  hint={
                    search || tagId || status || kind
                      ? 'Снимите фильтры или поищите по сайту.'
                      : 'Сохраните статью или курс на потом — ссылку можно добавить и через быстрое добавление.'
                  }
                />
              )}
              {items.map((b) => {
                const active = b.id === openId
                const Icon = KIND_ICON[b.kind]
                return (
                  <ListItem key={b.id} active={active} onClick={() => setOpen(b.id)}>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-full',
                          active ? 'bg-white/10 text-lime' : 'bg-card'
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
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
                        <span className={cn('h-1.5 w-16 shrink-0 overflow-hidden rounded-full', active ? 'bg-white/15' : 'bg-card')}>
                          <span className="block h-full rounded-full bg-lime" style={{ width: `${b.progress}%` }} />
                        </span>
                      )}
                    </div>
                    {!active && !openId && <TagList tags={b.tags} className="mt-2 pl-12" />}
                  </ListItem>
                )
              })}
            </div>
          }
          detail={openId && openItem ? <BookmarkDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
