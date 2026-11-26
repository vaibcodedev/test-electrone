/**
 * Shared look of DropdownMenu and ContextMenu (docs/design-system.md §2 and §4), so the two never drift apart.
 * The highlighted item is a calm fill without a ring: Radix focuses the item under the pointer too, and a
 * `focus-visible` ring showed up or not depending on how the menu was opened.
 */

/** Surface of a menu and of its submenu: radius 18 around 12 px items with 6 px padding (concentric). */
export const MENU_SURFACE = 'rounded-xl border bg-popover p-1.5 text-popover-foreground'

/** Submenu position: its first item stands level with the row that opened it (padding 6 + border 1). */
export const SUBMENU_OFFSET = { sideOffset: 8, alignOffset: -7 } as const

const ROW =
  "relative flex min-h-8 cursor-default items-center gap-2.5 rounded-md py-1.5 text-body outline-hidden select-none focus:bg-foreground/9 focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const MUTED_ICONS = "[&_svg:not([class*='text-'])]:text-muted-foreground"

export const MENU_ITEM = `${ROW} ${MUTED_ICONS} px-2.5 data-inset:pl-9 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/12 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:text-destructive!`

export const MENU_SUB_TRIGGER = `${ROW} ${MUTED_ICONS} px-2.5 data-inset:pl-9 data-[state=open]:bg-foreground/9`

/** Checkbox and radio items: the mark sits where other items keep their icon. */
export const MENU_CHOICE_ITEM = `${ROW} pr-2.5 pl-9`

export const MENU_CHOICE_MARK =
  'pointer-events-none absolute left-2.5 flex size-4 items-center justify-center'

export const MENU_LABEL = 'px-2.5 py-1.5 text-caption font-medium text-muted-foreground data-inset:pl-9'

export const MENU_SEPARATOR = '-mx-1.5 my-1.5 h-px bg-border'

export const MENU_SHORTCUT = 'ml-auto pl-4 text-meta text-muted-foreground'
