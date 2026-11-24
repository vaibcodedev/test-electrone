import { useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Plus, Sparkles, ThumbsUp } from 'lucide-react'
import { CLAUDE_KINDS, type ClaudeItem, type ClaudeKind, type ClaudePatch } from '@shared/domain/claude'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { api } from '@/lib/api'
import { fmtRelative } from '@/lib/format'
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
  AutoInput,
  AutoMarkdown,
  AutoTextarea,
  AutoTitle,
  Block,
  EditorStack,
  PillSelect,
  countBy,
  useEscapeToClose
} from './editor-kit'

const KIND_LABEL: Record<ClaudeKind, string> = {
  note: 'Заметки',
  branch: 'Ветки',
  skill: 'Скилы',
  plugin: 'Плагины',
  guide: 'Гайды',
  prompt: 'Промты'
}

const KIND_SINGLE: Record<ClaudeKind, string> = {
  note: 'Заметка',
  branch: 'Ветка',
  skill: 'Скил',
  plugin: 'Плагин',
  guide: 'Гайд',
  prompt: 'Промт'
}

const NEW_TITLE: Record<ClaudeKind, string> = {
  note: 'Новая заметка',
  branch: 'Новая ветка',
  skill: 'Новый скил',
  plugin: 'Новый плагин',
  guide: 'Новый гайд',
  prompt: 'Новый промт'
}

function useCopyPrompt() {
  const markCopied = useApiMutation('claude', 'markCopied', { silent: true })
  return async (item: Pick<ClaudeItem, 'id' | 'content' | 'title'>): Promise<void> => {
    await copyText(item.content || item.title, 'Промт скопирован')
    markCopied.mutate(item.id)
  }
}

function ClaudeDetail({ item, onClose }: { item: ClaudeItem; onClose: () => void }) {
  const update = useApiMutation('claude', 'update')
  const remove = useApiMutation('claude', 'remove', { successMessage: 'Перемещено в корзину' })
  const copyPrompt = useCopyPrompt()
  const [copied, setCopied] = useState(false)
  const save = (patch: ClaudePatch): void => update.mutate({ id: item.id, patch })
  const entity = { type: 'claude' as const, id: item.id }
  const isPrompt = item.kind === 'prompt'
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
              {copied ? <Check /> : <Copy />} Скопировать промт
            </Button>
            <Toggle
              size="sm"
              variant="outline"
              pressed={item.works}
              onPressedChange={(works) => save({ works })}
              className="font-normal"
            >
              <ThumbsUp className={cn(item.works && 'text-ink-accent')} />
              {item.works ? 'Работает' : 'Отметить «работает»'}
            </Toggle>
            {item.copyCount > 0 && (
              <Badge variant="soft" className="font-normal text-muted-foreground">
                скопирован {item.copyCount} раз
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
          </Block>
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle value={item.title} onSave={(title) => save({ title })} />
        <Block label="Коротко">
          <AutoTextarea
            value={item.summary}
            onSave={(summary) => save({ summary })}
            placeholder="О чём это и когда пригодится"
          />
        </Block>
        <Block label="Ссылка">
          <div className="flex gap-2">
            <AutoInput value={item.url} onSave={(url) => save({ url })} placeholder="https://…" />
            {/^https?:\/\//i.test(item.url) && (
              <Button variant="soft" size="icon" aria-label="Открыть ссылку" onClick={() => api.app.openExternal(item.url)}>
                <ExternalLink />
              </Button>
            )}
          </div>
        </Block>
        <AutoMarkdown
          label={isPrompt ? 'Текст промта' : 'Содержимое'}
          value={item.content}
          onSave={(content) => save({ content })}
          placeholder={isPrompt ? 'Вставьте промт, который сработал…' : 'Пишите в Markdown: заголовки, списки, ```код```'}
          minHeight="280px"
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
        subtitle="Заметки, ветки, скилы, плагины, гайды и промты, которые сработали."
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
            allLabel="Всё"
            value={kind}
            onChange={setKind}
            options={CLAUDE_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k], count: counts[k] ?? 0 }))}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Искать в Claude" className="w-64" />
          </div>
        </div>
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="-mx-1 px-1"
              items={list.items}
              getKey={(i) => i.id}
              estimateSize={92}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading && (
                  <EmptyState
                    icon={Sparkles}
                    title={search || tagId || kind ? 'Ничего не нашлось' : 'Здесь пока пусто'}
                    hint={
                      search || tagId || kind
                        ? 'Попробуйте другое слово или снимите фильтр.'
                        : 'Сохраняйте промты, которые сработали, и заметки по работе с Claude.'
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
                      <div className={cn('mb-0.5 text-[11.5px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        {KIND_SINGLE[i.kind]}
                        {i.works && <span className={cn('ml-1.5', active ? 'text-ink-accent' : 'text-success')}>● работает</span>}
                      </div>
                      <div className="truncate text-[13.5px] font-medium">{i.title}</div>
                      {i.summary && (
                        <div className={cn('mt-0.5 line-clamp-2 text-[12.5px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                          {i.summary}
                        </div>
                      )}
                      {!active && <TagList tags={i.tags} className="mt-2" />}
                      {!openId && <div className="mt-1.5 text-[11px] text-muted-foreground">{fmtRelative(i.updatedAt)}</div>}
                    </ListItem>
                    {isPrompt && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant={active ? 'lime' : 'soft'}
                            className={cn('absolute top-3 right-3', !active && 'bg-card hover:bg-lime hover:text-lime-foreground')}
                            aria-label="Скопировать промт"
                            onClick={() => void copyPrompt(i)}
                          >
                            <Copy />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Скопировать промт</TooltipContent>
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
