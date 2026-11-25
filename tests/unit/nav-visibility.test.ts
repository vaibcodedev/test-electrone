/** «Налаштування → Меню»: which sidebar sections are shown, what Alt+N opens, and what the week review keeps. */
import { describe, expect, it } from 'vitest'
import { NAV_HUB_IDS, hidesEveryHub } from '@shared/domain/system'
import type { WeekSnapshot } from '@shared/domain/review'
import { HUBS, navOrder } from '@/app/navigation'
import {
  SHOW_ALL,
  canHideHub,
  canHideItem,
  hiddenCount,
  hubPatch,
  isRouteShown,
  itemPatch,
  placeOf,
  visibleHubs,
  type NavPrefs
} from '@/app/nav-visibility'
import { visibleSnapshot } from '@/modules/review/visible'

const prefs = (
  hiddenHubs: readonly string[] = [],
  hiddenItems: readonly string[] = []
): NavPrefs => ({
  hiddenHubs,
  hiddenItems
})
const ids = (p: NavPrefs): string[] => visibleHubs(p).map((h) => h.id)
const ONLY_WORK_DEV_INSPIRATION = prefs(['freelance', 'jobs', 'finance', 'knowledge'])

describe('visibleHubs', () => {
  it('shows every hub by default', () => {
    expect(visibleHubs(SHOW_ALL)).toEqual(HUBS)
  })

  it('HUBS and the ids main knows are the same list', () => {
    expect(HUBS.map((h) => h.id)).toEqual([...NAV_HUB_IDS])
  })

  it('drops a hidden hub and hidden items', () => {
    expect(ids(prefs(['jobs']))).not.toContain('jobs')
    const work = visibleHubs(prefs([], ['/calendar'])).find((h) => h.id === 'work')
    expect(work?.items.map((i) => i.path)).toEqual(['/ideas', '/boards', '/checklists'])
  })

  it('a hub with all its items hidden is hidden too', () => {
    expect(ids(prefs([], ['/dev', '/dev/github']))).not.toContain('dev')
  })

  it('everything hidden (hand-edited config) shows everything', () => {
    expect(visibleHubs(prefs([...NAV_HUB_IDS]))).toEqual(HUBS)
  })

  it('ignores unknown ids and paths', () => {
    expect(visibleHubs(prefs(['nope'], ['/nowhere']))).toEqual(HUBS)
    expect(hiddenCount(prefs(['nope', 'jobs'], ['/nowhere', '/review']))).toBe(2)
  })
})

describe('navOrder (palette and Alt+1…9)', () => {
  it('follows the menu the user sees', () => {
    const order = navOrder(visibleHubs(ONLY_WORK_DEV_INSPIRATION)).map((i) => i.path)
    expect(order).toEqual([
      '/',
      '/review',
      '/ideas',
      '/boards',
      '/calendar',
      '/checklists',
      '/dev',
      '/dev/github',
      '/designs',
      '/bookmarks',
      '/english',
      '/guide'
    ])
    expect(order[3 - 1]).toBe('/ideas')
    expect(order[7 - 1]).toBe('/dev')
  })

  it('without «Підсумки тижня» Alt+2 opens Ідеї', () => {
    const order = navOrder(visibleHubs(ONLY_WORK_DEV_INSPIRATION), false).map((i) => i.path)
    expect(order[2 - 1]).toBe('/ideas')
  })
})

describe('patches and limits', () => {
  it('hiding the last shown item of a hub hides the hub instead', () => {
    const p = prefs([], ['/dev'])
    expect(itemPatch(p, '/dev/github', false)).toEqual({ hiddenNavHubs: ['dev'] })
  })

  it('showing an item of a hidden hub shows the hub', () => {
    expect(itemPatch(prefs(['dev']), '/dev/github', true)).toEqual({
      hiddenNavItems: [],
      hiddenNavHubs: []
    })
  })

  it('items hidden one by one stay hidden when the hub comes back', () => {
    expect(hubPatch(prefs(['work'], ['/calendar']), 'work', true)).toEqual({ hiddenNavHubs: [] })
  })

  it('patches carry no duplicates and no unknown values', () => {
    expect(hubPatch(prefs(['jobs', 'jobs', 'nope']), 'jobs', false)).toEqual({
      hiddenNavHubs: ['jobs']
    })
    expect(itemPatch(prefs([], ['/x', '/calendar']), '/calendar', false)).toEqual({
      hiddenNavItems: ['/calendar']
    })
  })

  it('the last shown hub and its last item cannot be hidden', () => {
    const one = prefs(NAV_HUB_IDS.filter((id) => id !== 'dev'))
    expect(canHideHub(one, 'dev')).toBe(false)
    expect(canHideHub(SHOW_ALL, 'dev')).toBe(true)
    expect(canHideItem(prefs(one.hiddenHubs, ['/dev']), '/dev/github')).toBe(false)
    // In another hub the last item just takes its hub along.
    expect(canHideItem(prefs([], ['/dev']), '/dev/github')).toBe(true)
    expect(canHideItem(one, '/review')).toBe(true)
  })

  it('main refuses a patch hiding every hub', () => {
    expect(hidesEveryHub([...NAV_HUB_IDS])).toBe(true)
    expect(hidesEveryHub(NAV_HUB_IDS.slice(1))).toBe(false)
  })
})

