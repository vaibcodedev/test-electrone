import type { Platform } from '@shared/domain/freelance'
import { hubOf, isAt, type NavHub } from '@/app/navigation'
import { useApi } from '@/lib/query'

export interface HubNav {
  /** The location belongs to this hub. */
  activeHub: boolean
  atOverview: boolean
  /** The most specific item of the hub at the location. */
  isActive: (path: string) => boolean
  /** aria-current for a link to this path. */
  current: (path: string) => 'page' | undefined
  /** Freelance only: platforms shown in the menu (archived ones are not). */
  platforms: Platform[]
  archivedCount: number
}

/** Where the location is inside one hub — shared by the expanded group and the folded flyout. */
export function useHubNav(hub: NavHub, pathname: string, search: string): HubNav {
  const { data: platforms = [] } = useApi('platforms', 'list', undefined, {
    enabled: !!hub.platforms
  })
  // Archived platforms are hidden from the menu but must stay reachable (restore lives on /freelance#archived).
  const { data: allPlatforms = [] } = useApi(
    'platforms',
    'list',
    { includeArchived: true },
    { enabled: !!hub.platforms }
  )
  const activeHub = hubOf(pathname, search) === hub.id
  // Items light up only in the hub that owns the location: cover-letter templates belong to «Пошук роботи»,
  // so «Фриланс → Шаблони» stays dim there although the pathname is the same.
  const matches = (path: string): boolean => activeHub && isAt(path, pathname, search)
  // Only the most specific match is active: on /dev/github, «GitHub» — not «Локальні проєкти» (/dev) too.
  const best = hub.items
    .map((i) => i.path)
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0]
  const isActive = (path: string): boolean => (path === best ? true : !best && matches(path))
  return {
    activeHub,
    atOverview: !!hub.overview && pathname === hub.overview,
    isActive,
    // Plain Link + explicit aria-current: NavLink marks by pathname alone, so on cover-letter templates both
    // «Фриланс → Шаблони» and «Пошук роботи → Шаблони листів» were the current page for a screen reader.
    current: (path) => (isActive(path) ? 'page' : undefined),
    platforms,
    archivedCount: allPlatforms.length - platforms.length
  }
}
