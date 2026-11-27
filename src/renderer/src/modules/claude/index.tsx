import { useState, type ReactElement } from 'react'
import { ChevronDown, Plus, Sparkles, ThumbsUp } from 'lucide-react'
import {
  CLAUDE_KIND_LABEL,
  CLAUDE_KINDS,
  claudeInputSchema,
  type ClaudeItem,
  type ClaudeKind,
  type ClaudePatch
} from '@shared/domain/claude'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation, useInfiniteApi, useInPlaceApi } from '@/lib/query'
import { RecordLoadError } from '@/components/common/record-load-error'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtRelative, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Toggle } from '@/components/ui/toggle'
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  EmptyState,
  FilterBar,
  FilterChips,
  NoResults,
  Page,
  PageBody,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import { LinkInput } from '@/components/common/text-field'
import { TagFilter, TagList } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { CopyButton } from '@/components/common/copy-button'
import { EditHintText } from '@/components/common/detail-mode'
import { toastTrashed } from '@/components/common/trash-toast'
import { noResultsHint, presentChips } from '@/components/common/filter-helpers'
import {
  DetailPane,
  EntityAside,
  ListItem,
  MasterDetail,
  useOpenParam
} from '@/components/common/master-detail'
import {
  AutoMarkdown,
  AutoTitle,
  Block,
  EditorStack,
  EnumSelect,
  TextareaBlock
} from './editor-kit'
import { bindMenu } from '@/features/record-menu/model'
import { claudeMenu, TRASHED } from './menu'

const LIMITS = limitsOf(claudeInputSchema)

const KIND_LABEL: Record<ClaudeKind, string> = {
  note: 'Нотатки',
  branch: 'Гілки',
  skill: 'Скіли',
  plugin: 'Плагіни',
  guide: 'Гайди',
  prompt: 'Промти'
}

/** What each kind is for — shown under the type picker so the choice is obvious. */
const KIND_HINT: Record<ClaudeKind, string> = {
  note: 'Думка чи спостереження про роботу з ШІ.',
  branch: 'Гілка роботи: завдання, git-гілка чи сесія з ШІ — де зупинилися й що далі.',
  skill: 'Скіл Claude Code: що вміє, коли викликати, як встановити.',
  plugin: 'Плагін або MCP-сервер: навіщо потрібен і як підключити.',
  guide: 'Покрокова інструкція, яку варто повторити.',
  prompt: 'Промт, який можна скопіювати однією кнопкою; позначте, якщо він працює.'
}

const NEW_TITLE: Record<ClaudeKind, string> = {
  note: 'Нова нотатка',
  branch: 'Нова гілка',
  skill: 'Новий скіл',
  plugin: 'Новий плагін',
  guide: 'Новий гайд',
  prompt: 'Новий промт'
}

