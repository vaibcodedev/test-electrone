import { useCallback, useEffect, type ReactNode } from 'react'
import { MAX } from '@shared/domain/limits'
import { Kbd } from '@/components/ui/kbd'
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
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { DetailModeContext, EditToggle, useReadOnly, useRecordMode } from './detail-mode'
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
    // Panels clip their content (overflow hidden): 4px of room on every side keeps focus rings and the pane's
    // shadow whole; the group's negative margin gives the room back, so the layout doesn't move.
    <ResizablePanelGroup orientation="horizontal" className={cn('-m-1 min-h-0 flex-1', className)}>
      <ResizablePanel defaultSize={listSize} minSize="240px" maxSize="60%" className="flex min-h-0 flex-col p-1 pr-2.5">
        {list}
      </ResizablePanel>
      <ResizableHandle className="bg-transparent hover:bg-border" />
      <ResizablePanel minSize="420px" className="flex min-h-0 min-w-0 flex-col p-1 pl-2.5">
        {detail}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/** Big borderless title (shadcn Textarea, auto-growing). */
export function InlineTitle({
  value,
  onChange,
  placeholder = 'Без назви',
  className,
  maxLength = MAX.title
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Pass the schema limit (limitsOf(...).title); 200 matches most title fields. */
  maxLength?: number
}) {
  const readOnly = useReadOnly()
  if (readOnly) {
    return (
      // A 500-character title used to fill the whole screen: 4 lines while reading, all of it when editing.
      <h2
        title={value || undefined}
        className={cn('font-display text-headline line-clamp-4 leading-[1.1] [overflow-wrap:anywhere]', !value && 'text-muted-foreground/60', className)}
      >
        {value || placeholder}
      </h2>
    )
  }
  // Editable-in-place affordance: tint + pencil on hover, tint while editing. Without it a borderless
  // title reads as static text (docs/design-system.md → Формы).
  return (
    <div className="group/title relative -mx-2">
      <Textarea
        rows={1}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        title="Натисніть, щоб змінити"
        aria-label="Назва"
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        className={cn(
          'font-display min-h-0 cursor-text rounded-xl border-0 bg-transparent py-1 pr-9 pl-2 text-headline leading-[1.1] shadow-none transition-colors placeholder:text-muted-foreground/50 hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-0',
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
  // View first; a record created a moment ago opens straight in edit mode. Snapshot → «Скасувати».
  const mode = useRecordMode(entity.id, entity.type)
  const { editing } = mode

  // Closing an untouched empty draft discards it (server re-checks, so a late autosave wins).
  useEffect(() => {
    const ref = { type: entity.type, id: entity.id }
    return () => {
      setTimeout(() => {
        api.trash
          .discardDraft(ref)
          .then((discarded) => discarded && invalidateAll())
          .catch(() => undefined)
      }, 800)
    }
  }, [entity.type, entity.id])
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
      data-detail-mode={editing ? 'edit' : 'view'}
      className={cn(
        'min-h-0 flex-1 animate-pane gap-0 overflow-hidden bg-card py-0 shadow-[0_12px_40px_-16px_rgb(0_0_0/0.35)] border border-foreground/12',
        leaving && 'pointer-events-none animate-leave',
        className
      )}
    >
      <DetailModeContext.Provider value={mode}>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <PinButtons entity={entity} />
        <div className="flex-1">{headerExtra}</div>
        {remove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="У кошик" onClick={remove}>
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>У кошик</TooltipContent>
          </Tooltip>
        )}
        {/* E edits, Esc leaves edit mode first and closes the pane on the second press. */}
        <EditToggle mode={mode} onClose={onClose} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Закрити" data-close-detail={editing ? undefined : true} onClick={() => (mode.confirmClose ? mode.confirmClose(onClose) : onClose())}>
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Закрити{editing ? '' : ' · Esc'}</TooltipContent>
        </Tooltip>
      </div>
      <Separator />
      <div className="flex min-h-0 flex-1">
        <div data-detail-body className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          {children}
          {/* Shown by CSS only in view mode when the body holds no filled field (globals.css → «only a title»). */}
          <p data-empty-hint className="mt-4 text-body text-muted-foreground">
            Тут поки лише назва. Натисніть «Редагувати» або <Kbd>E</Kbd>, щоб додати опис і подробиці.
          </p>
        </div>
        {aside && (
          <>
            <Separator orientation="vertical" />
            <aside className="w-64 shrink-0 overflow-y-auto px-4 py-5">{aside}</aside>
          </>
        )}
      </div>
      </DetailModeContext.Provider>
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
          <SectionLabel>Мітки</SectionLabel>
          <TagPicker value={tags} onChange={onTagsChange} />
        </section>
      )}
      <LinksPanel entity={entity} />
      {files && <AttachmentsPanel entity={entity} />}
      {(createdAt || updatedAt) && (
        <div className="text-meta leading-relaxed text-muted-foreground">
          {createdAt && <div>Створено {fmtDateTime(createdAt)}</div>}
          {updatedAt && <div>Змінено {fmtDateTime(updatedAt)}</div>}
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
        {/* overflow-wrap: one long word (a pasted URL, «аааа…») wraps instead of widening the row. */}
        <div className="w-full min-w-0 [overflow-wrap:anywhere]">{children}</div>
      </button>
    </Item>
  )
}
