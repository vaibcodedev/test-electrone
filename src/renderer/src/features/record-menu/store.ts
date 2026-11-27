import { useSyncExternalStore } from 'react'
import type { RecordMenuDef } from './model'

/** Where the menu hangs: a point (right click) or the «⋯» button's box. */
export interface MenuAnchor {
  x: number
  y: number
  width: number
  height: number
}

export interface MenuRequest {
  seq: number
  /** The trigger that asked (its «⋯» stays visible and says «expanded» while the menu is open). */
  key: string
  // The host doesn't know the record's type: each request carries the declaration that does.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: RecordMenuDef<any, any>
  record: unknown
  ctx: unknown
  anchor: MenuAnchor
  align: 'start' | 'end'
  /** Where focus goes back when the menu closes without an action that moved it. */
  origin: HTMLElement
}

type Listener = () => void

let request: MenuRequest | null = null
let openKey: string | null = null
let seq = 0
const listeners = new Set<Listener>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Opens the record menu (one host for the whole window: features/record-menu/host.tsx). */
export function openRecordMenu(req: Omit<MenuRequest, 'seq'>): void {
  request = { ...req, seq: ++seq }
  openKey = req.key
  emit()
}

/** Which record it is, as far as the declaration can tell: its entity, else its `id`; null — no way to tell. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function identityOf(def: RecordMenuDef<any, any>, record: unknown): string | null {
  const ref = def.entity?.(record)
  if (ref) return `${ref.type}/${ref.id}`
  const id = (record as { id?: unknown } | null | undefined)?.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

/**
 * The trigger rendered again while its menu is open (the list refetched after a save): the menu takes the record
 * as the row shows it now — labels, ✓ and what the actions act on. Only while it is open: closing, the request
 * keeps the last record for the exit animation, even when the row is already gone (trashed, scrolled out of a
 * virtual list). A trigger that now shows another record (a row reused for another one) leaves the menu as it was.
 */
export function syncRecordMenu(
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: RecordMenuDef<any, any>,
  record: unknown,
  ctx: unknown
): void {
  const r = request
  if (!r || openKey !== key || r.key !== key || r.def !== def) return
  if (r.record === record && r.ctx === ctx) return
  if (identityOf(def, r.record) !== identityOf(def, record)) return
  request = { ...r, record, ctx }
  emit()
}

/** The host's side: the menu closed (it keeps the request for the exit animation). */
export function markRecordMenuClosed(closedSeq: number): void {
  // A newer request (another record's menu) is already open: its trigger stays «expanded».
  if (openKey === null || request?.seq !== closedSeq) return
  openKey = null
  emit()
}

export function useMenuRequest(): MenuRequest | null {
  return useSyncExternalStore(subscribe, () => request)
}

/** The menu of this trigger is open right now. */
export function useMenuOpenFor(key: string): boolean {
  return useSyncExternalStore(subscribe, () => openKey === key)
}

export function isMenuOpenFor(key: string): boolean {
  return openKey === key
}