function ClaudeDetail({ item, onClose }: { item: ClaudeItem; onClose: () => void }): ReactElement {
  const update = useApiMutation('claude', 'update')
  // The toast's «Скасувати» brings a missed click on the trash straight back.
  const remove = useApiMutation('claude', 'remove', {
    onSuccess: (_r, id) =>
      toastTrashed(`${TRASHED[item.kind]} переміщено в кошик`, { type: 'claude', id })
  })
  const markCopied = useApiMutation('claude', 'markCopied', { silent: true })
  const save = (patch: ClaudePatch): void => update.mutate({ id: item.id, patch })
  const entity = { type: 'claude' as const, id: item.id }
  const isPrompt = item.kind === 'prompt'
  // A prompt without text has nothing to copy: its title in the clipboard would pass for the prompt.
  const hasText = !!item.content.trim()

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => remove.mutate(item.id)}
      emptyHint={
        isPrompt ? (
          <>
            Тексту промту ще немає. <EditHintText action="вставити його" />
          </>
        ) : undefined
      }
      headerExtra={
        // A fragment, not a wrapper: RecordActions' extra slot wraps the buttons one by one in a narrow pane.
        isPrompt && (
          <>
            {/* soft: the page header already has the screen's lime button (docs/design-system.md → один акцент). */}
            {hasText && (
              <CopyButton
                text={item.content}
                label="Скопіювати промт"
                message="Промт скопійовано"
                variant="soft"
                onCopied={() => markCopied.mutate(item.id)}
              />
            )}
            {/* Pressed = a success tint, not the outline variant's ink inversion (docs/design-system.md → Бейджи). */}
            <Toggle
              size="sm"
              variant="status"
              pressed={item.works}
              onPressedChange={(works) => save({ works })}
            >
              <ThumbsUp />
              {item.works ? 'Працює' : 'Позначити «працює»'}
            </Toggle>
            {item.copyCount > 0 && (
              <Badge variant="soft" className="font-normal text-muted-foreground">
                скопійовано {item.copyCount} {plural(item.copyCount, ['раз', 'рази', 'разів'])}
              </Badge>
            )}
          </>
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
            <EnumSelect
              size="sm"
              ariaLabel="Тип"
              options={CLAUDE_KINDS.map((k) => ({ value: k, label: CLAUDE_KIND_LABEL[k] }))}
              value={item.kind}
              onChange={(kind) => save({ kind })}
            />
            {/* Helps to choose the type; while reading it only repeats the obvious. */}
            <p data-edit-only className="text-caption text-muted-foreground">
              {KIND_HINT[item.kind]}
            </p>
          </Block>
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle
          value={item.title}
          onSave={(title) => save({ title })}
          maxLength={LIMITS.title}
        />
        <TextareaBlock
          label="Коротко"
          value={item.summary}
          onSave={(summary) => save({ summary })}
          maxLength={LIMITS.summary}
          placeholder="Про що це й коли знадобиться"
        />
        <LinkInput
          label="Посилання"
          value={item.url}
          onSave={(url) => save({ url })}
          maxLength={LIMITS.url}
        />
        <AutoMarkdown
          label={isPrompt ? 'Текст промту' : 'Вміст'}
          value={item.content}
          onSave={(content) => save({ content })}
          placeholder={
            isPrompt
              ? 'Вставте промт, який спрацював…'
              : 'Пишіть у Markdown: заголовки, списки, блоки коду'
          }
          minHeight="280px"
          maxLength={LIMITS.content}
          // The prompt is the record itself: it is never folded.
          fold={false}
        />
      </EditorStack>
    </DetailPane>
  )
}

