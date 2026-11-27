import { useState, type ReactElement } from 'react'
import { CodeXml, Plus } from 'lucide-react'
import {
  SNIPPET_LANGUAGES,
  snippetInputSchema,
  type Snippet,
  type SnippetLanguage,
  type SnippetPatch
} from '@shared/domain/snippets'
import { api } from '@/lib/api'
import { useApi, useApiMutation, useInfiniteApi, useInPlaceApi } from '@/lib/query'
import { RecordLoadError } from '@/components/common/record-load-error'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { cn } from '@/lib/utils'
import { fmtRelative, mdPreview, plural } from '@/lib/format'
import { LANGUAGE_LABEL } from '@/lib/code-language'
import { limitsOf } from '@/lib/limits'
import { clickableProps } from '@/lib/clickable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
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
import { TagFilter, TagList } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { CopyButton } from '@/components/common/copy-button'
import { EditHintText } from '@/components/common/detail-mode'
import { toastTrashed } from '@/components/common/trash-toast'
import { noResultsHint, presentChips } from '@/components/common/filter-helpers'
import { CodeBlock } from '@/components/common/code'
import {
  DetailPane,
  EntityAside,
  MasterDetail,
  useOpenParam
} from '@/components/common/master-detail'
import {
  AutoCode,
  AutoTitle,
  Block,
  EditorStack,
  EnumSelect,
  LanguageSuggestion,
  TextareaBlock
} from '../claude/editor-kit'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'
import { bindMenu } from '@/features/record-menu/model'
import { RecordMenuTile } from '@/features/record-menu/record-menu'
import { snippetMenu } from './menu'

/**
 * Language dot colour: chart tokens only — status colours (destructive, warn…) would read as a state
 * (docs/design-system.md → Цвета).
 */
const LANGUAGE_COLOR: Record<SnippetLanguage, string> = {
  typescript: 'var(--chart-2)',
  javascript: 'var(--chart-3)',
  tsx: 'var(--chart-2)',
  graphql: 'var(--chart-1)',
  liquid: 'var(--chart-4)',
  css: 'var(--chart-4)',
  html: 'var(--chart-3)',
  json: 'var(--chart-5)',
  bash: 'var(--muted-foreground)',
  sql: 'var(--chart-4)',
  markdown: 'var(--muted-foreground)',
  text: 'var(--muted-foreground)'
}

const LIMITS = limitsOf(snippetInputSchema)

function SnippetDetail({ item, onClose }: { item: Snippet; onClose: () => void }): ReactElement {
  const update = useApiMutation('snippets', 'update')
  // The toast's «Скасувати» brings a missed click on the trash straight back.
  const remove = useApiMutation('snippets', 'remove', {
    onSuccess: (_r, id) => toastTrashed('Сніпет переміщено в кошик', { type: 'snippet', id })
  })
  const markCopied = useApiMutation('snippets', 'markCopied', { silent: true })
  const save = (patch: SnippetPatch): void => update.mutate({ id: item.id, patch })
  const entity = { type: 'snippet' as const, id: item.id }

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => remove.mutate(item.id)}
      emptyHint={
        <>
          Коду ще немає. <EditHintText action="вставити його" />
        </>
      }
      headerExtra={
        // A fragment, not a wrapper: RecordActions' extra slot wraps the buttons one by one in a narrow pane.
        <>
          {/* soft: the page header already has the screen's lime button (docs/design-system.md → один акцент). */}
          {item.code.trim() && (
            <CopyButton
              text={item.code}
              label="Скопіювати код"
              message="Код скопійовано"
              variant="soft"
              onCopied={() => markCopied.mutate(item.id)}
            />
          )}
          {item.copyCount > 0 && (
            <Badge variant="soft" className="font-normal text-muted-foreground">
              скопійовано {item.copyCount} {plural(item.copyCount, ['раз', 'рази', 'разів'])}
            </Badge>
          )}
        </>
      }
      aside={
        <EntityAside
          entity={entity}
          tags={item.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={item.createdAt}
          updatedAt={item.updatedAt}
          files={false}
        >
          <Block label="Мова">
            <EnumSelect
              size="sm"
              ariaLabel="Мова"
              options={SNIPPET_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))}
              value={item.language}
              onChange={(language) => save({ language })}
            />
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
          label="Опис"
          value={item.description}
          onSave={(description) => save({ description })}
          maxLength={LIMITS.description}
          placeholder="Де застосовується, на що звернути увагу"
        />
        <Block label="Код">
          <AutoCode
            value={item.code}
            onSave={(code) => save({ code })}
            language={item.language}
            minHeight="320px"
            placeholder="Вставте код…"
            maxLength={LIMITS.code}
          />
          <LanguageSuggestion
            code={item.code}
            language={item.language}
            languages={SNIPPET_LANGUAGES}
            onSwitch={(language) => save({ language })}
          />
        </Block>
      </EditorStack>
    </DetailPane>
  )
}

