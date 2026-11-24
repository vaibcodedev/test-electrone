import { useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Plus, Sparkles, ThumbsUp } from 'lucide-react'
import { CLAUDE_KINDS, type ClaudeItem, type ClaudeKind, type ClaudePatch } from '@shared/domain/claude'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { copyText } from '@/components/common/copy-button'
import { DetailPane, EntityAside, ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { AutoInput, AutoMarkdown, AutoTextarea, AutoTitle, Block, PillSelect, countBy, useEscapeToClose } from './editor-kit'

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
            <button
              type="button"
              onClick={() => save({ works: !item.works })}
              aria-pressed={item.works}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors',
                item.works ? 'bg-ink text-ink-foreground' : 'bg-surface text-muted-foreground hover:text-foreground'
              )}
            >
              <ThumbsUp className={cn('size-3.5', item.works && 'text-lime')} />
              {item.works ? 'Работает' : 'Отметить «работает»'}
            </button>
            {item.copyCount > 0 && (
              <span className="text-[12px] text-muted-foreground">скопирован {item.copyCount} раз</span>
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
          <section className="flex flex-col gap-2">
            <h3 className="text-[12px] text-muted-foreground">Тип</h3>
            <PillSelect
              size="xs"
              options={CLAUDE_KINDS.map((k) => ({ value: k, label: KIND_SINGLE[k] }))}
              value={item.kind}
              onChange={(kind) => save({ kind })}
            />
          </section>
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        <AutoTitle value={item.title} onSave={(title) => save({ title })} />
        <AutoTextarea
          value={item.summary}
          onSave={(summary) => save({ summary })}
          placeholder="Коротко: о чём это и когда пригодится"
          className="min-h-10"
        />
        <Block label="Ссылка">
          <div className="flex gap-2">
            <AutoInput value={item.url} onSave={(url) => save({ url })} placeholder="https://…" />
            {/^https?:\/\//i.test(item.url) && (
              <Button variant="soft" size="icon" title="Открыть" onClick={() => api.app.openExternal(item.url)}>
                <ExternalLink />
              </Button>
            )}
          </div>
        </Block>
        <Block label={isPrompt ? 'Текст промта' : 'Содержимое'}>
          <AutoMarkdown
            value={item.content}
            onSave={(content) => save({ content })}
            placeholder={isPrompt ? 'Вставьте промт, который сработал…' : 'Пишите в Markdown, код — в ```блоках```'}
            minHeight="320px"
          />
        </Block>
      </div>
    </DetailPane>
  )
}

export function ClaudePage() {
  const [kind, setKind] = useState<ClaudeKind | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const { data: all = [], isLoading } = useApi('claude', 'list', { search: search || undefined, tagId })
  const create = useApiMutation('claude', 'create')
  const copyPrompt = useCopyPrompt()

  const counts = useMemo(() => countBy(all, (i) => i.kind), [all])
  const items = kind ? all.filter((i) => i.kind === kind) : all
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
            <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1">
              {!isLoading && items.length === 0 && (
                <EmptyState
                  icon={Sparkles}
                  title={search || tagId ? 'Ничего не нашлось' : 'Здесь пока пусто'}
                  hint={
                    search || tagId
                      ? 'Попробуйте другое слово или снимите фильтр.'
                      : 'Сохраняйте промты, которые сработали, и заметки по работе с Claude.'
                  }
                />
              )}
              {items.map((i) => {
                const active = i.id === openId
                return (
                  <ListItem key={i.id} active={active} onClick={() => setOpen(i.id)}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className={cn('mb-0.5 text-[11.5px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                          {KIND_SINGLE[i.kind]}
                          {i.works && <span className={cn('ml-1.5', active ? 'text-lime' : 'text-success')}>● работает</span>}
                        </div>
                        <div className="truncate text-[13.5px] font-medium">{i.title}</div>
                        {i.summary && (
                          <div className={cn('mt-0.5 line-clamp-2 text-[12.5px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                            {i.summary}
                          </div>
                        )}
                        {!active && <TagList tags={i.tags} className="mt-2" />}
                      </div>
                      {i.kind === 'prompt' && (
                        <span
                          role="button"
                          tabIndex={0}
                          title="Скопировать промт"
                          onClick={(e) => {
                            e.stopPropagation()
                            void copyPrompt(i)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation()
                              void copyPrompt(i)
                            }
                          }}
                          className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-full transition-colors',
                            active ? 'bg-lime text-lime-foreground' : 'bg-card hover:bg-lime hover:text-lime-foreground'
                          )}
                        >
                          <Copy className="size-3.5" />
                        </span>
                      )}
                    </div>
                    {!openId && (
                      <div className="mt-1.5 text-[11px] text-muted-foreground">{fmtRelative(i.updatedAt)}</div>
                    )}
                  </ListItem>
                )
              })}
            </div>
          }
          detail={openId && openItem ? <ClaudeDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
