import { Fragment, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { reportError } from '@/lib/error-reporting'
import { Confirm } from '@/components/common/confirm'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { MenuSessionContext, useSharedItems, type MenuSession } from './actions'
import { menuGroups, shownLabel, type MenuItemSpec, type Shown } from './model'
import { markRecordMenuClosed, useMenuRequest, type MenuRequest } from './store'

/** The menu's own content (also the test hook). */
export const RECORD_MENU_CONTENT = 'data-record-menu-content'

function runSafely(item: MenuItemSpec): void {
  try {
    const result = item.run()
    if (result instanceof Promise) result.catch((e) => reportError(e, 'record-menu'))
  } catch (e) {
    reportError(e, 'record-menu')
  }
}

function Item({
  item,
  onChoose
}: {
  item: MenuItemSpec
  onChoose: (i: MenuItemSpec) => void
}): ReactElement {
  const label = <span className="min-w-0 flex-1 truncate">{shownLabel(item)}</span>
  if (item.checked !== undefined) {
    return (
      <DropdownMenuCheckboxItem checked={item.checked} onSelect={() => onChoose(item)}>
        {label}
      </DropdownMenuCheckboxItem>
    )
  }
  const Icon = item.icon
  return (
    <DropdownMenuItem
      variant={item.destructive ? 'destructive' : 'default'}
      inset={!Icon}
      onSelect={() => onChoose(item)}
    >
      {Icon && <Icon />}
      {label}
      {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  )
}

/** The groups of one request: the declaration's hook runs here, only while the menu is open. */
function Body({
  req,
  onChoose
}: {
  req: MenuRequest
  onChoose: (i: MenuItemSpec) => void
}): ReactElement {
  const ref = req.def.entity?.(req.record) ?? null
  const title = req.def.title(req.record)
  const shared = useSharedItems(ref, title, req.def.pins !== false)
  const groups: Shown[][] = menuGroups(req.def.useGroups(req.record, req.ctx), shared)
  return (
    <>
      {groups.map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <DropdownMenuSeparator />}
          {group.map((entry) =>
            'items' in entry ? (
              <DropdownMenuSub key={entry.label}>
                <DropdownMenuSubTrigger inset={!entry.icon}>
                  {entry.icon && <entry.icon />}
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                </DropdownMenuSubTrigger>
                {/* A long list (every tag) scrolls inside the window instead of running off it. */}
                <DropdownMenuSubContent className="max-h-(--radix-dropdown-menu-content-available-height) max-w-72 min-w-44 overflow-y-auto">
                  {entry.items.map((item) => (
                    <Item key={item.label} item={item} onChoose={onChoose} />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <Item key={entry.label} item={entry} onChoose={onChoose} />
            )
          )}
        </Fragment>
      ))}
    </>
  )
}

/**
 * The record menu of the whole window (right click on a record and its «⋯», features/record-menu/record-menu.tsx).
 * One DropdownMenu hanging from the point or the button: its root stays mounted, so Radix knows whether the
 * keyboard opened it (Shift+F10, Enter on «⋯» → the first item gets focus). The request is kept through the exit
 * animation, even when the row itself is already gone (trashed, scrolled out of a virtual list).
 * Mounted inside the router: actions navigate.
 */
export function RecordMenuHost(): ReactElement {
  const req = useMenuRequest()
  // The request the menu is open for: a new one (a right click on another record) moves the menu there.
  const [openSeq, setOpenSeq] = useState<number | null>(null)
  const open = !!req && openSeq === req.seq
  const setOpen = (o: boolean): void => setOpenSeq(o && req ? req.seq : null)
  // Kept after closing, so the dialog fades out with its text (never cleared in onOpenChange).
  const [confirming, setConfirming] = useState<{ item: MenuItemSpec; origin: HTMLElement } | null>(
    null
  )
  const [confirmOpen, setConfirmOpen] = useState(false)
  const chosen = useRef<MenuItemSpec | null>(null)
  const outside = useRef(false)
  const opened = useRef(0)
  const finished = useRef(0)
  const content = useRef<HTMLDivElement | null>(null)

  // Closed: focus goes back where it was (unless a click elsewhere took it), then the chosen action runs — so a
  // sheet or dialog it opens keeps its focus, and a late Radix restore can't take it away. Declared before the
  // opening effect: a request that has not opened yet is not «closed».
  useEffect(() => {
    if (!req || open || opened.current !== req.seq || finished.current === req.seq) return
    finished.current = req.seq
    markRecordMenuClosed(req.seq)
    const item = chosen.current
    chosen.current = null
    if (!outside.current && req.origin.isConnected) req.origin.focus({ preventScroll: true })
    if (!item) return
    if (item.confirm) {
      setConfirming({ item, origin: req.origin })
      setConfirmOpen(true)
    } else runSafely(item)
  }, [open, req])

  useEffect(() => {
    if (!req || opened.current === req.seq) return
    opened.current = req.seq
    chosen.current = null
    outside.current = false
    setOpenSeq(req.seq)
  }, [req])

  const session = useMemo<MenuSession | null>(() => (req ? { origin: req.origin } : null), [req])

  // The page scrolls under an open menu: the menu would float away from its record, so it closes.
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event): void => {
      if (e.target instanceof Node && content.current?.contains(e.target)) return
      outside.current = true
      setOpenSeq(null)
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  const a = req?.anchor
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed"
            style={{
              left: a?.x ?? 0,
              top: a?.y ?? 0,
              width: a?.width ?? 0,
              height: a?.height ?? 0
            }}
          />
        </DropdownMenuTrigger>
        {req && session && (
          <DropdownMenuContent
            key={req.seq}
            ref={content}
            {...{ [RECORD_MENU_CONTENT]: '' }}
            loop
            side="bottom"
            align={req.align}
            sideOffset={req.anchor.height ? 4 : 2}
            aria-label={`Дії: ${req.def.title(req.record)}`}
            aria-labelledby={undefined}
            // Fading out it is inert: a row under a moving pointer would take focus back from the record.
            inert={!open}
            className="max-w-80 min-w-56"
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={() => {
              outside.current = true
            }}
          >
            <MenuSessionContext.Provider value={session}>
              <Body
                req={req}
                onChoose={(item) => {
                  chosen.current = item
                }}
              />
            </MenuSessionContext.Provider>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
      {confirming?.item.confirm && (
        <Confirm
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirming.item.confirm.title}
          description={confirming.item.confirm.description}
          confirmLabel={confirming.item.confirm.confirmLabel}
          tone={confirming.item.destructive ? 'destructive' : 'default'}
          onConfirm={() => runSafely(confirming.item)}
          onCloseAutoFocus={(e) => {
            // Back to the record (its action may move focus on once the record is gone).
            e.preventDefault()
            if (confirming.origin.isConnected) confirming.origin.focus({ preventScroll: true })
          }}
        />
      )}
    </>
  )
}
