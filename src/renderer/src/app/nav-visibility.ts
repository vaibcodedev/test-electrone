import {
  NAV_HUB_IDS,
  type NavHubId,
  type Settings,
  type SettingsPatch
} from '@shared/domain/system'
import { ALWAYS_SHOWN, HUBS, TOP_ITEMS, hubOf, isAt, type NavHub } from './navigation'

/**
 * «Налаштування → Меню»: which sidebar groups and items are switched off. Pure functions (no React), so the
 * rules are unit-tested; useNavVisibility reads them, useNavPrefs writes them. Only navigation surfaces are
 * filtered (sidebar, Ctrl+K sections, Alt+1…9, home tiles, weekly review, quick-add targets) — records stay in
 * search, links and direct routes.
 */
export interface NavPrefs {
  hiddenHubs: readonly string[]
  hiddenItems: readonly string[]
}

export const SHOW_ALL: NavPrefs = { hiddenHubs: [], hiddenItems: [] }

/** A sidebar group or a nav item path. */
export type NavPlace = { hub: NavHubId } | { item: string }

type NavPatch = Pick<SettingsPatch, 'hiddenNavHubs' | 'hiddenNavItems'>

const TOP_PATHS = new Set<string>(TOP_ITEMS.map((i) => i.path))
const KNOWN_ITEMS = new Set<string>([
  ...TOP_PATHS,
  ...HUBS.flatMap((h) => h.items.map((i) => i.path))
])
const KNOWN_HUBS = new Set<string>(NAV_HUB_IDS)

export function prefsOf(s: Pick<Settings, 'hiddenNavHubs' | 'hiddenNavItems'>): NavPrefs {
  return { hiddenHubs: s.hiddenNavHubs, hiddenItems: s.hiddenNavItems }
}

/** The hub with its shown items; null when the hub or all of its items are off. */
function shownHub(prefs: NavPrefs, hub: NavHub): NavHub | null {
  if (prefs.hiddenHubs.includes(hub.id)) return null
  const items = hub.items.filter((i) => !prefs.hiddenItems.includes(i.path))
  if (items.length === 0) return null
  return items.length === hub.items.length ? hub : { ...hub, items }
}

/** Shown hubs without the safety net: may be empty. */
function strictHubs(prefs: NavPrefs, hubs: NavHub[]): NavHub[] {
  return hubs.map((h) => shownHub(prefs, h)).filter((h): h is NavHub => h !== null)
}

/**
 * Hubs to render, each with its shown items. A hub whose items are all off counts as off. If nothing is
 * left (a hand-edited config.json), everything is shown: the menu is never empty.
 */
export function visibleHubs(prefs: NavPrefs, hubs: NavHub[] = HUBS): NavHub[] {
  const shown = strictHubs(prefs, hubs)
  return shown.length > 0 ? shown : hubs
}

export function isHubShown(prefs: NavPrefs, id: NavHubId): boolean {
  return visibleHubs(prefs).some((h) => h.id === id)
}

/** Hub whose items list this path. */
function ownerHub(path: string): NavHub | undefined {
  return HUBS.find((h) => h.items.some((i) => i.path === path))
}

/** An item is shown when its hub and the item are both on. A top item has only its own switch; unknown paths are shown. */
export function isItemShown(prefs: NavPrefs, path: string): boolean {
  if (TOP_PATHS.has(path)) return !prefs.hiddenItems.includes(path)
  if (ALWAYS_SHOWN.includes(path)) return true
  const overviewOf = HUBS.find((h) => h.overview === path)
  if (overviewOf) return isHubShown(prefs, overviewOf.id)
  if (!ownerHub(path)) return true
  return visibleHubs(prefs).some((h) => h.items.some((i) => i.path === path))
}

export function isPlaceShown(prefs: NavPrefs, place: NavPlace): boolean {
  return 'hub' in place ? isHubShown(prefs, place.hub) : isItemShown(prefs, place.item)
}

/** Record pages whose path doesn't start with their nav item. */
export const ROUTE_OWNERS: [prefix: string, place: NavPlace][] = [
  ['/cards/', { item: '/boards' }],
  ['/projects/', { item: '/clients' }],
  ['/freelance/proposal/', { hub: 'freelance' }],
  ['/freelance/p/', { hub: 'freelance' }]
]

/**
 * Owner of a route («/freelance/templates?open=x», ENTITY_META routes carry a query, which is dropped): hubOf()
 * and the most specific item of that hub. undefined — not a module page (/settings, /tags, /).
 */
