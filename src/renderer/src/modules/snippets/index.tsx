import { useMemo, useState } from 'react'
import { CodeXml, Copy, Plus } from 'lucide-react'
import { SNIPPET_LANGUAGES, snippetInputSchema, type Snippet, type SnippetLanguage, type SnippetPatch } from '@shared/domain/snippets'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { cn } from '@/lib/utils'
import { fmtRelative, plural } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { clickableProps } from '@/lib/clickable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { EmptyState, FilterBar, FilterChips, NoResults, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { CopyButton, copyText } from '@/components/common/copy-button'
import { CodeBlock, LANGUAGE_LABEL } from '@/components/common/code'
import { DetailPane, EntityAside, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import {
  AutoCode,
  AutoTitle,
  Block,
  EditorStack,
  EnumSelect,
  LanguageSuggestion,
  TextareaBlock,
  countBy
} from '../claude/editor-kit'
import { noResultsHint, presentChips } from '../claude/chips'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'

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

function SnippetDetail({ item, onClose }: { item: Snippet; onClose: () => void }) {
  const update = useApiMutation('snippets', 'update')
  const remove = useApiMutation('snippets', 'remove', { successMessage: 'Переміщено в кошик' })
  const markCopied = useApiMutation('snippets', 'markCopied', { silent: true })
  const save = (patch: SnippetPatch): void => update.mutate({ id: item.id, patch })
  const entity = { type: 'snippet' as const, id: item.id }

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(item.id)
        onClose()
      }}
      headerExtra={
        <div className="flex items-center gap-2">
          {item.code.trim() && (
            <CopyButton text={item.code} label="Скопіювати код" variant="lime" onCopied={() => markCopied.mutate(item.id)} />
          )}
          {item.copyCount > 0 && (
            <Badge variant="soft" className="font-normal text-muted-foreground">
              скопійовано {item.copyCount} {plural(item.copyCount, ['раз', 'рази', 'разів'])}
            </Badge>
          )}
        </div>
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
        <AutoTitle value={item.title} onSave={(title) => save({ title })} maxLength={LIMITS.title} />
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
function SnippetCard({ item, active, compact, onOpen }: { item: Snippet; active: boolean; compact: boolean; onOpen: () => void }) {
  const markCopied = useApiMutation('snippets', 'markCopied', { silent: true })
  const muted = active ? 'text-ink-muted' : 'text-muted-foreground'
  const hasCode = !!item.code.trim()
  return (
    <Card
      {...clickableProps(onOpen)}
      aria-current={active || undefined}
      className={cn(
        'h-full min-w-0 cursor-pointer gap-3 py-4 transition-colors outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        active ? 'bg-ink text-ink-foreground' : 'tile'
      )}
    >
      <CardHeader className="gap-1 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-body font-semibold">{item.title}</span>
          <span className={cn('flex shrink-0 items-center gap-1.5 text-meta', muted)}>
            <span className="size-2 rounded-full" style={{ background: LANGUAGE_COLOR[item.language] }} />
            {LANGUAGE_LABEL[item.language]}
          </span>
        </div>
        {!compact && <div className={cn('min-h-5 truncate text-caption', muted)}>{item.description || ' '}</div>}
      </CardHeader>
      {!compact && (
        <CardContent className="min-w-0 px-4">
          {hasCode ? (
            <div className="h-36 overflow-hidden rounded-xl">
              <CodeBlock preview code={item.code} language={item.language} maxLines={6} className="h-full rounded-xl text-meta" />
            </div>
          ) : (
            <div
              className={cn(
                'grid h-36 place-items-center rounded-xl border border-dashed px-4 text-center text-caption',
                active ? 'border-ink-foreground/20 text-ink-muted' : 'border-foreground/12 text-muted-foreground'
              )}
            >
              Коду ще немає — відкрийте, щоб вставити
            </div>
          )}
        </CardContent>
      )}
      <CardFooter className="mt-auto min-h-7 min-w-0 gap-3 px-4">
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
          <Button
            variant="subtle"
            size="xs"
            className={cn('shrink-0', active && 'bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15')}
            onClick={async (e) => {
              e.stopPropagation()
              // copyText shows the error toast and logs the failure itself; a failed copy is not counted.
              if (await copyText(item.code, 'Код скопійовано')) markCopied.mutate(item.id)
            }}
          >
            <Copy /> Скопіювати
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export function SnippetsPage() {
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState<SnippetLanguage | undefined>()
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId }
  // Full list only feeds the language chips; the rendered grid is paged + virtualized.
  const { data: all = [] } = useApi('snippets', 'list', base)
  const list = useInfiniteApi('snippets', 'list', { ...base, language })
  const { data: openItem } = useApi('snippets', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('snippets', 'create')

  const counts = useMemo(() => countBy(all, (s) => s.language), [all])
  const languageChips = presentChips(SNIPPET_LANGUAGES, counts, (l) => LANGUAGE_LABEL[l], language)
  const filtered = !!(search.trim() || tagId || language)
  // The same list for the button's state and for what it copies: a selected empty language copied «[]».
  const exportItems = useMemo(() => all.filter((s) => !language || s.language === language), [all, language])
  const resetFilters = (): void => {
    setSearch('')
    setTagId(undefined)
    setLanguage(undefined)
  }

  const createNew = async (): Promise<void> => {
    if (create.isPending) return
    try {
      const created = await create.mutateAsync({ title: 'Новий сніпет', language: language ?? 'typescript' })
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
            <CopyJsonButton
              what="Сніпети"
              disabled={!exportItems.length}
              // The whole filtered list, not just the loaded pages of the grid.
              getData={() =>
                exportItems.map((s) => ({ title: s.title, language: s.language, description: s.description, code: s.code }))
              }
            />
            <ImportButton kind="snippet" onImported={(id) => id && setOpen(id)} />
            <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
              <Plus /> Сніпет
            </Button>
          </>
        }
      >
        <FilterBar
          chips={
            languageChips.length > 0 && (
              <FilterChips allLabel="Усі мови" value={language} onChange={setLanguage} options={languageChips} />
            )
          }
          trailing={
            <>
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
              minColumnWidth={openId ? 10_000 : 380}
              rowHeight={openId ? 92 : 290}
              gap={8}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              renderItem={(s) => (
                <SnippetCard item={s} active={s.id === openId} compact={!!openId} onOpen={() => setOpen(s.id)} />
              )}
              empty={
                !list.isLoading &&
                (filtered ? (
                  <NoResults icon={CodeXml} hint={noResultsHint(search, !!(tagId || language))} onReset={resetFilters} />
                ) : (
                  <EmptyState
                    icon={CodeXml}
                    title="Сніпетів поки немає"
                    hint="Збережіть шматок коду, який пишете вже не вперше."
                    cta={{ label: 'Додати сніпет', icon: Plus, onClick: () => void createNew() }}
                  />
                ))
              }
            />
          }
          detail={openId && openItem ? <SnippetDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