/**
 * Grid card: header (title + language dot), one-line description, a fixed 6-line code preview
 * (wrapped, no scroll), footer with tags, date/copies and «Скопіювати» when there is code to copy.
 * Every card has the same height: the code box, the description line and the footer height are always there.
 */
function SnippetCard({
  item,
  active,
  compact,
  onOpen
}: {
  item: Snippet
  active: boolean
  compact: boolean
  onOpen: () => void
}): ReactElement {
  const markCopied = useApiMutation('snippets', 'markCopied', { silent: true })
  const muted = active ? 'text-ink-muted' : 'text-muted-foreground'
  const hasCode = !!item.code.trim()
  const description = mdPreview(item.description)
  return (
    <RecordMenuTile
      menu={bindMenu(snippetMenu, item, { onOpen })}
      onInk={active}
      buttonClassName="absolute top-[13px] right-3"
    >
      <Card
        {...clickableProps(onOpen)}
        aria-current={active || undefined}
        // `tile` brings hover, cursor and the focus ring. The ink card keeps the global :focus-visible outline, only
        // drawn inside: `outline-none` would set the outline style to none for the focus-visible state too.
        className={cn(
          'h-full min-w-0 gap-3 py-4',
          active ? 'bg-ink text-ink-foreground focus-visible:-outline-offset-2' : 'tile'
        )}
      >
        {/* pr-10: room for the «⋯» in the corner (it sits beside the card, not inside its button). */}
        <CardHeader className="gap-1 pr-10 pl-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate text-body font-semibold">{item.title}</span>
              <FavoriteMark entity={{ type: 'snippet', id: item.id }} onInk={active} />
            </span>
            <span className={cn('flex shrink-0 items-center gap-1.5 text-meta', muted)}>
              <span
                className="size-2 rounded-full"
                style={{ background: LANGUAGE_COLOR[item.language] }}
              />
              {LANGUAGE_LABEL[item.language]}
            </span>
          </div>
          {/* Compact (a record is open): the description, which tells snippets apart, only when there is one. */}
          {compact ? (
            description && <div className={cn('truncate text-caption', muted)}>{description}</div>
          ) : (
            <div className={cn('min-h-5 truncate text-caption', muted)}>{description || ' '}</div>
          )}
        </CardHeader>
        {!compact && (
          <CardContent className="min-w-0 px-4">
            {hasCode ? (
              <div className="h-36 overflow-hidden rounded-xl">
                <CodeBlock
                  preview
                  code={item.code}
                  language={item.language}
                  maxLines={6}
                  className="h-full rounded-xl text-meta"
                />
              </div>
            ) : (
              // No frame: a dashed box read as an input. The height stays, so the cards of a row line up.
              <div
                className={cn('grid h-36 place-items-center px-4 text-center text-caption', muted)}
              >
                Коду ще немає
              </div>
            )}
          </CardContent>
        )}
        <CardFooter className={cn('min-h-7 min-w-0 gap-3 px-4', !compact && 'mt-auto')}>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            {!compact && <TagList tags={item.tags} max={2} className="flex-nowrap" />}
            <span className={cn('shrink-0 truncate text-meta', muted)}>
              {item.copyCount > 0
                ? `скопійовано ${item.copyCount} ${plural(item.copyCount, ['раз', 'рази', 'разів'])}`
                : fmtRelative(item.updatedAt)}
            </span>
          </div>
          {/* No code — no button: a disabled «Скопіювати» in every empty card did nothing and said nothing. */}
          {hasCode && (
            <CopyButton
              text={item.code}
              label="Скопіювати"
              message="Код скопійовано"
              variant="subtle"
              size="xs"
              onCopied={() => markCopied.mutate(item.id)}
              className={cn(
                'shrink-0',
                active && 'bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15'
              )}
            />
          )}
        </CardFooter>
      </Card>
    </RecordMenuTile>
  )
}

