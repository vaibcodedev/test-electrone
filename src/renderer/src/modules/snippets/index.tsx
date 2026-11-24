import { useMemo, useState } from 'react'
import { CodeXml, Copy, Plus } from 'lucide-react'
import { SNIPPET_LANGUAGES, snippetInputSchema, type Snippet, type SnippetLanguage, type SnippetPatch } from '@shared/domain/snippets'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { cn } from '@/lib/utils'
import { fmtRelative, plural } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { CopyButton, copyText } from '@/components/common/copy-button'
import { CodeBlock } from '@/components/common/code'
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
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'

const LANGUAGE_LABEL: Record<SnippetLanguage, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  tsx: 'TSX',
  graphql: 'GraphQL',
  liquid: 'Liquid',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  bash: 'Shell',
  sql: 'SQL',
  markdown: 'Markdown',
  text: 'Текст'
}

/** Language dot colour (tokens only; docs/design-system.md → Цвета). */
const LANGUAGE_COLOR: Record<SnippetLanguage, string> = {
  typescript: 'var(--info)',
  javascript: 'var(--warn)',
  tsx: 'var(--info)',
  graphql: 'var(--destructive)',
  liquid: 'var(--success)',
  css: 'var(--chart-2)',
  html: 'var(--chart-3)',
  json: 'var(--chart-1)',
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
          <CopyButton text={item.code} label="Скопіювати код" variant="lime" onCopied={() => markCopied.mutate(item.id)} />
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
 * (wrapped, no scroll), footer with tags, date/copies and an always-visible «Копіювати».
 * Every card has the same height: the code box and the description line are always there.
 */
function SnippetCard({ item, active, compact, onOpen }: { item: Snippet; active: boolean; compact: boolean; onOpen: () => void }) {
  const markCopied = useApiMutation('snippets', 'markCopied', { silent: true })
  const muted = active ? 'text-ink-muted' : 'text-muted-foreground'
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen()}
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
          {item.code.trim() ? (
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
      <CardFooter className="mt-auto min-w-0 gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {!compact && <TagList tags={item.tags} max={2} className="flex-nowrap" />}
          <span className={cn('shrink-0 truncate text-meta', muted)}>
            {item.copyCount > 0
              ? `скопійовано ${item.copyCount} ${plural(item.copyCount, ['раз', 'рази', 'разів'])}`
              : fmtRelative(item.updatedAt)}
          </span>
        </div>
        <Button
          variant="subtle"
          size="xs"
          className={cn('shrink-0', active && 'bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15')}
          disabled={!item.code.trim()}
          onClick={async (e) => {
            e.stopPropagation()
            await copyText(item.code, 'Код скопійовано')
            markCopied.mutate(item.id)
          }}
        >
          <Copy /> Копіювати
        </Button>
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
  const used = SNIPPET_LANGUAGES.filter((l) => counts[l])

  return (
    <Page>
      <PageHeader
        title="Сніпети"
        subtitle="GraphQL-запити Hydrogen, хуки, конфіги — знайти й скопіювати за пару секунд."
        actions={
          <>
            <CopyJsonButton
              what="Сніпети"
              disabled={!list.items.length}
              getData={() => list.items.map((s) => ({ title: s.title, language: s.language, description: s.description, code: s.code }))}
            />
            <ImportButton kind="snippet" onImported={(id) => id && setOpen(id)} />
            <Button
              variant="lime"
              onClick={async () => {
                const created = await create.mutateAsync({ title: 'Новий сніпет', language: language ?? 'typescript' })
                setOpen(created.id)
              }}
            >
              <Plus /> Сніпет
            </Button>
          </>
        }
      >
        <SearchInput
          autoFocus
          value={search}
          onChange={setSearch}
          placeholder="Шукайте за назвою, описом і самим кодом"
          className="h-11 text-lead"
        />
        <div className="flex flex-wrap items-center gap-2">
          {used.length > 0 && (
            <FilterChips
              allLabel="Усі мови"
              value={language}
              onChange={setLanguage}
              options={used.map((l) => ({ value: l, label: LANGUAGE_LABEL[l], count: counts[l] }))}
            />
          )}
          <div className="ml-auto">
            <TagFilter value={tagId} onChange={setTagId} />
          </div>
        </div>
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
                !list.isLoading && (
                  <EmptyState
                    icon={CodeXml}
                    title={search || tagId || language ? 'Нічого не знайшлося' : 'Сніпетів поки немає'}
                    hint={
                      search || tagId || language
                        ? 'Пошук іде й по коду — спробуйте ім’я функції чи поле запиту.'
                        : 'Збережіть шматок коду, який пишете вже не вперше.'
                    }
                  />
                )
              }
            />
          }
          detail={openId && openItem ? <SnippetDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
