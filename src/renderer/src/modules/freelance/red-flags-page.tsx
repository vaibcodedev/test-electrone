import { useState, type ReactElement } from 'react'
import { Flag, Plus } from 'lucide-react'
import { redFlagInputSchema, type RedFlag, type RedFlagPatch } from '@shared/domain/freelance'
import { useApiMutation, useInfiniteApi, useInPlaceApi } from '@/lib/query'
import { RecordLoadError } from '@/components/common/record-load-error'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { mdPreview } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ItemDescription } from '@/components/ui/item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useReadOnly } from '@/components/common/detail-mode-context'
import {
  EmptyState,
  FilterBar,
  Kbd,
  NoResults,
  Page,
  PageBody,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import {
  DetailPane,
  EntityAside,
  ListItem,
  MasterDetail,
  useOpenParam
} from '@/components/common/master-detail'
import { AutoMarkdown, AutoTitle, Block, EditorStack } from '../claude/editor-kit'
import { SEVERITY_LABEL } from './g2-labels'
import { ImportButton } from '@/components/common/import-dialog'
import { FavoriteMark } from '@/components/common/favorite-mark'

const FLAG_L = limitsOf(redFlagInputSchema)
const TITLE_MAX = FLAG_L.title

const SEVERITY_VARIANT: Record<number, 'soft' | 'warn' | 'destructive'> = {
  1: 'soft',
  2: 'warn',
  3: 'destructive'
}

const SEVERITY_DOT: Record<'soft' | 'warn' | 'destructive', string> = {
  soft: 'bg-muted-foreground',
  warn: 'bg-warn-fill',
  destructive: 'bg-destructive'
}

/**
 * Severity reads as a scale: обережно (neutral + muted dot) → серйозно (warn) → критично (destructive).
 * On the active (ink) row the tinted badge loses contrast, so it turns into an ink chip and only the
 * dot keeps the colour (like tags on an active row).
 */
function SeverityBadge({ severity, active }: { severity: number; active?: boolean }): ReactElement {
  const variant = SEVERITY_VARIANT[severity] ?? 'soft'
  return (
    <Badge
      variant={active ? 'soft' : variant}
      className={cn('shrink-0', active && 'bg-ink-foreground/12 text-ink-foreground')}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          active && variant === 'soft' ? 'bg-ink-muted' : SEVERITY_DOT[variant]
        )}
      />
      {SEVERITY_LABEL[severity] ?? severity}
    </Badge>
  )
}

const SEVERITY_OPTIONS = [1, 2, 3].map((n) => ({ value: String(n), label: SEVERITY_LABEL[n] }))

/**
 * Coloured badge while reading (the record's main signal). While editing — a Select: three segments
 * don't fit the narrow aside column (docs/design-system.md → Переключатели).
 */
function SeverityField({
  id,
  severity,
  onChange
}: {
  id: string
  severity: number
  onChange: (v: number) => void
}): ReactElement {
  const readOnly = useReadOnly()
  return (
    <Block label="Наскільки серйозно" htmlFor={id}>
      {readOnly ? (
        <div data-view>
          <SeverityBadge severity={severity} />
        </div>
      ) : (
        <Select value={String(severity)} onValueChange={(v) => onChange(Number(v))}>
          <SelectTrigger id={id} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 rounded-full',
                    SEVERITY_DOT[SEVERITY_VARIANT[Number(o.value)]]
                  )}
                />
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Block>
  )
}

function FlagDetail({ flag, onClose }: { flag: RedFlag; onClose: () => void }) {
  const update = useApiMutation('redflags', 'update')
  const remove = useApiMutation('redflags', 'remove', {
    successMessage: 'Прапорець переміщено в кошик'
  })
  const save = (patch: RedFlagPatch): void => update.mutate({ id: flag.id, patch })
  const entity = { type: 'redflag' as const, id: flag.id }

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => remove.mutate(flag.id)}
      emptyHint={
        <>
          Ще не описано, як розпізнати цей прапорець і що робити. Натисніть «Редагувати» або{' '}
          <Kbd>E</Kbd>.
        </>
      }
      aside={
        <EntityAside
          entity={entity}
          tags={flag.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={flag.createdAt}
          updatedAt={flag.updatedAt}
          files={false}
        >
          <SeverityField
            id={`severity-${flag.id}`}
            severity={flag.severity}
            onChange={(severity) => save({ severity })}
          />
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
          maxLength={FLAG_L.signs}
          minHeight="120px"
        />
        <AutoMarkdown
          label="Що робити"
          value={flag.action}
          onSave={(action) => save({ action })}
          placeholder="Пропустити, поставити питання, підняти ціну…"
          maxLength={FLAG_L.action}
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
  const openRecord = useInPlaceApi('redflags', 'get', open ?? '', { enabled: !!open })
  const current = openRecord.data
  const add = (): void => create.mutate({ title: 'Новий прапорець' })

  return (
    <Page>
      <PageHeader
        title="Червоні прапорці"
        subtitle="Ознаки клієнтів і вакансій, яких краще оминати."
        actions={
          <>
            <ImportButton kind="redflag" onImported={(id) => id && setOpen(id)} />
            <Button variant="lime" onClick={add}>
              <Plus /> Прапорець
            </Button>
          </>
        }
      >
        {/* Nothing to search on an empty base: the field comes with the first flag. */}
        {(search || list.isLoading || list.items.length > 0) && (
          <FilterBar
            trailing={
              <SearchInput value={search} onChange={setSearch} placeholder="Шукати за ознаками" />
            }
          />
        )}
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="pr-1"
              activeKey={open}
              items={list.items}
              loading={list.isLoading}
              getKey={(f) => f.id}
              estimateSize={76}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading &&
                (search.trim() ? (
                  <NoResults
                    hint={`За запитом «${search.trim()}» прапорців немає.`}
                    onReset={() => setSearch('')}
                  />
                ) : (
                  <EmptyState
                    icon={Flag}
                    title="Прапорців поки немає"
                    hint="Запишіть ознаку проблемного клієнта, щойно на неї натрапите. Самому клієнтові можна поставити статус «Не працювати»."
                    cta={{ label: 'Додати прапорець', icon: Plus, onClick: add }}
                  />
                ))
              }
              renderItem={(f) => (
                <ListItem active={f.id === open} onClick={() => setOpen(f.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <div className="line-clamp-2 min-w-0 text-body font-medium">{f.title}</div>
                        <FavoriteMark entity={{ type: 'redflag', id: f.id }} onInk={f.id === open} className="mt-0.5" />
                      </div>
                      {f.signs && (
                        <ItemDescription className="mt-1 line-clamp-2 text-caption">
                          {mdPreview(f.signs)}
                        </ItemDescription>
                      )}
                    </div>
                    <SeverityBadge severity={f.severity} active={f.id === open} />
                  </div>
                </ListItem>
              )}
            />
          }
          detail={
            openRecord.failed ? (
              <RecordLoadError pane onRetry={openRecord.retry} onClose={() => setOpen(null)} />
            ) : current && current.id === open ? (
              <FlagDetail key={current.id} flag={current} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
