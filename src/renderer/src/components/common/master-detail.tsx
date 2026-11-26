import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject
} from 'react'
import { MAX } from '@shared/domain/limits'
import { DRAFT_TITLES } from '@shared/entity-types'
import { useSearchParams } from 'react-router'
import { Pencil, Trash2, X } from 'lucide-react'
import type { EntityRef, Tag } from '@shared/domain/common'
import { fmtDateTime } from '@/lib/format'
import { reducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Item } from '@/components/ui/item'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useUi } from '@/stores/ui-store'
import { CurrentRecordContext } from '@/hooks/use-current-record'
import { useDiscardDraftOnLeave } from '@/hooks/use-discard-draft'
import { useHoldWhileInvalid } from '@/hooks/use-hold-while-invalid'
import {
  DetailModeContext,
  EditHintText,
  EditToggle,
  useDetailMode,
  useReadOnly,
  useRecordMode,
  usePublishMode,
  type DetailMode
} from './detail-mode'
import { PinButtons } from './pin-buttons'
import { TagsSection } from './tags'
import { LinksPanel } from './links-panel'
import { MentionsPanel } from './mentions-panel'
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

/** How long a switch A → B keeps A on screen while B loads; a record that never arrives (deleted) lets go. */
const HOLD_MS = 1000
const NOTHING_HELD = { node: null as ReactNode, open: null as string | null }
/** The closing pane's exit motion (`--animate-pane-out`, 0.16s); nothing to wait for when motion is reduced. */
const exitMs = (): number => (reducedMotion() ? 0 : 160)
/** Every parent is a flex box: auto lets the group stretch / grow into it, negative margins included. */
const FILL = { width: 'auto', height: 'auto' } as const

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
  const [open] = useOpenParam()
  // Pages that load the opened record (useApi get) pass null for a frame while switching A → B: keep A until B
  // arrives, or the pane vanished and the list jumped to full width. Not when A itself is gone (deleted while
  // open): only while ?open= points to another record than the one on screen. On close A stays for its exit.
  const [held, setHeld] = useState(NOTHING_HELD)
  if (detail && (held.node !== detail || held.open !== open)) setHeld({ node: detail, open })
  // The open record itself is gone (trashed): let it go now, or closing it a moment later brought it back.
  else if (!detail && open && held.node && held.open === open) setHeld(NOTHING_HELD)
  const holding = !detail && !!open && !!held.node && held.open !== open
  // Closed (Esc, ✕): the last record stays for the exit motion, inert, then goes. Closed by «У кошик» (most pages
  // close right after the delete starts): it has faded out already, a second exit would only hold an empty column.
  const closing = !detail && !open && !!held.node
  const heldLeaving = useUi((s) => !!held.open && !!s.leaving[held.open])
  useEffect(() => {
    if (!holding && !closing) return
    const exit = heldLeaving ? 0 : exitMs()
    const timer = setTimeout(() => setHeld(NOTHING_HELD), holding ? HOLD_MS : exit)
    return () => clearTimeout(timer)
  }, [holding, closing, heldLeaving])
  const shown = detail ?? (holding || closing ? held.node : null)
  return (
    // One group whether or not a record is open: the list stays mounted, so opening a record keeps its scroll.
    // Panels clip their content (overflow hidden): 4px of room on every side keeps focus rings and the pane's
    // shadow whole; the group's negative margin gives the room back, so the layout doesn't move. Auto size (the
    // library sets 100% inline): at 100% the box stayed the parent's size and lost 8px on one side to the margins.
    <ResizablePanelGroup
      orientation="horizontal"
      style={FILL}
      className={cn('-m-1 min-h-0 flex-1', className)}
    >
      {/* Alone, the list takes the whole width; its size limits apply only next to a record. */}
      <ResizablePanel
        id="list"
        defaultSize={shown ? listSize : undefined}
        minSize={shown ? '240px' : undefined}
        maxSize={shown ? '60%' : undefined}
        className={cn('flex min-h-0 flex-col p-1', shown && 'pr-2.5')}
      >
        {list}
      </ResizablePanel>
      {shown && (
        <>
          <ResizableHandle className="bg-transparent hover:bg-border" />
          <ResizablePanel
            id="detail"
            minSize="420px"
            inert={closing || undefined}
            className={cn(
              'flex min-h-0 min-w-0 flex-col p-1 pl-2.5',
              // The mirror of animate-pane (fade + 6px to the side), held at its end until unmount; a
              // reduced-motion setting drops the hold (exitMs) along with the motion.
              closing && 'pointer-events-none animate-pane-out'
            )}
          >
            {shown}
          </ResizablePanel>
        </>
      )}
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
  invalid,
  describedBy
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Pass the schema limit (limitsOf(...).title); 200 matches most title fields. */
  maxLength?: number
  /** A required title left empty: the field itself is marked, not only the text under it. */
  invalid?: boolean
  /** id of the text that explains the error (the FieldError under the title): read out with the field. */
  describedBy?: string
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
      // A 500-character title used to fill the screen: 4 lines while reading, 6 while editing (scrolls once focused).
      <h2
        title={value || undefined}
        // my-1 pr-7: the same text box as the textarea below (py-1), so E doesn't re-wrap or shift the title.
        // Margin, not padding: line-clamp clips at the padding box, a bottom padding showed the 5th line's tops.
        className={cn(
          'font-display min-w-0 flex-1 my-1 pr-7 text-headline line-clamp-4 leading-[1.1] wrap-anywhere',
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
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        // Whole lines at rest and no scrollbar lane; a longer title scrolls once the field is focused. 6lh + the top
        // padding only: with the bottom one as well, the tops of the 7th line showed under the 6th.
        // Focus like every field (DS §2): a thin inner ring (the title has no border) + the soft outer one, not lime.
        className={cn(
          'font-display min-h-0 max-h-[calc(6lh+0.25rem)] cursor-text overflow-hidden rounded-xl border-0 bg-transparent py-1 pr-9 pl-2 text-headline leading-[1.1] shadow-none transition-colors scrollbar-gutter-auto placeholder:text-muted-foreground/50 hover:bg-foreground/5 focus-visible:overflow-y-auto focus-visible:bg-foreground/5 focus-visible:inset-ring focus-visible:inset-ring-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:inset-ring aria-invalid:inset-ring-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
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
    Опису й подробиць поки немає. <EditHintText />
  </>
)

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]'

/**
 * Where focus goes once the pane of a trashed record is gone: the next row of the list (the previous one at the
 * end), else the page heading. Taken before the delete, while the open row is still marked active.
 */
function focusAfterTrash(): () => void {
  const row = document
    .querySelector('[data-index] [data-active]')
    ?.closest<HTMLElement>('[data-index]')
  const near = [row?.nextElementSibling, row?.previousElementSibling]
    .map((r) => r?.querySelector<HTMLElement>(FOCUSABLE))
    .find(Boolean)
  return () => {
    // Only when focus fell with the pane: a click elsewhere in the meantime wins.
    const lost = !document.activeElement || document.activeElement === document.body
    if (!lost) return
    if (near?.isConnected) return near.focus()
    const heading = document.querySelector<HTMLElement>('[data-slot="page-header"] h1')
    // focusVisible false: no ring on a heading the user didn't tab to (it is tabIndex -1 already).
    heading?.focus({ focusVisible: false } as FocusOptions)
  }
}

/** Detail pane chrome (shadcn Card): header with pin/delete/close, scrollable body, optional aside. */
export function DetailPane({
  entity,
  onClose,
  onDelete,
  headerExtra,
  children,
  aside,
  className,
  emptyHint = DEFAULT_EMPTY_HINT,
  footer,
  modeRef
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
  /**
   * Body sections that belong below the empty hint (a company's vacancies): the hint then sits right under the
   * title. Note: a filled field inside (data-has-content, data-view, an image) hides the hint like the body's own.
   */
  footer?: ReactNode
  /** In a Dialog or Sheet: the overlay reads the mode through it (guardSheet — Esc leaves editing first). */
  modeRef?: RefObject<DetailMode | null>
}) {
  const leaving = useUi((s) => !!s.leaving[entity.id])
  const setLeaving = useUi((s) => s.setLeaving)
  // View first; a record created a moment ago opens straight in edit mode. Snapshot → «Скасувати».
  const mode = useRecordMode(entity.id, entity.type)
  const { editing } = mode
  usePublishMode(modeRef, mode)
  // A field with an error anywhere in the pane holds «Зберегти» (and the autosaves) until it is fixed.
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  useHoldWhileInvalid(root, editing ? mode.holdInvalid : undefined)
  const current = useMemo(() => ({ type: entity.type, id: entity.id }), [entity.type, entity.id])

  // Set by «У кошик»: the pane's unmount hands focus to the next row instead of dropping it on <body>.
  const refocus = useRef<(() => void) | null>(null)
  // Closing an untouched empty draft discards it (server re-checks, so a late autosave wins).
  useDiscardDraftOnLeave(entity.type, entity.id, 'detail-pane')
  useEffect(
    () => () => {
      const after = refocus.current
      if (after) requestAnimationFrame(after)
    },
    [entity.type, entity.id]
  )
  // "В корзину": the pane and the list row fade out first, then the record is removed.
  const remove = onDelete
    ? (): void => {
        refocus.current = focusAfterTrash()
        setLeaving(entity.id, true)
        setTimeout(() => {
          onDelete()
          setTimeout(() => setLeaving(entity.id, false), 400)
        }, 200)
      }
    : undefined
  return (
    // Visible edge + soft shadow + enter motion: the pane reads as a layer above the list, not part of it.
    // The shadow fits the panel's 4px of room (MasterDetail): a 40px blur was cut square at the rounded corners.
    <Card
      ref={setRoot}
      data-detail-mode={editing ? 'edit' : 'view'}
      className={cn(
        'min-h-0 flex-1 animate-pane gap-0 overflow-hidden bg-card py-0 shadow-[0_1px_3px_-1px_rgb(0_0_0/0.22)] border border-foreground/12',
        leaving && 'pointer-events-none animate-leave',
        className
      )}
    >
      <DetailModeContext.Provider value={mode}>
        <CurrentRecordContext.Provider value={current}>
          <RecordActions
            entity={entity}
            mode={mode}
            extra={headerExtra}
            onDelete={remove}
            onClose={onClose}
            className="px-4 py-2.5"
          />
          <Separator />
          {/* A narrow pane (it may shrink to 420px) puts the aside under the body instead of squeezing both. */}
          <div className="@container min-h-0 flex-1">
            {/* Wide: body and aside scroll on their own and the row stays overflow:visible — a hidden overflow here
              still reserved a second scrollbar lane (globals.css gutter rule) right of the aside. */}
            <div
              className={cn(
                'flex h-full flex-col',
                aside && '@max-2xl:overflow-y-auto @2xl:flex-row'
              )}
            >
              <div
                data-detail-body
                className={cn(
                  'min-w-0 px-6 py-5',
                  aside ? '@2xl:flex-1 @2xl:overflow-y-auto' : 'flex-1 overflow-y-auto'
                )}
              >
                {/* Remounted when changes are thrown away: no typed-but-unsaved text in a field's own state survives. */}
                <Fragment key={mode.epoch}>{children}</Fragment>
                {/* Shown by CSS only in view mode when the body holds no filled field (globals.css → «only a title»). */}
                {emptyHint !== false && (
                  <p data-empty-hint className="mt-4 text-body text-muted-foreground">
                    {emptyHint}
                  </p>
                )}
                <Fragment key={mode.epoch}>{footer}</Fragment>
              </div>
              {aside && (
                <>
                  <Separator orientation="vertical" className="hidden @2xl:block" />
                  {/* Under the body (narrow pane) it lines up with the body's px-6; beside it, a column of its own. */}
                  <aside className="w-full shrink-0 border-t px-6 py-5 @2xl:w-64 @2xl:overflow-y-auto @2xl:border-t-0 @2xl:px-4">
                    <Fragment key={mode.epoch}>{aside}</Fragment>
                  </aside>
                </>
              )}
            </div>
          </div>
        </CurrentRecordContext.Provider>
      </DetailModeContext.Provider>
    </Card>
  )
}

/**
 * Record header actions in one fixed order (DetailPane, record sheets, record pages): pin/favourite →
 * module extras → (gap) → trash → «Редагувати» / «Скасувати»·«Зберегти» → ✕.
 * Narrower than @xl, the module extras take a second row of their own; trash, edit and ✕ stay on the right.
 * Without `onClose` (a record that is a page of its own) there is no ✕.
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
  onClose?: () => void
  className?: string
}): ReactElement {
  const trash = onDelete && (
    <IconAction size="icon-sm" label="У кошик" onClick={deleteConfirm ? undefined : onDelete}>
      <Trash2 />
    </IconAction>
  )
  return (
    // Wide: one row that never wraps — the extras shrink (a breadcrumb truncates) and wrap inside their own slot.
    // Narrow: the extras move to a full-width second row instead of drawing over «Редагувати» and the trash.
    <div
      className={cn(
        '@container/rec flex flex-wrap items-center gap-2 @xl/rec:flex-nowrap',
        className
      )}
    >
      <PinButtons entity={entity} />
      <div className="order-last flex min-w-0 basis-full flex-wrap items-center gap-2 empty:hidden @xl/rec:order-0 @xl/rec:basis-auto">
        {extra}
      </div>
      <div className="flex-1" />
      {onDelete && deleteConfirm ? (
        <Confirm
          {...deleteConfirm}
          confirmLabel={deleteConfirm.confirmLabel ?? 'У кошик'}
          onConfirm={onDelete}
        >
          {trash}
        </Confirm>
      ) : (
        trash
      )}
      {/* E edits, Esc leaves edit mode first and closes the record on the second press. */}
      <EditToggle mode={mode} onClose={onClose} />
      {onClose && (
        <IconAction
          size="icon-sm"
          label="Закрити"
          shortcut={mode.editing ? undefined : 'Esc'}
          data-close-detail={mode.editing ? undefined : true}
          onClick={() => (mode.confirmClose ? mode.confirmClose(onClose) : onClose())}
        >
          <X />
        </IconAction>
      )}
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
      {tags && onTagsChange && <TagsSection value={tags} onChange={onTagsChange} entity={entity} />}
      <LinksPanel entity={entity} />
      <MentionsPanel entity={entity} />
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
  className,
  align = 'center'
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
  /**
   * `top`: a grid card — the content is a column stretched to the row's full height (a footer can sit at the
   * bottom with mt-auto) instead of being centred vertically.
   */
  align?: 'center' | 'top'
}) {
  const top = align === 'top'
  return (
    <Item
      asChild
      variant={active ? 'active' : 'muted'}
      size="sm"
      className={cn(top && 'items-stretch', className)}
    >
      <button
        type="button"
        onClick={onClick}
        data-active={active || undefined}
        aria-current={active || undefined}
      >
        {/* overflow-wrap: one long word (a pasted URL, «аааа…») wraps instead of widening the row. */}
        <div className={cn('w-full min-w-0 wrap-anywhere', top && 'flex flex-col')}>{children}</div>
      </button>
    </Item>
  )
}
