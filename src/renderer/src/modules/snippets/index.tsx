import { useMemo, useState } from 'react'
import { CodeXml, Plus } from 'lucide-react'
import { SNIPPET_LANGUAGES, type Snippet, type SnippetLanguage, type SnippetPatch } from '@shared/domain/snippets'
import { useApi, useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { CopyButton } from '@/components/common/copy-button'
import { CodeBlock } from '@/components/common/code'
import { DetailPane, EntityAside, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import {
  AutoCode,
  AutoTextarea,
  AutoTitle,
  Block,
  EditorStack,
  EnumSelect,
  countBy,
  useEscapeToClose
} from '../claude/editor-kit'

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

function SnippetDetail({ item, onClose }: { item: Snippet; onClose: () => void }) {
  const update = useApiMutation('snippets', 'update')
  const remove = useApiMutation('snippets', 'remove', { successMessage: 'Перемещено в корзину' })
  const markCopied = useApiMutation('snippets', 'markCopied', { silent: true })
  const save = (patch: SnippetPatch): void => update.mutate({ id: item.id, patch })
  const entity = { type: 'snippet' as const, id: item.id }
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
        <div className="flex items-center gap-2">
          <CopyButton text={item.code} label="Скопировать код" variant="lime" onCopied={() => markCopied.mutate(item.id)} />
          {item.copyCount > 0 && (
            <Badge variant="soft" className="font-normal text-muted-foreground">
              скопирован {item.copyCount} раз
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
          <Block label="Язык">
            <EnumSelect
              ariaLabel="Язык"
              options={SNIPPET_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))}
              value={item.language}
              onChange={(language) => save({ language })}
            />
          </Block>
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle value={item.title} onSave={(title) => save({ title })} />
        <Block label="Описание">
          <AutoTextarea
            value={item.description}
            onSave={(description) => save({ description })}
            placeholder="Где применяется, на что обратить внимание"
          />
        </Block>
        <Block label="Код">
          <AutoCode
            value={item.code}
            onSave={(code) => save({ code })}
            language={item.language}
            minHeight="320px"
            placeholder="Вставьте код…"
          />
        </Block>
      </EditorStack>
    </DetailPane>
  )
}

function SnippetCard({ item, active, compact, onOpen }: { item: Snippet; active: boolean; compact: boolean; onOpen: () => void }) {
  const markCopied = useApiMutation('snippets', 'markCopied', { silent: true })
  return (
    <Card
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen()}
      aria-current={active || undefined}
      className={cn(
        'cursor-pointer gap-3 py-4 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        active ? 'bg-ink text-ink-foreground' : 'hover:bg-accent'
      )}
    >
      <CardHeader className="grid-cols-[1fr_auto] items-start gap-3 px-4">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium">{item.title}</div>
          <div className={cn('mt-0.5 truncate text-[12px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
            {LANGUAGE_LABEL[item.language]}
            {item.description ? ` — ${item.description}` : ''}
          </div>
        </div>
        <CopyButton
          text={item.code}
          variant={active ? 'lime' : 'ghost'}
          className={cn(!active && 'bg-card')}
          onCopied={() => markCopied.mutate(item.id)}
        />
      </CardHeader>
      {!compact && (item.code.trim() || item.tags.length > 0) && (
        <CardContent className="flex flex-col gap-3 px-4">
          {item.code.trim() && (
            <CodeBlock code={item.code} language={item.language} maxLines={6} className="rounded-xl text-[11.5px]" />
          )}
          <TagList tags={item.tags} />
        </CardContent>
      )}
    </Card>
  )
}

export function SnippetsPage() {
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState<SnippetLanguage | undefined>()
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const { data: all = [], isLoading } = useApi('snippets', 'list', { search: search || undefined, tagId })
  const { data: openItem } = useApi('snippets', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('snippets', 'create')

  const counts = useMemo(() => countBy(all, (s) => s.language), [all])
  const used = SNIPPET_LANGUAGES.filter((l) => counts[l])
  const items = language ? all.filter((s) => s.language === language) : all

  return (
    <Page>
      <PageHeader
        title="Сниппеты"
        subtitle="GraphQL-запросы Hydrogen, хуки, конфиги — найти и скопировать за пару секунд."
        actions={
          <Button
            variant="lime"
            onClick={async () => {
              const created = await create.mutateAsync({ title: 'Новый сниппет', language: language ?? 'typescript' })
              setOpen(created.id)
            }}
          >
            <Plus /> Сниппет
          </Button>
        }
      >
        <SearchInput
          autoFocus
          value={search}
          onChange={setSearch}
          placeholder="Ищите по названию, описанию и самому коду"
          className="h-11 text-[14px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          {used.length > 0 && (
            <FilterChips
              allLabel="Все языки"
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
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              {!isLoading && items.length === 0 && (
                <EmptyState
                  icon={CodeXml}
                  title={search || tagId || language ? 'Ничего не нашлось' : 'Сниппетов пока нет'}
                  hint={
                    search || tagId || language
                      ? 'Поиск идёт и по коду — попробуйте имя функции или поле запроса.'
                      : 'Сохраните кусок кода, который пишете уже не в первый раз.'
                  }
                />
              )}
              <div className={cn('grid gap-2', openId ? 'grid-cols-1' : 'grid-cols-2 2xl:grid-cols-3')}>
                {items.map((s) => (
                  <SnippetCard key={s.id} item={s} active={s.id === openId} compact={!!openId} onOpen={() => setOpen(s.id)} />
                ))}
              </div>
            </div>
          }
          detail={openId && openItem ? <SnippetDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
