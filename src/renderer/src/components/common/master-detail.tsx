import { useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Pencil, Trash2, X } from 'lucide-react'
import type { EntityRef, Tag } from '@shared/domain/common'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Item } from '@/components/ui/item'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUi } from '@/stores/ui-store'
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
 * Two-pane layout (shadcn Resizable): list on the left, detail editor on the right.
 * The detail pane appears only when something is open; the divider can be dragged.
 */
export function MasterDetail({
  list,
  detail,
  listSize = '34%',
  className
}: {
  list: ReactNode
  detail: ReactNode | null
  /** Default width of the list pane when detail is open. */
  listSize?: string
  /** @deprecated kept for compatibility; use listSize. */
  listWidth?: string
  className?: string
}) {
  if (!detail) return <div className={cn('flex min-h-0 flex-1 flex-col', className)}>{list}</div>
  return (
    <ResizablePanelGroup orientation="horizontal" className={cn('min-h-0 flex-1', className)}>
      <ResizablePanel defaultSize={listSize} minSize="240px" maxSize="60%" className="flex min-h-0 flex-col pr-1.5">
        {list}
      </ResizablePanel>
      <ResizableHandle className="bg-transparent hover:bg-border" />
      <ResizablePanel minSize="420px" className="flex min-h-0 min-w-0 flex-col pl-1.5">
        {detail}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/** Big borderless title (shadcn Textarea, auto-growing). */
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
  // Editable-in-place affordance: tint + pencil on hover, tint while editing. Without it a borderless
  // title reads as static text (docs/design-system.md → Формы).
  return (
    <div className="group/title relative -mx-2">
      <Textarea
        rows={1}
        value={value}
        placeholder={placeholder}
        title="Нажмите, чтобы изменить"
        aria-label="Название"
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        className={cn(
          'font-display min-h-0 cursor-text rounded-xl border-0 bg-transparent py-1 pr-9 pl-2 text-[28px] leading-[1.1] shadow-none transition-colors placeholder:text-muted-foreground/50 hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-0',
          className
        )}
      />
      <Pencil
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-within/title:opacity-0"
      />
    </div>
  )
}

/** Detail pane chrome (shadcn Card): header with pin/delete/close, scrollable body, optional aside. */
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
  const leaving = useUi((s) => !!s.leaving[entity.id])
  const setLeaving = useUi((s) => s.setLeaving)
  // "В корзину": the pane and the list row fade out first, then the record is removed.
  const remove = onDelete
    ? (): void => {
        setLeaving(entity.id, true)
        setTimeout(() => {
          onDelete()
          setTimeout(() => setLeaving(entity.id, false), 400)
        }, 200)
      }
    : undefined
  return (
    // Visible edge + soft shadow + enter motion: the pane reads as a layer above the list, not part of it.
    <Card
      className={cn(
        'min-h-0 flex-1 animate-pane gap-0 overflow-hidden bg-card py-0 shadow-[0_12px_40px_-16px_rgb(0_0_0/0.35)] ring-1 ring-foreground/12',
        leaving && 'pointer-events-none animate-leave',
        className
      )}
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        <PinButtons entity={entity} />
        <div className="flex-1">{headerExtra}</div>
        {remove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="В корзину" onClick={remove}>
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>В корзину</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Закрыть" data-close-detail onClick={onClose}>
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Закрыть · Esc</TooltipContent>
        </Tooltip>
      </div>
      <Separator />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {aside && (
          <>
            <Separator orientation="vertical" />
            <aside className="w-64 shrink-0 overflow-y-auto px-4 py-5">{aside}</aside>
          </>
        )}
      </div>
    </Card>
  )
}

/** Section title used in asides and editors. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      <h3 className="text-caption font-semibold text-muted-foreground">{children}</h3>
      {action}
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
          <SectionLabel>Метки</SectionLabel>
          <TagPicker value={tags} onChange={onTagsChange} />
        </section>
      )}
      <LinksPanel entity={entity} />
      {files && <AttachmentsPanel entity={entity} />}
      {(createdAt || updatedAt) && (
        <div className="text-meta leading-relaxed text-muted-foreground">
          {createdAt && <div>Создано {fmtDateTime(createdAt)}</div>}
          {updatedAt && <div>Изменено {fmtDateTime(updatedAt)}</div>}
        </div>
      )}
    </div>
  )
}

/** Selectable list row for master lists (shadcn Item; selected = ink like the reference). */
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
    <Item asChild variant={active ? 'active' : 'muted'} size="sm" className={cn('w-full text-left', className)}>
      <button type="button" onClick={onClick} data-active={active || undefined} aria-current={active || undefined}>
        <div className="w-full min-w-0">{children}</div>
      </button>
    </Item>
  )
}
