import { createContext, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  Link2,
  Pin,
  PinOff,
  SquareArrowOutUpRight,
  Star,
  StarOff,
  Tags,
  Trash2
} from 'lucide-react'
import type { ApiNamespace } from '@shared/api'
import type { EntityRef, Tag } from '@shared/domain/common'
import { wikiLink } from '@shared/wikilinks'
import { ENTITY_META } from '@shared/entity-types'
import { toast } from 'sonner'
import { call, type ArgOf, type MethodOf } from '@/lib/api'
import { invalidateAll, useApi, useApiMutation } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { useUi } from '@/stores/ui-store'
import { copyText } from '@/components/common/copy-button'
import { toastPinToggled } from '@/components/common/pin-buttons'
import { toastTrashed } from '@/components/common/trash-toast'
import type { Entry, MenuItemSpec, SubmenuSpec } from './model'

/** The open menu: where it was opened from (focus goes there, or next to it once the record is gone). */
export interface MenuSession {
  origin: HTMLElement
}

export const MenuSessionContext = createContext<MenuSession | null>(null)

export function useMenuSession(): MenuSession {
  const s = useContext(MenuSessionContext)
  if (!s) throw new Error('useMenuSession outside the record menu')
  return s
}

/* ───────── focus after a record leaves the list ───────── */

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex="0"]'

/**
 * Where focus goes once the row the menu came from is gone (trashed): the row after it (before it at the end),
 * else the page heading. Taken before the delete. Only when focus fell with the row: a click elsewhere wins.
 */
export function focusAfterRemoval(origin: HTMLElement): () => void {
  const row =
    origin.closest<HTMLElement>('[data-index]') ?? origin.closest<HTMLElement>('[data-record-menu]')
  const near = [row?.nextElementSibling, row?.previousElementSibling]
    .map((r) =>
      r?.matches(FOCUSABLE) ? (r as HTMLElement) : r?.querySelector<HTMLElement>(FOCUSABLE)
    )
    .find(Boolean)
  return () => {
    let tries = 0
    const tick = (): void => {
      // The list drops the row on its refetch, a moment after the delete answered.
      if (origin.isConnected && tries++ < 60) return void requestAnimationFrame(tick)
      const active = document.activeElement
      const lost = !active || active === document.body || active === origin || !active.isConnected
      if (!lost) return
      if (near?.isConnected) return near.focus({ preventScroll: true })
      const heading = document.querySelector<HTMLElement>('[data-slot="page-header"] h1')
      heading?.focus({ focusVisible: false } as FocusOptions)
    }
    requestAnimationFrame(tick)
  }
}

/* ───────── shared items ───────── */

/** «Відкрити»: the row's own handler (a sheet, a pane) or the record's address. */
export function useOpenItem(ref: EntityRef | null, onOpen?: () => void): MenuItemSpec | null {
  // Not useOpenEntity: components/common/entity-link renders this menu, an import back would be a cycle.
  const navigate = useNavigate()
  if (!onOpen && !ref) return null
  return {
    label: 'Відкрити',
    icon: SquareArrowOutUpRight,
    run: () => (onOpen ? onOpen() : ref && navigate(ENTITY_META[ref.type].route(ref.id)))
  }
}

/**
 * «У кошик» with «Скасувати» in the toast. The row fades out like the pane's own trash, the pane of this record
 * closes, focus moves to the next row.
 */
