import { useState } from 'react'
import { Bug, CircleCheck, CircleDot, Plus } from 'lucide-react'
import { fixInputSchema, type Fix, type FixPatch } from '@shared/domain/fixes'
import { limitsOf } from '@/lib/limits'
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
  InputField
} from '../claude/editor-kit'

const LIMITS = limitsOf(fixInputSchema)

type ResolvedFilter = 'open' | 'resolved'

function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim())?.trim() ?? ''
}

function FixDetail({ fix, onClose }: { fix: Fix; onClose: () => void }) {
  const update = useApiMutation('fixes', 'update')
  const remove = useApiMutation('fixes', 'remove', { successMessage: 'Переміщено в кошик' })
  const save = (patch: FixPatch): void => update.mutate({ id: fix.id, patch })
  const entity = { type: 'fix' as const, id: fix.id }

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(fix.id)
        onClose()
      }}
      headerExtra={
        // Neutral like «Працює» in Claude: the record's lime is «Скопіювати» / «Зберегти», not a status.
        <Toggle
          size="sm"
          variant="outline"
          pressed={fix.resolved}
          onPressedChange={(resolved) => save({ resolved })}
          className="font-normal"
        >
          {fix.resolved ? <CircleCheck className="text-ink-accent" /> : <CircleDot />}
          {fix.resolved ? 'Вирішено' : 'Ще не вирішено'}
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
            label="Де сталося"
            value={fix.context}
            onSave={(context) => save({ context })}
            maxLength={LIMITS.context}
            placeholder="Hydrogen, Vite, Electron…"
          />
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle value={fix.title} onSave={(title) => save({ title })} placeholder="Що зламалося" maxLength={LIMITS.title} />
        <Block label="Текст помилки">
          <AutoCode
            value={fix.errorText}
            onSave={(errorText) => save({ errorText })}
            language="text"
            lineNumbers={false}
            minHeight="90px"
            placeholder="Вставте повідомлення або стек помилки"
            maxLength={LIMITS.errorText}
          />
        </Block>
        <AutoMarkdown
          label="Причина"
          value={fix.cause}
          onSave={(cause) => save({ cause })}
          placeholder="Чому так сталося"
          maxLength={LIMITS.cause}
          minHeight="100px"
        />
        <AutoMarkdown
          label="Як виправив"
          value={fix.solution}
          onSave={(solution) => save({ solution })}
          placeholder="Кроки, команди, код виправлення"
          maxLength={LIMITS.solution}
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
  const resolvedCount = all.length - openCount
  // Chips only for states that have records (plus the selected one): «0» chips over an empty list are noise.
  const stateChips = [
    { value: 'open' as const, label: 'Не вирішено', count: openCount },
    { value: 'resolved' as const, label: 'Вирішено', count: resolvedCount }
  ].filter((c) => c.count > 0 || c.value === resolved)
  const filtered = !!(search || tagId || resolved)

  const createNew = async (): Promise<void> => {
    const created = await create.mutateAsync({ title: 'Нова помилка', resolved: false })
    setOpen(created.id)
  }

  return (
    <Page>
      <PageHeader
        title="Помилки й рішення"
        subtitle="Що зламалося і як полагодив — щоб удруге не шукати."
        actions={
          <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
            <Plus /> Помилка
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {stateChips.length > 0 && (
            <FilterChips allLabel="Усі" value={resolved} onChange={setResolved} options={stateChips} />
          )}
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Текст помилки або рішення" className="w-64" />
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
              getKey={(x) => x.id}
              estimateSize={76}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading && (
                  <EmptyState
                    icon={Bug}
                    title={filtered ? 'Нічого не знайшлося' : 'Помилок поки немає'}
                    hint={
                      filtered
                        ? 'Вставте шматок тексту помилки в пошук — він шукає й по рішеннях.'
                        : 'Запишіть наступну помилку разом із рішенням, і пошук знайде її за пів року.'
                    }
                    action={
                      !filtered && (
                        <Button variant="soft" onClick={() => void createNew()} disabled={create.isPending}>
                          <Plus /> Записати помилку
                        </Button>
                      )
                    }
                  />
                )
              }
              renderItem={(f) => {
                const active = f.id === openId
                const line = firstLine(f.errorText)
                return (
                  <ListItem active={active} onClick={() => setOpen(f.id)}>
                    {/* Height follows content: title line, optional error line, one meta line (status · place · tags … time).
                        Only the unresolved state is marked: as a badge, not a coloured dot (docs/design-system.md → Чипы и строки). */}
                    <div className="truncate text-body font-medium">{f.title}</div>
                    {line && (
                      <div className={cn('mt-1 truncate font-mono text-meta', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        {line}
                      </div>
                    )}
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                      {!f.resolved && (
                        <Badge
                          variant={active ? 'soft' : 'destructive'}
                          className={cn('h-5 shrink-0', active && 'bg-ink-foreground/12 text-ink-foreground')}
                        >
                          Не вирішено
                        </Badge>
                      )}
                      {f.context && (
                        <Badge
                          variant="outline"
                          title={f.context}
                          className={cn(
                            'h-5 max-w-40 min-w-0 shrink-0 justify-start',
                            active && 'border-ink-foreground/20 text-ink-foreground'
                          )}
                        >
                          {/* Badge centres and clips: the «…» needs its own truncating span. */}
                          <span className="truncate">{f.context}</span>
                        </Badge>
                      )}
                      {!active && (
                        <div className="flex min-w-0 flex-1 overflow-hidden">
                          <TagList tags={f.tags} max={2} className="flex-nowrap" />
                        </div>
                      )}
                      <span className={cn('ml-auto shrink-0 text-meta whitespace-nowrap', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        {fmtRelative(f.updatedAt)}
                      </span>
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
