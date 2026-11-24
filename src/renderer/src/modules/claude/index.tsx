import { useMemo, useState } from 'react'
import { openUrl } from '@/lib/open-url'
import { Check, Copy, ExternalLink, Plus, Sparkles, ThumbsUp } from 'lucide-react'
import { CLAUDE_KINDS, claudeInputSchema, type ClaudeItem, type ClaudeKind, type ClaudePatch } from '@shared/domain/claude'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtRelative, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { copyText } from '@/components/common/copy-button'
import { DetailPane, EntityAside, ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import {
  AutoMarkdown,
  AutoTitle,
  Block,
  EditorStack,
  PillSelect,
  TextareaBlock,
  UrlBlock,
  countBy
} from './editor-kit'

const LIMITS = limitsOf(claudeInputSchema)

const KIND_LABEL: Record<ClaudeKind, string> = {
  note: 'Нотатки',
  branch: 'Гілки',
  skill: 'Скіли',
  plugin: 'Плагіни',
  guide: 'Гайди',
  prompt: 'Промти'
}

const KIND_SINGLE: Record<ClaudeKind, string> = {
  note: 'Нотатка',
  branch: 'Гілка',
  skill: 'Скіл',
  plugin: 'Плагін',
  guide: 'Гайд',
  prompt: 'Промт'
}

/** What each kind is for — shown under the type picker so the choice is obvious. */
const KIND_HINT: Record<ClaudeKind, string> = {
  note: 'Думка чи спостереження про роботу з Claude.',
  branch: 'Гілка роботи: завдання, git-гілка чи сесія Claude — де зупинилися й що далі.',
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

function useCopyPrompt() {
  const markCopied = useApiMutation('claude', 'markCopied', { silent: true })
  return async (item: Pick<ClaudeItem, 'id' | 'content' | 'title'>): Promise<void> => {
    await copyText(item.content || item.title, 'Промт скопійовано')
    markCopied.mutate(item.id)
  }
}

function ClaudeDetail({ item, onClose }: { item: ClaudeItem; onClose: () => void }) {
  const update = useApiMutation('claude', 'update')
  const remove = useApiMutation('claude', 'remove', { successMessage: 'Переміщено в кошик' })
  const copyPrompt = useCopyPrompt()
  const [copied, setCopied] = useState(false)
  const save = (patch: ClaudePatch): void => update.mutate({ id: item.id, patch })
  const entity = { type: 'claude' as const, id: item.id }
  const isPrompt = item.kind === 'prompt'

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(item.id)
        onClose()
      }}
      headerExtra={
        isPrompt && (
          <div className="flex items-center gap-2">
            <Button
              variant="lime"
              size="sm"
              onClick={async () => {
                await copyPrompt(item)
                setCopied(true)
                setTimeout(() => setCopied(false), 1400)
              }}
            >
              {copied ? <Check /> : <Copy />} Скопіювати промт
            </Button>
            <Toggle
              size="sm"
              variant="outline"
              pressed={item.works}
              onPressedChange={(works) => save({ works })}
              className="font-normal"
            >
              <ThumbsUp className={cn(item.works && 'text-ink-accent')} />
              {item.works ? 'Працює' : 'Позначити «працює»'}
            </Toggle>
            {item.copyCount > 0 && (
              <Badge variant="soft" className="font-normal text-muted-foreground">
                скопійовано {item.copyCount} {plural(item.copyCount, ['раз', 'рази', 'разів'])}
              </Badge>
            )}
          </div>
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
              options={CLAUDE_KINDS.map((k) => ({ value: k, label: KIND_SINGLE[k] }))}
              value={item.kind}
              onChange={(kind) => save({ kind })}
            />
            <p className="mt-2 text-caption text-muted-foreground">{KIND_HINT[item.kind]}</p>
          </Block>
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle value={item.title} onSave={(title) => save({ title })} maxLength={LIMITS.title} />
        <TextareaBlock
          label="Коротко"
          value={item.summary}
          onSave={(summary) => save({ summary })}
          maxLength={LIMITS.summary}
          placeholder="Про що це й коли знадобиться"
        />
        <UrlBlock
          label="Посилання"
          value={item.url}
          onSave={(url) => save({ url })}
          maxLength={LIMITS.url}
          trailing={(draft) =>
            /^https?:\/\//i.test(draft) && (
              <Button variant="soft" size="icon" aria-label="Відкрити посилання" onClick={() => openUrl(draft)}>
                <ExternalLink />
              </Button>
            )
          }
        />
        <AutoMarkdown
          label={isPrompt ? 'Текст промту' : 'Вміст'}
          value={item.content}
          onSave={(content) => save({ content })}
          placeholder={isPrompt ? 'Вставте промт, який спрацював…' : 'Пишіть у Markdown: заголовки, списки, ```код```'}
          minHeight="280px"
          maxLength={LIMITS.content}
        />
      </EditorStack>
    </DetailPane>
  )
}