export function ClaudePage(): ReactElement {
  const [kind, setKind] = useState<ClaudeKind | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId, favorite: favorite || undefined }
  // Chip counters come from the server under the same search and tag; the rendered list is paged + virtualized.
  const { data: counts = {} } = useApi('claude', 'counts', base)
  const list = useInfiniteApi('claude', 'list', { ...base, kind })
  const create = useApiMutation('claude', 'create')
  const markCopied = useApiMutation('claude', 'markCopied', { silent: true })

  const openRecord = useInPlaceApi('claude', 'get', openId ?? '', { enabled: !!openId })
  const openItem = openRecord.data
  const kindChips = presentChips(CLAUDE_KINDS, counts, (k) => KIND_LABEL[k], kind)
  // By the debounced query the list was fetched with (see the empty state below).
  const filtered = !!(q || tagId || kind || favorite)
  const resetFilters = (): void => {
    setSearch('')
    setTagId(undefined)
    setFavorite(false)
    setKind(undefined)
  }

  const createKind = async (k: ClaudeKind): Promise<void> => {
    if (create.isPending) return
    try {
      const created = await create.mutateAsync({ kind: k, title: NEW_TITLE[k] })
      setOpen(created.id)
    } catch {
      // useApiMutation has already shown the error toast; there is nothing to open.
    }
  }
  const createNew = (): Promise<void> => createKind(kind ?? 'note')

  return (
    <Page>
      <PageHeader
        title="ШІ-база"
        subtitle="Нотатки, гілки, скіли, плагіни, гайди та промти, що спрацювали."
        actions={
          // Split button: the main part creates the filtered kind (N presses it: it comes first), the arrow any kind.
          <ButtonGroup>
            <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
              <Plus /> {kind ? CLAUDE_KIND_LABEL[kind] : 'Запис'}
            </Button>
            <ButtonGroupSeparator className="bg-lime-foreground/20" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="lime"
                  size="icon"
                  aria-label="Вибрати тип"
                  disabled={create.isPending}
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              {/* Focus stays with the new record's title: returning it to the chevron would steal it from InlineTitle. */}
              <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                {CLAUDE_KINDS.map((k) => (
                  <DropdownMenuItem key={k} onSelect={() => void createKind(k)}>
                    {CLAUDE_KIND_LABEL[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        }
      >
        <FilterBar
          emptyBase={!search && !filtered && list.showEmpty && !list.items.length}
          chips={
            kindChips.length > 0 && (
              <FilterChips allLabel="Усе" value={kind} onChange={setKind} options={kindChips} />
            )
          }
          trailing={
            <>
              <FavoriteFilter type="claude" value={favorite} onChange={setFavorite} />
              <TagFilter value={tagId} onChange={setTagId} />
              <SearchInput value={search} onChange={setSearch} placeholder="Шукати в ШІ-базі" />
            </>
          }
        />
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="-mx-1 px-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(i) => i.id}
              estimateSize={76}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                // keepPreviousData: right after «Скинути фільтри» the old empty page is still a placeholder —
                // waiting for the real one keeps the empty-base state from flashing.
                !list.isLoading &&
                !list.isPlaceholderData &&
                (filtered ? (
                  <NoResults
                    icon={Sparkles}
                    hint={noResultsHint(q, !!(tagId || kind || favorite))}
                    onReset={resetFilters}
                  />
                ) : (
                  <EmptyState
                    illustration="star"
                    title="У ШІ-базі поки порожньо"
                    hint="Зберігайте промти, що спрацювали, і нотатки про роботу з ШІ."
                    cta={{ label: 'Створити запис', icon: Plus, onClick: () => void createNew() }}
                  />
                ))
              }
              renderItem={(i) => {
                const active = i.id === openId
                const copyable = i.kind === 'prompt' && !!i.content.trim()
                const muted = active ? 'text-ink-muted' : 'text-muted-foreground'
                return (
                  <div className="relative">
                    {/* Room for the copy button only beside the title and summary: the meta line keeps the full
                        width, so the time lines up with the rows without a button. */}
                    <ListItem
                      active={active}
                      onClick={() => setOpen(i.id)}
                      menu={bindMenu(claudeMenu, i, { onOpen: () => setOpen(i.id) })}
                    >
                      <div className={cn('flex min-w-0 items-center gap-1.5', copyable && 'pr-9')}>
                        <span className="truncate text-body font-medium">{i.title}</span>
                        <FavoriteMark entity={{ type: 'claude', id: i.id }} onInk={active} />
                      </div>
                      {i.summary && (
                        <div
                          className={cn(
                            'mt-1 line-clamp-2 text-caption',
                            muted,
                            copyable && 'pr-9'
                          )}
                        >
                          {i.summary}
                        </div>
                      )}
                      {/* One meta line like notes and fixes: type (unless filtered by it) · status · tags … time. */}
                      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                        {!kind && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'h-5 shrink-0 font-normal',
                              active && 'border-ink-foreground/20 text-ink-foreground'
                            )}
                          >
                            {CLAUDE_KIND_LABEL[i.kind]}
                          </Badge>
                        )}
                        {i.kind === 'prompt' && i.works && (
                          <Badge
                            variant={active ? 'soft' : 'success'}
                            className={cn(
                              'h-5 shrink-0',
                              active && 'bg-ink-foreground/12 text-ink-foreground'
                            )}
                          >
                            <ThumbsUp /> Працює
                          </Badge>
                        )}
                        <div className="flex min-w-0 flex-1 overflow-hidden">
                          <TagList tags={i.tags} max={2} className="flex-nowrap" />
                        </div>
                        <span className={cn('ml-auto shrink-0 text-meta whitespace-nowrap', muted)}>
                          {fmtRelative(i.updatedAt)}
                        </span>
                      </div>
                    </ListItem>
                    {copyable && (
                      <CopyButton
                        text={i.content}
                        variant="subtle"
                        size="xs"
                        message="Промт скопійовано"
                        onCopied={() => markCopied.mutate(i.id)}
                        className={cn(
                          // Left of the row's «⋯».
                          'absolute top-2.5 right-10',
                          active &&
                            'bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15'
                        )}
                      />
                    )}
                  </div>
                )
              }}
            />
          }
          detail={
            openRecord.failed ? (
              <RecordLoadError pane onRetry={openRecord.retry} onClose={() => setOpen(null)} />
            ) : openId && openItem ? (
              <ClaudeDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