describe('placeOf / isRouteShown', () => {
  it('record pages follow their section', () => {
    expect(isRouteShown(prefs([], ['/boards']), '/cards/x')).toBe(false)
    expect(isRouteShown(prefs(['freelance']), '/projects/x')).toBe(false)
    expect(isRouteShown(prefs(['freelance']), '/freelance/p/x')).toBe(false)
    expect(isRouteShown(prefs(['work']), '/ideas?open=1')).toBe(false)
  })

  it('pages outside the menu are always shown', () => {
    const all = prefs(NAV_HUB_IDS.slice(1), ['/review'])
    expect(isRouteShown(all, '/settings')).toBe(true)
    expect(isRouteShown(all, '/tags')).toBe(true)
    expect(isRouteShown(all, '/')).toBe(true)
  })

  it('splits the query: cover-letter templates belong to «Пошук роботи»', () => {
    expect(placeOf('/freelance/templates?situation=cover_letter')).toEqual({
      item: '/freelance/templates?situation=cover_letter'
    })
    expect(placeOf('/freelance/templates?open=x')).toEqual({ item: '/freelance/templates' })
    expect(placeOf('/dev/github')).toEqual({ item: '/dev/github' })
    expect(placeOf('/jobs')).toEqual({ hub: 'jobs' })
    expect(placeOf('/review?week=2026-11-16')).toEqual({ item: '/review' })
  })
})

describe('visibleSnapshot', () => {
  const snapshot: WeekSnapshot = {
    weekStart: '2026-11-16',
    from: 0,
    to: 1,
    sections: [
      {
        id: 'work',
        title: 'Робота',
        metrics: [
          {
            key: 'cardsDone',
            label: 'Завдань',
            value: 2,
            previous: 1,
            unit: 'count',
            better: 'up'
          },
          { key: 'future', label: 'Нове', value: 1, previous: 0, unit: 'count', better: 'up' }
        ]
      },
      {
        id: 'jobs',
        title: 'Пошук роботи',
        metrics: [
          {
            key: 'applications',
            label: 'Відгуків',
            value: 3,
            previous: 0,
            unit: 'count',
            better: 'up'
          }
        ]
      }
    ],
    money: { net: { UAH: 100 }, expenses: {}, profit: { UAH: 100 } },
    pending: [
      { title: 'Без відповіді', items: [{ type: 'application', id: 'a', title: 'Vacancy' }] },
      { title: 'Прострочено', items: [{ type: 'card', id: 'c', title: 'Card' }] }
    ],
    done: [{ type: 'card', id: 'c2', title: 'Done' }],
    upcoming: [{ title: 'Interview', at: 1, route: '/jobs/interviews' }]
  }

  it('drops metrics, sections, money and pending of hidden places; unknown metrics stay', () => {
    const v = visibleSnapshot(snapshot, prefs(['jobs', 'finance'], ['/boards']))
    expect(v.sections.map((s) => s.id)).toEqual(['work'])
    expect(v.sections[0].metrics.map((m) => m.key)).toEqual(['future'])
    expect(v.money).toEqual({ net: {}, expenses: {}, profit: {} })
    expect(v.pending).toEqual([])
    expect(v.done).toEqual([])
    expect(v.upcoming).toEqual([])
  })

  it('shows everything with nothing hidden', () => {
    expect(visibleSnapshot(snapshot, SHOW_ALL)).toEqual(snapshot)
  })
})
