import { useState } from 'react'
import { Bug, CircleCheck, CircleDot, Plus } from 'lucide-react'
import type { Fix, FixPatch } from '@shared/domain/fixes'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Field, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { DetailPane, EntityAside, ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { AutoCode, AutoInput, AutoMarkdown, AutoTitle, Block, useEscapeToClose } from '../claude/editor-kit'

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
        <button
          type="button"
          onClick={() => save({ resolved: !fix.resolved })}
          aria-pressed={fix.resolved}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors',
            fix.resolved ? 'bg-lime font-medium text-lime-foreground' : 'bg-surface text-foreground hover:bg-accent'
          )}
        >
          {fix.resolved ? <CircleCheck className="size-4" /> : <CircleDot className="size-4" />}
          {fix.resolved ? 'Решено' : 'Ещё не решено'}
        </button>
      }
      aside={
        <EntityAside
          entity={entity}
          tags={fix.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={fix.createdAt}
          updatedAt={fix.updatedAt}
        >
          <Field label="Где случилось">
            <AutoInput
              value={fix.context}
              onSave={(context) => save({ context })}
              placeholder="Hydrogen, Vite, Electron…"
            />
          </Field>
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
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
        <Block label="Причина">
          <AutoMarkdown value={fix.cause} onSave={(cause) => save({ cause })} placeholder="Почему так вышло" minHeight="100px" />
        </Block>
        <Block label="Как исправил">
          <AutoMarkdown
            value={fix.solution}
            onSave={(solution) => save({ solution })}
            placeholder="Шаги, команды, код исправления"
            minHeight="200px"
          />
        </Block>
      </div>
    </DetailPane>
  )
}

export function FixesPage() {
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [resolved, setResolved] = useState<ResolvedFilter | undefined>()
  const [openId, setOpen] = useOpenParam()
  const { data: all = [], isLoading } = useApi('fixes', 'list', { search: search || undefined, tagId })
  const { data: openItem } = useApi('fixes', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('fixes', 'create')

  const openCount = all.filter((f) => !f.resolved).length
  const items = resolved ? all.filter((f) => (resolved === 'resolved' ? f.resolved : !f.resolved)) : all

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
            <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1">
              {!isLoading && items.length === 0 && (
                <EmptyState
                  icon={Bug}
                  title={search || tagId || resolved ? 'Ничего не нашлось' : 'Ошибок пока нет'}
                  hint={
                    search || tagId || resolved
                      ? 'Вставьте кусок текста ошибки в поиск — он ищет и по решениям.'
                      : 'Запишите следующую ошибку вместе с решением, и поиск найдёт её через полгода.'
                  }
                />
              )}
              {items.map((f) => {
                const active = f.id === openId
                const line = firstLine(f.errorText)
                return (
                  <ListItem key={f.id} active={active} onClick={() => setOpen(f.id)}>
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
              })}
            </div>
          }
          detail={openId && openItem ? <FixDetail key={openItem.id} fix={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
