import { useCallback, useMemo } from 'react'
import { TOP_ITEMS, navOrder, type NavHub, type NavItem } from '@/app/navigation'
import {
  SHOW_ALL,
  hiddenCount,
  isItemShown,
  isPlaceShown,
  isRouteShown,
  prefsOf,
  visibleHubs,
  type NavPlace,
  type NavPrefs
} from '@/app/nav-visibility'
import { useApi } from '@/lib/query'

export interface NavVisibility {
  prefs: NavPrefs
  /** Hubs to render, each with its shown items. */
  hubs: NavHub[]
  /** Palette «Розділи» and Alt+1…9, in the order the sidebar shows them. */
  order: NavItem[]
  /** Shown items above the hubs («Календар», «Підсумки тижня»). */
  topItems: NavItem[]
  /** A place or an item path. */
  isShown: (place: NavPlace | string) => boolean
  isRouteShown: (route: string) => boolean
  hiddenCount: number
}

/**
 * The one reader of «Налаштування → Меню». Every navigation surface filters through it; data never does.
 * Plain settings.get (no `select`: useApi fixes TData to Settings) — TanStack's structural sharing keeps
 * both arrays the same references between refetches, so the memo below recomputes only on a real change.
 * Until the settings load, everything is shown.
 */
export function useNavVisibility(): NavVisibility {
  const { data } = useApi('settings', 'get')
  const hubsHidden = data?.hiddenNavHubs
  const itemsHidden = data?.hiddenNavItems
  const prefs = useMemo<NavPrefs>(
    () =>
      hubsHidden && itemsHidden
        ? prefsOf({ hiddenNavHubs: hubsHidden, hiddenNavItems: itemsHidden })
        : SHOW_ALL,
    [hubsHidden, itemsHidden]
  )
  const hubs = useMemo(() => visibleHubs(prefs), [prefs])
  const topItems = useMemo(() => TOP_ITEMS.filter((i) => isItemShown(prefs, i.path)), [prefs])
  const order = useMemo(() => navOrder(hubs, topItems), [hubs, topItems])
  const isShown = useCallback(
    (place: NavPlace | string) =>
      typeof place === 'string' ? isItemShown(prefs, place) : isPlaceShown(prefs, place),
    [prefs]
  )
  const routeShown = useCallback((route: string) => isRouteShown(prefs, route), [prefs])
  return {
    prefs,
    hubs,
    order,
    topItems,
    isShown,
    isRouteShown: routeShown,
    hiddenCount: hiddenCount(prefs)
  }
}