export function placeOf(route: string): NavPlace | undefined {
  const noHash = route.split('#')[0]
  const [pathname] = noHash.split('?')
  const owner = ROUTE_OWNERS.find(([prefix]) => pathname.startsWith(prefix))
  if (owner) return owner[1]
  const top = TOP_ITEMS.find((i) => isAt(i.path, pathname))
  if (top) return { item: top.path }
  const hubId = hubOf(pathname)
  const hub = HUBS.find((h) => h.id === hubId)
  if (!hub) return undefined
  const best = hub.items
    .map((i) => i.path)
    .filter((p) => isAt(p, pathname))
    .sort((a, b) => b.length - a.length)[0]
  return best ? { item: best } : { hub: hub.id }
}

/** A record or page is hidden when its owning hub or item is off. Unknown routes are shown. */
export function isRouteShown(prefs: NavPrefs, route: string): boolean {
  const place = placeOf(route)
  return !place || isPlaceShown(prefs, place)
}

const uniq = (list: readonly string[], known: Set<string>): string[] =>
  [...new Set(list)].filter((x) => known.has(x))

/**
 * Switches a hub. Showing a hub whose items were all off (hand-edited config) shows its items too, or
 * the switch would do nothing; items switched off one by one otherwise stay off.
 */
export function hubPatch(prefs: NavPrefs, id: NavHubId, shown: boolean): NavPatch {
  if (!shown) return { hiddenNavHubs: uniq([...prefs.hiddenHubs, id], KNOWN_HUBS) }
  const hub = HUBS.find((h) => h.id === id)
  const hiddenNavHubs = uniq(
    prefs.hiddenHubs.filter((h) => h !== id),
    KNOWN_HUBS
  )
  if (hub && hub.items.every((i) => prefs.hiddenItems.includes(i.path))) {
    const own = new Set(hub.items.map((i) => i.path))
    return {
      hiddenNavHubs,
      hiddenNavItems: uniq(
        prefs.hiddenItems.filter((p) => !own.has(p)),
        KNOWN_ITEMS
      )
    }
  }
  return { hiddenNavHubs }
}

/**
 * Switches an item. Hiding the last shown item of a hub hides the hub instead (the item stays remembered
 * as shown, so turning the hub back on brings it back). Showing an item of a hidden hub shows the hub.
 */
export function itemPatch(prefs: NavPrefs, path: string, shown: boolean): NavPatch {
  const hub = ownerHub(path)
  if (shown) {
    const hiddenNavItems = uniq(
      prefs.hiddenItems.filter((p) => p !== path),
      KNOWN_ITEMS
    )
    if (hub && prefs.hiddenHubs.includes(hub.id))
      return {
        hiddenNavItems,
        hiddenNavHubs: uniq(
          prefs.hiddenHubs.filter((h) => h !== hub.id),
          KNOWN_HUBS
        )
      }
    return { hiddenNavItems }
  }
  if (hub) {
    const others = hub.items.filter((i) => i.path !== path && !prefs.hiddenItems.includes(i.path))
    if (others.length === 0) return hubPatch(prefs, hub.id, false)
  }
  return { hiddenNavItems: uniq([...prefs.hiddenItems, path], KNOWN_ITEMS) }
}

const apply = (prefs: NavPrefs, patch: NavPatch): NavPrefs => ({
  hiddenHubs: patch.hiddenNavHubs ?? prefs.hiddenHubs,
  hiddenItems: patch.hiddenNavItems ?? prefs.hiddenItems
})

/** false for the last shown hub: one section always stays in the menu (main refuses it too). */
export function canHideHub(prefs: NavPrefs, id: NavHubId): boolean {
  return strictHubs(apply(prefs, hubPatch(prefs, id, false)), HUBS).length > 0
}

/** false for the last shown item of the last shown hub; the last item of another hub hides that hub instead. */
export function canHideItem(prefs: NavPrefs, path: string): boolean {
  if (TOP_PATHS.has(path)) return true
  return strictHubs(apply(prefs, itemPatch(prefs, path, false)), HUBS).length > 0
}

/** Known hidden hubs and items (stale values from an older version don't count). */
export function hiddenCount(prefs: NavPrefs): number {
  return uniq(prefs.hiddenHubs, KNOWN_HUBS).length + uniq(prefs.hiddenItems, KNOWN_ITEMS).length
}
