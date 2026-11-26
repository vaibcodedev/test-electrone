import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { EntityRef } from '@shared/domain/common'

/**
 * The record menu (right click and «⋯»): one declaration per kind of record, two ways to open it. A module
 * describes its actions with `defineRecordMenu`; the menu itself, its order of groups, pins, «Копіювати
 * посилання» and the «У кошик» focus handling are the same everywhere (docs/design-system.md §12).
 */

/** Asked before the action runs (a delete for good): the item's label gets «…». */
export interface ConfirmSpec {
  title: string
  description?: ReactNode
  confirmLabel: string
}

export interface MenuItemSpec {
  label: string
  icon?: LucideIcon
  /** Only a key that really does this where the menu opens. */
  shortcut?: string
  destructive?: boolean
  /** A choice in a submenu: true marks the current value (✓), false — another value. */
  checked?: boolean
  /** A tag's colour (null — a tag without one): its dot stands where an item has its icon. */
  dot?: string | null
  /**
   * An on/off state («Працює», «Вирішено»): the label names the state and never changes, ✓ at the end while it
   * is on (menuitemcheckbox). Not «Позначити…» / «Зняти позначку…».
   */
  on?: boolean
  confirm?: ConfirmSpec
  /** Runs after the menu has closed (a dialog it opens gets focus, not the fading menu). */
  run: () => unknown
}

export interface SubmenuSpec {
  label: string
  icon?: LucideIcon
  items: Entry[]
}

/** `false` / `null` / `undefined`: not offered for this record (hidden, never greyed out). */
export type Entry = MenuItemSpec | SubmenuSpec | false | null | undefined

/** The four groups, always in this order; empty ones are dropped. */
export interface RecordMenuGroups {
  /** «Відкрити» and the record's main quick action (copy the code, open the site…). */
  open?: Entry[]
  /** Status, column, priority, tags. */
  state?: Entry[]
  /** Copy-type extras, after the shared «Закріпити» / «В обране» / «Копіювати посилання». */
  share?: Entry[]
  /** «У кошик» and other destructive actions — always last. */
  danger?: Entry[]
}

export interface RecordMenuDef<T, C = undefined> {
  /** What the record is called (the «⋯» button's name: «Дії: <назва>»). */
  title: (record: T) => string
  /**
   * The record as an entity of the shared registry: pins, Обране and «Копіювати посилання» come with it.
   * Leave it out for rows that are not entities (a payment, a checklist item).
   */
  entity?: (record: T) => EntityRef | null
  /** Pins and Обране, when the entity supports them (default: both). */
  pins?: boolean
  /**
   * The actions. A hook: it runs only while the menu is open (mutations, queries — nothing per row of a long
   * list). `ctx` is what the row passes in (its own open handler, the board's columns…).
   */
  useGroups: (record: T, ctx: C) => RecordMenuGroups
}

export function defineRecordMenu<T, C = undefined>(def: RecordMenuDef<T, C>): RecordMenuDef<T, C> {
  return def
}

export const isSubmenu = (e: MenuItemSpec | SubmenuSpec): e is SubmenuSpec => 'items' in e

export type Shown = MenuItemSpec | (Omit<SubmenuSpec, 'items'> & { items: MenuItemSpec[] })

function present<T>(list: (T | false | null | undefined)[] | undefined): T[] {
  return (list ?? []).filter((e): e is T => !!e)
}

/** «Видалити назавжди…»: an item that asks first says so. */
export function shownLabel(item: MenuItemSpec): string {
  return item.confirm && !item.label.endsWith('…') ? `${item.label}…` : item.label
}

/**
 * The groups as the menu shows them: in the fixed order, the shared items in the third group, hidden items and
 * empty groups (and submenus) left out. At most four groups, one submenu level.
 */
export function menuGroups(groups: RecordMenuGroups, shared: Entry[] = []): Shown[][] {
  const order: Entry[][] = [
    groups.open ?? [],
    groups.state ?? [],
    [...shared, ...(groups.share ?? [])],
    groups.danger ?? []
  ]
  return order
    .map((group) =>
      present(group).flatMap((e): Shown[] => {
        if (!isSubmenu(e)) return [e]
        // A submenu inside a submenu is not offered: one level only.
        const items = present(e.items).filter((i): i is MenuItemSpec => !isSubmenu(i))
        return items.length ? [{ ...e, items }] : []
      })
    )
    .filter((g) => g.length > 0)
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
