import { useState } from 'react'
import { Flag, Plus } from 'lucide-react'
import { redFlagInputSchema, type RedFlag, type RedFlagPatch } from '@shared/domain/freelance'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { countLabel } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  EmptyState,
  Page,
  PageBody,
  PageHeader,
  SearchInput,
  Segmented
} from '@/components/common/page'
import {
  DetailPane,
  EntityAside,
  ListItem,
  MasterDetail,
  useOpenParam
} from '@/components/common/master-detail'
import { AutoMarkdown, AutoTitle, Block, EditorStack, useEscapeToClose } from '../claude/editor-kit'
import { SEVERITY_LABEL } from './g2-labels'
import { ImportButton } from '@/components/common/import-dialog'

const TITLE_MAX = limitsOf(redFlagInputSchema).title

const SEVERITY_VARIANT: Record<number, 'soft' | 'warn' | 'destructive'> = {
  1: 'soft',
  2: 'warn',
  3: 'destructive'
}

/** Severity reads as a scale: обережно (neutral + muted dot) → серйозно (warn) → критично (destructive). */
export function SeverityBadge({ severity }: { severity: number }) {
  const variant = SEVERITY_VARIANT[severity] ?? 'soft'
  return (
    <Badge variant={variant}>
      <span
        className={cn(
          'size-1.5 rounded-full',
          variant === 'soft' ? 'bg-muted-foreground' : 'bg-current'
        )}
      />
      {SEVERITY_LABEL[severity] ?? severity}
    </Badge>
  )
}

function FlagDetail({ flag, onClose }: { flag: RedFlag; onClose: () => void }) {
  const update = useApiMutation('redflags', 'update')
  const remove = useApiMutation('redflags', 'remove', { successMessage: 'Переміщено в кошик' })
  const save = (patch: RedFlagPatch): void => update.mutate({ id: flag.id, patch })
  const entity = { type: 'redflag' as const, id: flag.id }
  useEscapeToClose(onClose)

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(flag.id)
        onClose()
      }}
      aside={
        <EntityAside
          entity={entity}
          tags={flag.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={flag.createdAt}
          updatedAt={flag.updatedAt}
          files={false}
        >
          <Block label="Наскільки серйозно">
            <Segmented
              className="w-fit"
              size="xs"
              value={String(flag.severity) as '1' | '2' | '3'}
              onChange={(v) => save({ severity: Number(v) })}
              options={[1, 2, 3].map((n) => ({
                value: String(n) as '1' | '2' | '3',
                label: SEVERITY_LABEL[n]
              }))}
            />
          </Block>
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle
          value={flag.title}
          onSave={(title) => save({ title })}
          maxLength={TITLE_MAX}
          placeholder="Червоний прапорець"
        />
        <AutoMarkdown
          label="Як розпізнати"
          value={flag.signs}
          onSave={(signs) => save({ signs })}
          placeholder="Ознаки в описі вакансії, профілі чи листуванні"
          minHeight="120px"
        />
        <AutoMarkdown
          label="Що робити"
          value={flag.action}
          onSave={(action) => save({ action })}
          placeholder="Пропустити, поставити питання, підняти ціну…"
          minHeight="120px"
        />
      </EditorStack>
    </DetailPane>
  )
}

export function RedFlagsPage() {
  const [open, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const list = useInfiniteApi('redflags', 'list', { search: q || undefined })
  const create = useApiMutation('redflags', 'create', { onSuccess: (f) => setOpen(f.id) })
  const { data: current } = useApi('redflags', 'get', open ?? '', { enabled: !!open })

  return (
    <Page>
      <PageHeader
        title="Червоні прапорці"
        subtitle={
          list.items.length
            ? `${countLabel(list.items.length, list.hasMore, ['прапорець', 'прапорці', 'прапорців'])} · яких клієнтів і вакансій краще оминати`
            : 'Яких клієнтів і вакансій краще оминати. Клієнтові можна поставити статус «Не працювати» в його картці.'
        }
        actions={
          <>
            <ImportButton kind="redflag" onImported={(id) => id && setOpen(id)} />
            <Button variant="lime" onClick={() => create.mutate({ title: 'Новий прапорець' })}>
              <Plus /> Прапорець
            </Button>
          </>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Шукати за ознаками"
          className="w-72"
        />
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="pr-1"
              items={list.items}
              getKey={(f) => f.id}
              estimateSize={76}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading && (
                  <EmptyState
                    icon={Flag}
                    title={search ? 'Нічого не знайдено' : 'Прапорців немає'}
                    hint={search ? undefined : 'Запишіть ознаку проблемного клієнта, щойно на неї натрапите.'}
                  />
                )
              }
              renderItem={(f) => (
                <ListItem active={f.id === open} onClick={() => setOpen(f.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-body font-medium">{f.title}</div>
                      {f.signs && <div className="mt-1 line-clamp-2 text-caption opacity-70">{f.signs}</div>}
                    </div>
                    <SeverityBadge severity={f.severity} />
                  </div>
                </ListItem>
              )}
            />
          }
          detail={
            current && current.id === open ? (
              <FlagDetail key={current.id} flag={current} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
