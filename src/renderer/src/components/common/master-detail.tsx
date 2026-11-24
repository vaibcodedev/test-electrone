import { useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Trash2, X } from 'lucide-react'
import type { EntityRef, Tag } from '@shared/domain/common'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PinButtons } from './pin-buttons'
import { TagPicker } from './tags'
import { LinksPanel } from './links-panel'
import { AttachmentsPanel } from './attachments'

/** Selected item id lives in the URL (?open=id) so global search / links can deep-link into any module. */
export function useOpenParam(): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams()
  const open = params.get('open')
  const setOpen = useCallback(
    (id: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('open', id)
          else next.delete('open')
          return next
        },
        { replace: true }
      )
    },
    [setParams]
  )
  return [open, setOpen]
}

/**
 * Two-pane layout: list on the left, detail editor on the right (Lemon-AI style columns).
 * The detail pane appears only when something is open.
 */
export function MasterDetail({
  list,
  detail,
  listWidth = 'w-[380px]',
  className
}: {
  list: ReactNode
  detail: ReactNode | null
  listWidth?: string
  className?: string
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 gap-3', className)}>
      <div className={cn('flex min-h-0 flex-col', detail ? cn(listWidth, 'shrink-0') : 'flex-1')}>{list}</div>
      {detail && <div className="flex min-h-0 min-w-0 flex-1 flex-col">{detail}</div>}
    </div>
  )
}

/** Big borderless title input for editors. */
export function InlineTitle({
  value,
  onChange,
  placeholder = 'Без названия',
  className
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <textarea
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      className={cn(
        'font-display w-full resize-none bg-transparent text-[28px] leading-[1.08] outline-none [field-sizing:content] placeholder:text-muted-foreground/50',
        className
      )}
    />
  )
}

/** Detail pane chrome: header with close/pin/delete, scrollable body, optional aside. */
export function DetailPane({
  entity,
  onClose,
  onDelete,
  headerExtra,
  children,
  aside,
  className
}: {
  entity: EntityRef
  onClose: () => void
  onDelete?: () => void
  headerExtra?: ReactNode
  children: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <PinButtons entity={entity} />
        <div className="flex-1">{headerExtra}</div>
        {onDelete && (
          <Button variant="ghost" size="icon-sm" title="В корзину" onClick={onDelete}>
            <Trash2 />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" title="Закрыть (Esc)" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {aside && <aside className="w-64 shrink-0 overflow-y-auto border-l border-border px-4 py-5">{aside}</aside>}
      </div>
    </div>
  )
}

/** Standard aside: tags, links, files, timestamps. Modules put their specific fields above it. */
export function EntityAside({
  entity,
  tags,
  onTagsChange,
  createdAt,
  updatedAt,
  files = true,
  children
}: {
  entity: EntityRef
  tags?: Tag[]
  onTagsChange?: (tagIds: string[]) => void
  createdAt?: number
  updatedAt?: number
  files?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      {children}
      {tags && onTagsChange && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] text-muted-foreground">Метки</h3>
          <TagPicker value={tags} onChange={onTagsChange} />
        </section>
      )}
      <LinksPanel entity={entity} />
      {files && <AttachmentsPanel entity={entity} />}
      {(createdAt || updatedAt) && (
        <div className="text-[11.5px] leading-relaxed text-muted-foreground">
          {createdAt && <div>Создано {fmtDateTime(createdAt)}</div>}
          {updatedAt && <div>Изменено {fmtDateTime(updatedAt)}</div>}
        </div>
      )}
    </div>
  )
}

/** Selectable list row used by master lists. */
export function ListItem({
  active,
  onClick,
  children,
  className
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl px-4 py-3 text-left transition-colors',
        active ? 'bg-ink text-ink-foreground' : 'bg-surface hover:bg-accent',
        className
      )}
      data-active={active || undefined}
    >
      {children}
    </button>
  )
}