export function useTrashItem<N extends ApiNamespace>(
  ns: N,
  ref: EntityRef,
  message: string,
  method: MethodOf<N> = 'remove' as MethodOf<N>
): MenuItemSpec {
  const { origin } = useMenuSession()
  // The data router's setter: still valid after the menu (and this hook) unmounted.
  const [, setParams] = useSearchParams()
  return {
    label: 'У кошик',
    icon: Trash2,
    destructive: true,
    run: () => {
      const refocus = focusAfterRemoval(origin)
      const { setLeaving, bumpTrash } = useUi.getState()
      setLeaving(ref.id, true)
      // Not a mutation hook: the menu is gone by the time the delete answers, and a hook's per-call callbacks
      // would never run.
      setTimeout(() => {
        // The record was open beside the list: its pane goes with it (the same as its own trash button).
        setParams(
          (prev) => {
            if (prev.get('open') !== ref.id) return prev
            const next = new URLSearchParams(prev)
            next.delete('open')
            return next
          },
          { replace: true }
        )
        call(ns, method, ref.id as ArgOf<N, MethodOf<N>>).then(
          () => {
            invalidateAll()
            bumpTrash()
            toastTrashed(message, ref)
            refocus()
            setTimeout(() => setLeaving(ref.id, false), 400)
          },
          (e: unknown) => {
            setLeaving(ref.id, false)
            toast.error(e instanceof Error ? e.message : 'Не вдалося перемістити в кошик', {
              duration: 8000
            })
            reportError(e, 'record-menu:trash')
          }
        )
      }, 200)
    }
  }
}

/** «Закріпити на головній», «В обране», «Копіювати посилання» — added by the menu for every entity. */
export function useSharedItems(ref: EntityRef | null, title: string, pins: boolean): Entry[] {
  const on = !!ref && pins
  const pinned = useApi('pins', 'refs', 'pin', { enabled: on })
  const favorites = useApi('pins', 'refs', 'favorite', { enabled: on })
  const toggle = useApiMutation('pins', 'toggle', {
    onSuccess: (state, { kind }) => toastPinToggled(state, kind)
  })
  if (!ref) return []
  const has = (list: EntityRef[] | undefined): boolean | undefined =>
    list && list.some((r) => r.type === ref.type && r.id === ref.id)
  const isPinned = on ? has(pinned.data) : undefined
  const isFavorite = on ? has(favorites.data) : undefined
  return [
    // Shown once the state is known: a label that flips a moment later would be the wrong one to click.
    isPinned !== undefined && {
      label: isPinned ? 'Відкріпити з головної' : 'Закріпити на головній',
      icon: isPinned ? PinOff : Pin,
      run: () => toggle.mutate({ ref, kind: 'pin' })
    },
    isFavorite !== undefined && {
      label: isFavorite ? 'Прибрати з обраного' : 'В обране',
      icon: isFavorite ? StarOff : Star,
      run: () => toggle.mutate({ ref, kind: 'favorite' })
    },
    {
      label: 'Копіювати посилання',
      icon: Link2,
      run: () => void copyText(wikiLink(ref, title), 'Посилання скопійовано')
    }
  ]
}

/**
 * «Мітки ›»: every tag with a ✓ on the record's own; a choice adds or takes off that one tag (the module's update
 * with the new tagIds). Hidden when there are no tags at all.
 */
export function useTagsSubmenu(
  current: Tag[],
  save: (tagIds: string[]) => void
): SubmenuSpec | null {
  const { data: all } = useApi('tags', 'list')
  if (!all?.length) return null
  const mine = new Set(current.map((t) => t.id))
  return {
    label: 'Мітки',
    icon: Tags,
    items: all.map((t) => ({
      label: t.name,
      checked: mine.has(t.id),
      run: () =>
        save(
          mine.has(t.id) ? current.filter((c) => c.id !== t.id).map((c) => c.id) : [...mine, t.id]
        )
    }))
  }
}

/** A submenu of choices (status, priority…), the current one marked. */
export function choiceSubmenu<V extends string | number>(
  label: string,
  icon: SubmenuSpec['icon'],
  values: readonly V[],
  current: V,
  name: (v: V) => string,
  choose: (v: V) => void
): SubmenuSpec {
  return {
    label,
    icon,
    items: values.map((v) => ({
      label: name(v),
      checked: v === current,
      run: () => v !== current && choose(v)
    }))
  }
}
