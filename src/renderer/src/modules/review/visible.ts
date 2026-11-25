import { ENTITY_META } from '@shared/entity-types'
import type { EntitySummary } from '@shared/domain/common'
import type { WeekSnapshot } from '@shared/domain/review'
import { isPlaceShown, isRouteShown, type NavPlace, type NavPrefs } from '@/app/nav-visibility'

/**
 * Metric key (weekly-review-service.ts) → the menu place it belongs to. A key not listed here stays visible:
 * a metric added in main shows up by default.
 */
export const METRIC_PLACE: Record<string, NavPlace> = {
  cardsDone: { item: '/boards' },
  checksDone: { item: '/checklists' },
  minutes: { item: '/clients' },
  ideas: { item: '/ideas' },
  notes: { item: '/notes' },
  proposals: { hub: 'freelance' },
  proposalReplies: { hub: 'freelance' },
  contracts: { item: '/clients' },
  credits: { hub: 'freelance' },
  applications: { item: '/jobs/applications' },
  appReplies: { item: '/jobs/applications' },
  interviews: { item: '/jobs/interviews' },
  offers: { item: '/jobs/applications' },
  words: { item: '/english' },
  questions: { item: '/jobs/questions' },
  bookmarksDone: { item: '/bookmarks' },
  commits: { item: '/dev' }
}

const routeOf = (e: EntitySummary & { route?: string }): string =>
  e.route ?? ENTITY_META[e.type].route(e.id)

/**
 * The week as the menu shows it: metrics, sections, money, pending, done and upcoming of switched-off sections
 * drop out. Only the view is filtered — the frozen snapshot in the database is not touched.
 */
export function visibleSnapshot(s: WeekSnapshot, prefs: NavPrefs): WeekSnapshot {
  const metricShown = (key: string): boolean => {
    const place = METRIC_PLACE[key]
    return !place || isPlaceShown(prefs, place)
  }
  const money = isPlaceShown(prefs, { hub: 'finance' })
    ? s.money
    : { net: {}, expenses: {}, profit: {} }
  return {
    ...s,
    sections: s.sections
      .filter((x) => x.id !== 'money' || isPlaceShown(prefs, { hub: 'finance' }))
      // A section whose every metric went with hidden places drops out (not into «Без змін…»).
      .flatMap((x) => {
        const metrics = x.metrics.filter((m) => metricShown(m.key))
        return metrics.length > 0 || x.metrics.length === 0 ? [{ ...x, metrics }] : []
      }),
    money,
    pending: s.pending
      .map((g) => ({ ...g, items: g.items.filter((i) => isRouteShown(prefs, routeOf(i))) }))
      .filter((g) => g.items.length > 0),
    done: s.done.filter((i) => isRouteShown(prefs, routeOf(i))),
    upcoming: s.upcoming.filter((u) => isRouteShown(prefs, u.route))
  }
}