export function ClaudePage() {
  const [kind, setKind] = useState<ClaudeKind | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId }
  // Full list only feeds the chip counters; the rendered list is paged + virtualized.
  const { data: all = [] } = useApi('claude', 'list', base)
  const list = useInfiniteApi('claude', 'list', { ...base, kind })
  const create = useApiMutation('claude', 'create')
  const copyPrompt = useCopyPrompt()

  const counts = useMemo(() => countBy(all, (i) => i.kind), [all])
  const { data: openItem } = useApi('claude', 'get', openId ?? '', { enabled: !!openId })

  const newKind: ClaudeKind = kind ?? 'note'

  return (
    <Page>
      <PageHeader
        title="Claude"
        subtitle="Нотатки, гілки, скіли, плагіни, гайди та промти, що спрацювали."
        actions={
          <Button
            variant="lime"
            onClick={async () => {
              const created = await create.mutateAsync({ kind: newKind, title: NEW_TITLE[newKind] })
              setOpen(created.id)
            }}
          >
            <Plus /> {KIND_SINGLE[newKind]}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Усе"
            value={kind}
            onChange={setKind}
            options={CLAUDE_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k], count: counts[k] ?? 0 }))}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Шукати в Claude" className="w-64" />
          </div>
        </div>
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="-mx-1 px-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(i) => i.id}
              estimateSize={92}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading && (
                  <EmptyState
                    icon={Sparkles}
                    title={search || tagId || kind ? 'Нічого не знайшлося' : 'Тут поки порожньо'}
                    hint={
                      search || tagId || kind
                        ? 'Спробуйте інше слово або зніміть фільтр.'
                        : 'Зберігайте промти, що спрацювали, і нотатки про роботу з Claude.'
                    }
                  />
                )
              }
              renderItem={(i) => {
                const active = i.id === openId
                const isPrompt = i.kind === 'prompt'
                return (
                  <div className="relative">
                    <ListItem active={active} onClick={() => setOpen(i.id)} className={cn(isPrompt && 'pr-14')}>
                      <div className={cn('mb-0.5 text-meta', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        {KIND_SINGLE[i.kind]}
                        {isPrompt && i.works && <span className={cn('ml-1.5', active ? 'text-ink-accent' : 'text-success')}>● працює</span>}
                      </div>
                      <div className="truncate text-body font-medium">{i.title}</div>
                      {i.summary && (
                        <div className={cn('mt-0.5 line-clamp-2 text-caption', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                          {i.summary}
                        </div>
                      )}
                      {!active && <TagList tags={i.tags} className="mt-2" />}
                      {!openId && <div className="mt-1.5 text-meta text-muted-foreground">{fmtRelative(i.updatedAt)}</div>}
                    </ListItem>
                    {isPrompt && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant={active ? 'lime' : 'soft'}
                            className={cn('absolute top-3 right-3', !active && 'bg-card hover:bg-lime hover:text-lime-foreground')}
                            aria-label="Скопіювати промт"
                            onClick={() => void copyPrompt(i)}
                          >
                            <Copy />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Скопіювати промт</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )
              }}
            />
          }
          detail={openId && openItem ? <ClaudeDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
