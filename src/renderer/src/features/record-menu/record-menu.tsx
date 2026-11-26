import {
  createContext,
  useContext,
  useId,
  useRef,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { Ellipsis } from 'lucide-react'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { RecordMenuDef } from './model'
import { isMenuOpenFor, openRecordMenu, useMenuOpenFor, type MenuAnchor } from './store'

interface AreaContext {
  key: string
  title: () => string
  open: (anchor: MenuAnchor, align: 'start' | 'end', origin: HTMLElement) => void
}

const Area = createContext<AreaContext | null>(null)

/** The area's test hook and the text menu's sign that a record menu lives here (features/text-menu/dom.ts). */
export const RECORD_MENU_ATTR = 'data-record-menu'

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex="0"]'

function boxOf(el: Element): MenuAnchor {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

/** Shift+F10 and the Menu key fire `contextmenu` too, without a pointer: the menu then hangs from the element. */
function fromKeyboard(e: MouseEvent): boolean {
  const pointerType = (e.nativeEvent as PointerEvent).pointerType
  return pointerType === '' || (e.clientX === 0 && e.clientY === 0 && e.button === 0)
}

/**
 * A record's right-click menu (and the home of its «⋯»: RecordMenuButton inside). Wraps the row or tile in a
 * `div` (or, with `asChild`, becomes the element itself). Nothing is mounted per row: the menu is rendered by
 * the window's one host (host.tsx) and only while it is open.
 */
export function RecordMenu<T, C = undefined>({
  def,
  record,
  ctx,
  asChild,
  className,
  children,
  ...props
}: {
  def: RecordMenuDef<T, C>
  record: T
  ctx?: C
  asChild?: boolean
  className?: string
  children: ReactNode
} & Omit<ComponentProps<'div'>, 'children' | 'onContextMenu'>): ReactElement {
  const key = useId()
  const value: AreaContext = {
    key,
    title: () => def.title(record),
    open: (anchor, align, origin) =>
      openRecordMenu({ key, def, record, ctx, anchor, align, origin })
  }
  const { open } = value
  const Comp = asChild ? Slot.Root : 'div'
  return (
    <Area.Provider value={value}>
      <Comp
        {...props}
        {...{ [RECORD_MENU_ATTR]: '' }}
        // The text menu keeps a field or selected text inside a record (features/text-menu/dom.ts).
        data-context-menu-trigger=""
        className={cn('group/record-menu relative', className)}
        onContextMenu={(e: MouseEvent<HTMLElement>) => {
          // A record inside a record (a link row in a card): the innermost one answers.
          if (e.defaultPrevented) return
          e.preventDefault()
          const area = e.currentTarget
          const active = document.activeElement
          const focused = active instanceof HTMLElement && active !== document.body ? active : null
          const origin = focused ?? area.querySelector<HTMLElement>(FOCUSABLE) ?? area
          if (fromKeyboard(e)) {
            open(boxOf(focused && area.contains(focused) ? focused : area), 'start', origin)
            return
          }
          open({ x: e.clientX, y: e.clientY, width: 0, height: 0 }, 'start', origin)
        }}
      >
        {children}
      </Comp>
    </Area.Provider>
  )
}

/**
 * «⋯» of a row or tile: the same menu as the right click. A sibling of the row's own button or link (never
 * inside it), absolutely placed by `className`; the row keeps room for it (no content under it). Shown on hover,
 * on keyboard focus anywhere in the row and while its menu is open.
 */
export function RecordMenuButton({
  className,
  onInk,
  alwaysVisible
}: {
  className?: string
  /** On an ink (selected) row. */
  onInk?: boolean
  /** Always shown (a row without hover, a touch screen…). */
  alwaysVisible?: boolean
}): ReactElement | null {
  const area = useContext(Area)
  const expanded = useMenuOpenFor(area?.key ?? '')
  // A press on «⋯» while its menu is open closes the menu (outside press) — the click must not reopen it.
  const wasOpen = useRef(false)
  if (!area) return null
  const label = `Дії: ${area.title()}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={expanded}
          data-record-menu-button=""
          className={cn(
            'z-10 [&_svg]:size-4',
            !alwaysVisible &&
              'opacity-0 transition-opacity group-focus-within/record-menu:opacity-100 group-hover/record-menu:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100',
            onInk
              ? 'text-ink-foreground hover:bg-ink-foreground/12 aria-expanded:bg-ink-foreground/12'
              : 'text-muted-foreground hover:text-foreground aria-expanded:bg-foreground/10 aria-expanded:text-foreground',
            className
          )}
          onPointerDown={() => {
            wasOpen.current = isMenuOpenFor(area.key)
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (wasOpen.current) {
              wasOpen.current = false
              return
            }
            const button = e.currentTarget
            area.open(boxOf(button), 'end', button)
          }}
          // Its own menu, not the row's right click on top of it.
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const button = e.currentTarget
            area.open(boxOf(button), 'end', button)
          }}
        >
          <Ellipsis />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Дії</TooltipContent>
    </Tooltip>
  )
}

/** A row's menu handed to a shared row component (ListItem): the declaration with its record and context. */
export interface RecordMenuBinding {
  // The row component doesn't know the record's type; bindMenu checked it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: RecordMenuDef<any, any>
  record: unknown
  ctx?: unknown
}

export function bindMenu<T, C = undefined>(
  def: RecordMenuDef<T, C>,
  record: T,
  ...ctx: C extends undefined ? [] : [C]
): RecordMenuBinding {
  return { def, record, ctx: ctx[0] }
}

/**
 * A tile or card with the record menu: right click anywhere on it, «⋯» in its top right corner (the tile keeps
 * room for it: `pr-10` on its first line). The tile itself stays the clickable element; «⋯» is its sibling.
 */
export function RecordMenuTile({
  menu,
  onInk,
  className = 'h-full',
  buttonClassName = 'absolute top-3 right-3',
  children
}: {
  menu: RecordMenuBinding
  onInk?: boolean
  className?: string
  buttonClassName?: string
  children: ReactNode
}): ReactElement {
  return (
    <RecordMenu def={menu.def} record={menu.record} ctx={menu.ctx} className={className}>
      {children}
      <RecordMenuButton onInk={onInk} className={buttonClassName} />
    </RecordMenu>
  )
}