export function SnippetsPage(): ReactElement {
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState<SnippetLanguage | undefined>()
  const [tagId, setTagId] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId, favorite: favorite || undefined }
  // Chip counters come from the server under the same search and tag; the rendered grid is paged + virtualized.
  const { data: counts = {} } = useApi('snippets', 'counts', base)
  const list = useInfiniteApi('snippets', 'list', { ...base, language })
  const openRecord = useInPlaceApi('snippets', 'get', openId ?? '', { enabled: !!openId })
  const openItem = openRecord.data
  const create = useApiMutation('snippets', 'create')

  const languageChips = presentChips(SNIPPET_LANGUAGES, counts, (l) => LANGUAGE_LABEL[l], language)
  // By the debounced query the list was fetched with (see the empty state below).
  const filtered = !!(q || tagId || language || favorite)
  // What «Скопіювати як JSON» would copy: a selected empty language has nothing, so no button (not «[]»).
  const exportCount = language
    ? (counts[language] ?? 0)
    : Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), 0)
  const resetFilters = (): void => {
    setSearch('')
    setTagId(undefined)
    setFavorite(false)
    setLanguage(undefined)
  }

  const createNew = async (): Promise<void> => {
    if (create.isPending) return
    try {
      const created = await create.mutateAsync({
        title: 'Новий сніпет',
        language: language ?? 'typescript'
      })
      setOpen(created.id)
    } catch {
      // useApiMutation has already shown the error toast; there is nothing to open.
    }
  }

  return (
    <Page>
      <PageHeader
        title="Сніпети"
        subtitle="GraphQL-запити Hydrogen, хуки, конфіги — знайти й скопіювати за пару секунд."
        actions={
          <>
            {exportCount > 0 && (
              <CopyJsonButton
                what="Сніпети"
                // The whole filtered list, fetched on click — not just the loaded pages of the grid.
                getData={async () =>
                  (await api.snippets.list({ ...base, language })).map((s) => ({
                    title: s.title,
                    language: s.language,
                    description: s.description,
                    code: s.code
                  }))
                }
              />
            )}
            <ImportButton kind="snippet" onImported={(id) => id && setOpen(id)} />
            <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
              <Plus /> Сніпет
            </Button>
          </>
        }
      >
        <FilterBar
          emptyBase={!search && !filtered && list.showEmpty && !list.items.length}
          chips={
            languageChips.length > 0 && (
              <FilterChips
                allLabel="Усі мови"
                value={language}
                onChange={setLanguage}
                options={languageChips}
              />
            )
          }
          trailing={
            <>
              <FavoriteFilter type="snippet" value={favorite} onChange={setFavorite} />
              <TagFilter value={tagId} onChange={setTagId} />
              <SearchInput value={search} onChange={setSearch} placeholder="Назва, опис або код" />
            </>
          }
        />
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualGrid
              className="-mx-1 px-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(s) => s.id}
              minColumnWidth={380}
              stackBesideDetail
              // Estimates only (rows are measured): compact card with a description line, full card.
              rowHeight={openId ? 112 : 290}
              gap={8}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              renderItem={(s) => (
                <SnippetCard
                  item={s}
                  active={s.id === openId}
                  compact={!!openId}
                  onOpen={() => setOpen(s.id)}
                />
              )}
              empty={
                // Not over a placeholder page (keepPreviousData): no flash of the empty-base state after a reset.
                !list.isLoading &&
                !list.isPlaceholderData &&
                (filtered ? (
                  <NoResults
                    icon={CodeXml}
                    hint={noResultsHint(q, !!(tagId || language || favorite))}
                    onReset={resetFilters}
                  />
                ) : (
                  <EmptyState
                    illustration="scissor"
                    title="Сніпетів поки немає"
                    hint="Збережіть шматок коду, який пишете вже не вперше."
                    cta={{ label: 'Створити сніпет', icon: Plus, onClick: () => void createNew() }}
                  />
                ))
              }
            />
          }
          detail={
            openRecord.failed ? (
              <RecordLoadError pane onRetry={openRecord.retry} onClose={() => setOpen(null)} />
            ) : openId && openItem ? (
              <SnippetDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
