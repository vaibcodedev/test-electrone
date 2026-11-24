import { useState } from 'react'
import { Bug, CircleCheck, CircleDot, Plus } from 'lucide-react'
import type { Fix, FixPatch } from '@shared/domain/fixes'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Toggle } from '@/components/ui/toggle'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { DetailPane, EntityAside, ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import {
  AutoCode,
  AutoMarkdown,
  AutoTitle,
  Block,
  EditorStack,
  InputField,
  useEscapeToClose
} from '../claude/editor-kit'

type ResolvedFilter = 'open' | 'resolved'

function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim())?.trim() ?? ''
}

function FixDetail({ fix, onClose }: { fix: Fix; onClose: () => void }) {
  const update = useApiMutation('fixes', 'update')
  const remove = useApiMutation('fixes', 'remove', { successMessage: 'Перемещено в корзину' })
  const save = (patch: FixPatch): void => update.mutate({ id: fix.id, patch })
  const entity = { type: 'fix' as const, id: fix.id }
  useEscapeToClose(onClose)

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(fix.id)
        onClose()
      }}
      headerExtra={
        <Toggle
          size="sm"
          variant="chip"
          pressed={fix.resolved}
          onPressedChange={(resolved) => save({ resolved })}
          aria-label="Решено"
        >
          {fix.resolved ? <CircleCheck /> : <CircleDot />}
          {fix.resolved ? 'Решено' : 'Ещё не решено'}
        </Toggle>
      }
      aside={
        <EntityAside
          entity={entity}
          tags={fix.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={fix.createdAt}
          updatedAt={fix.updatedAt}
        >
          <InputField
            label="Где случилось"
            value={fix.context}
            onSave={(context) => save({ context })}
            placeholder="Hydrogen, Vite, Electron…"
          />
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle value={fix.title} onSave={(title) => save({ title })} placeholder="Что сломалось" />
        <Block label="Текст ошибки">
          <AutoCode
            value={fix.errorText}
            onSave={(errorText) => save({ errorText })}
            language="text"
            lineNumbers={false}
            minHeight="90px"
            placeholder="Вставьте сообщение или стек ошибки"
          />
        </Block>
        <AutoMarkdown
          label="Причина"
          value={fix.cause}
          onSave={(cause) => save({ cause })}
          placeholder="Почему так вышло"
          minHeight="100px"
        />
        <AutoMarkdown
          label="Как исправил"
          value={fix.solution}
          onSave={(solution) => save({ solution })}
          placeholder="Шаги, команды, код исправления"
          minHeight="180px"
        />
      </EditorStack>
    </DetailPane>
  )
}

export function FixesPage() {
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [resolved, setResolved] = useState<ResolvedFilter | undefined>()
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId }
  // Full list only feeds the chip counters; the rendered list is paged + virtualized.
  const { data: all = [] } = useApi('fixes', 'list', base)
  const list = useInfiniteApi('fixes', 'list', { ...base, resolved: resolved ? resolved === 'resolved' : undefined })
  const { data: openItem } = useApi('fixes', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('fixes', 'create')

  const openCount = all.filter((f) => !f.resolved).length

  return (
    <Page>
      <PageHeader
        title="Ошибки и решения"
        subtitle="Что сломалось и как починил — чтобы второй раз не искать."
        actions={
          <Button
            variant="lime"
            onClick={async () => {
              const created = await create.mutateAsync({ title: 'Новая ошибка', resolved: false })
              setOpen(created.id)
            }}
          >
            <Plus /> Ошибка
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Все"
            value={resolved}
            onChange={setResolved}
            options={[
              { value: 'open', label: 'Не решено', count: openCount },
              { value: 'resolved', label: 'Решено', count: all.length - openCount }
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Текст ошибки или решение" className="w-64" />
          </div>
        </div>
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="-mx-1 px-1"
              items={list.items}
              getKey={(x) => x.id}
              estimateSize={96}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={!list.isLoading && (<EmptyState
                  icon={Bug}
                  title={search || tagId || resolved ? 'Ничего не нашлось' : 'Ошибок пока нет'}
                  hint={
                    search || tagId || resolved
                      ? 'Вставьте кусок текста ошибки в поиск — он ищет и по решениям.'
                      : 'Запишите следующую ошибку вместе с решением, и поиск найдёт её через полгода.'
                  }
                />)}
              renderItem={(f) => {
                const active = f.id === openId
                const line = firstLine(f.errorText)
                return (
                  <ListItem active={active} onClick={() => setOpen(f.id)}>
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          f.resolved ? 'bg-success' : 'bg-destructive'
                        )}
                        title={f.resolved ? 'Решено' : 'Не решено'}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium">{f.title}</div>
                        {line && (
                          <div
                            className={cn(
                              'mt-1 truncate font-mono text-[11.5px]',
                              active ? 'text-ink-muted' : 'text-muted-foreground'
                            )}
                          >
                            {line}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {f.context && (
                            <Badge variant={active ? 'lime' : 'outline'} className="h-5">
                              {f.context}
                            </Badge>
                          )}
                          {!active && <TagList tags={f.tags} max={3} />}
                          <span className={cn('ml-auto text-[11px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                            {fmtRelative(f.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </ListItem>
                )
              }}
            />
          }
          detail={openId && openItem ? <FixDetail key={openItem.id} fix={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
