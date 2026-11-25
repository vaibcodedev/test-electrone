import { useCallback, useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { MAX } from '@shared/domain/limits'
import { DRAFT_TITLES } from '@shared/entity-types'
import { Kbd } from '@/components/ui/kbd'
import { useSearchParams } from 'react-router'
import { Pencil, Trash2, X } from 'lucide-react'
import type { EntityRef, Tag } from '@shared/domain/common'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Item } from '@/components/ui/item'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useUi } from '@/stores/ui-store'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { DetailModeContext, EditToggle, useDetailMode, useReadOnly, useRecordMode, type DetailMode } from './detail-mode'
import { PinButtons } from './pin-buttons'
import { TagsSection } from './tags'
import { LinksPanel } from './links-panel'
import { AttachmentsPanel } from './attachments'
import { SectionLabel } from './section-label'
import { Confirm } from './confirm'
import { IconAction } from './icon-action'

export { SectionLabel }

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
  maxLength = MAX.title,
  invalid
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Pass the schema limit (limitsOf(...).title); 200 matches most title fields. */
  maxLength?: number
  /** A required title left empty: the field itself is marked, not only the text under it. */
  invalid?: boolean
}) {
  const readOnly = useReadOnly()
  const { fresh } = useDetailMode()
  const field = useRef<HTMLTextAreaElement>(null)
  const focused = useRef(false)
  useEffect(() => {
    if (!fresh || readOnly || focused.current || !field.current) return
    focused.current = true
    field.current.focus({ preventScroll: true })
    // A default name («Нова нотатка») is selected to be typed over; a name the user gave (quick add,
    // conversion) keeps the caret at the end, so the first key doesn't wipe it.
    const draft = !value || Object.values(DRAFT_TITLES).some((list) => list?.includes(value))
    if (draft) field.current.select()
    else field.current.setSelectionRange(value.length, value.length)
  }, [fresh, readOnly, value])
  if (readOnly) {
    return (
      // A 500-character title used to fill the whole screen: 4 lines while reading, all of it when editing.
      <h2
        title={value || undefined}
        // py-1 pr-7: the same text box as the textarea below, so E doesn't re-wrap or shift the title.
        className={cn(
          'font-display min-w-0 flex-1 py-1 pr-7 text-headline line-clamp-4 leading-[1.1] [overflow-wrap:anywhere]',
          !value && 'text-muted-foreground/60',
          className
        )}
      >
        {value || placeholder}
      </h2>
    )
  }
  // Editable-in-place affordance: tint + pencil on hover, tint while editing. Without it a borderless
  // title reads as static text (docs/design-system.md → Формы).
  return (
    <div className="group/title relative -mx-2 min-w-0 flex-1">
      <Textarea
        ref={field}
        rows={1}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label="Назва"
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        // Whole lines at rest and no scrollbar lane; a longer title scrolls once the field is focused.
        className={cn(
          'font-display min-h-0 max-h-[calc(6lh+0.5rem)] cursor-text overflow-hidden rounded-xl border-0 bg-transparent py-1 pr-9 pl-2 text-headline leading-[1.1] shadow-none transition-colors [scrollbar-gutter:auto] placeholder:text-muted-foreground/50 hover:bg-foreground/5 focus-visible:overflow-y-auto focus-visible:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring aria-invalid:ring-2 aria-invalid:ring-destructive',
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

const DEFAULT_EMPTY_HINT = (
  <>
    Опису й подробиць поки немає. Натисніть «Редагувати» або <Kbd>E</Kbd>, щоб додати.
  </>
)

/** Detail pane chrome (shadcn Card): header with pin/delete/close, scrollable body, optional aside. */
export function DetailPane({
  entity,
  onClose,
  onDelete,
  headerExtra,
  children,
  aside,
  className,
  emptyHint = DEFAULT_EMPTY_HINT
}: {
  entity: EntityRef
  onClose: () => void
  onDelete?: () => void
  headerExtra?: ReactNode
  children: ReactNode
  aside?: ReactNode
  className?: string
  /** View-mode line for a record with only a title; `false` when the module's own empty sections already say it. */
  emptyHint?: ReactNode | false
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
          .catch((e) => reportError(e, 'detail-pane:discardDraft'))
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
      <RecordActions entity={entity} mode={mode} extra={headerExtra} onDelete={remove} onClose={onClose} className="px-4 py-2.5" />
      <Separator />
      {/* A narrow pane (it may shrink to 420px) puts the aside under the body instead of squeezing both. */}
      <div className="@container min-h-0 flex-1">
        {/* Wide: body and aside scroll on their own and the row stays overflow:visible — a hidden overflow here
            still reserved a second scrollbar lane (globals.css gutter rule) right of the aside. */}
        <div className={cn('flex h-full flex-col', aside && '@max-2xl:overflow-y-auto @2xl:flex-row')}>
          <div data-detail-body className={cn('min-w-0 px-6 py-5', aside ? '@2xl:flex-1 @2xl:overflow-y-auto' : 'flex-1 overflow-y-auto')}>
            {children}
            {/* Shown by CSS only in view mode when the body holds no filled field (globals.css → «only a title»). */}
            {emptyHint !== false && (
              <p data-empty-hint className="mt-4 text-body text-muted-foreground">
                {emptyHint}
              </p>
            )}
          </div>
          {aside && (
            <>
              <Separator orientation="vertical" className="hidden @2xl:block" />
              <aside className="w-full shrink-0 border-t px-4 py-5 @2xl:w-64 @2xl:overflow-y-auto @2xl:border-t-0">{aside}</aside>
            </>
          )}
        </div>
      </div>
      </DetailModeContext.Provider>
    </Card>
  )
}

/**
 * Record header actions in one fixed order (DetailPane, record sheets, record pages): pin/favourite →
 * module extras → (gap) → trash → «Редагувати» / «Скасувати»·«Зберегти» → ✕.
 */
export function RecordActions({
  entity,
  mode,
  extra,
  onDelete,
  deleteConfirm,
  onClose,
  className
}: {
  entity: EntityRef
  mode: DetailMode
  /** Module actions: a breadcrumb (truncate), a status Select, buttons. */
  extra?: ReactNode
  onDelete?: () => void
  /** Ask before the trash (a cascade, a whole board): the module's own question and button text. */
  deleteConfirm?: { title: string; description?: ReactNode; confirmLabel?: string }
  onClose: () => void
  className?: string
}): ReactElement {
  const trash = onDelete && (
    <IconAction size="icon-sm" label="У кошик" onClick={deleteConfirm ? undefined : onDelete}>
      <Trash2 />
    </IconAction>
  )
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <PinButtons entity={entity} />
      <div className="flex min-w-0 flex-1 items-center gap-2">{extra}</div>
      {onDelete && deleteConfirm ? (
        <Confirm {...deleteConfirm} confirmLabel={deleteConfirm.confirmLabel ?? 'У кошик'} onConfirm={onDelete}>
          {trash}
        </Confirm>
      ) : (
        trash
      )}
      {/* E edits, Esc leaves edit mode first and closes the record on the second press. */}
      <EditToggle mode={mode} onClose={onClose} />
      <IconAction
        size="icon-sm"
        label="Закрити"
        shortcut={mode.editing ? undefined : 'Esc'}
        data-close-detail={mode.editing ? undefined : true}
        onClick={() => (mode.confirmClose ? mode.confirmClose(onClose) : onClose())}
      >
        <X />
      </IconAction>
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
  // A record nobody changed since creating it shows one date, not two identical lines.
  const edited = updatedAt && (!createdAt || updatedAt - createdAt > 60_000) ? updatedAt : undefined
  return (
    <div className="flex flex-col gap-6">
      {children}
      {tags && onTagsChange && <TagsSection value={tags} onChange={onTagsChange} />}
      <LinksPanel entity={entity} />
      {files && <AttachmentsPanel entity={entity} />}
      {(createdAt || edited) && (
        <div className="text-meta leading-relaxed text-muted-foreground">
          {createdAt && <div>Створено {fmtDateTime(createdAt)}</div>}
          {edited && <div>Змінено {fmtDateTime(edited)}</div>}
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
