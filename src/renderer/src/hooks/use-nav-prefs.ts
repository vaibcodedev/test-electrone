import { useCallback } from 'react'
import { toast } from 'sonner'
import type { NavHubId, Settings, SettingsPatch } from '@shared/domain/system'
import { hubPatch, itemPatch, prefsOf, type NavPlace, type NavPrefs } from '@/app/nav-visibility'
import { queryClient, useApiMutation } from '@/lib/query'

type NavPatch = Pick<SettingsPatch, 'hiddenNavHubs' | 'hiddenNavItems'>

/** useApi('settings', 'get') caches under this key (arg undefined → null). */
const SETTINGS_KEY = ['settings', 'get', null] as const

export interface NavPrefsActions {
  setHubShown: (id: NavHubId, shown: boolean) => void
  setItemShown: (path: string, shown: boolean) => void
  showAll: () => void
  /** Sidebar context menu: hides, toasts «… сховано з меню» with «Повернути». */
  hideWithUndo: (place: NavPlace, label: string) => void
  pending: boolean
}

const patchFor = (prefs: NavPrefs, place: NavPlace, shown: boolean): NavPatch =>
  'hub' in place ? hubPatch(prefs, place.hub, shown) : itemPatch(prefs, place.item, shown)

/**
 * The one writer of «Налаштування → Меню». Each switch computes its patch from the *current* cache and writes
 * it there synchronously before the IPC call, so three quick clicks in a row all land (a patch from a render
 * closure, or an onMutate a microtask later, would lose the earlier ones). No snapshot rollback: when click 1
 * fails and click 2 succeeds, restoring the snapshot of click 1 would erase click 2. On an error the settings
 * are read again — main has the truth; the toast comes from useApiMutation.
 */
export function useNavPrefs(): NavPrefsActions {
  const update = useApiMutation('settings', 'update', {
    onError: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'get'] })
  })
  const { mutate } = update

  const apply = useCallback(
    (makePatch: (prefs: NavPrefs) => NavPatch): void => {
      const cur = queryClient.getQueryData<Settings>(SETTINGS_KEY)
      if (!cur) return
      const patch = makePatch(prefsOf(cur))
      // A refetch already in flight would bring the old lists back over the optimistic ones.
      void queryClient.cancelQueries({ queryKey: ['settings', 'get'] })
      queryClient.setQueryData<Settings>(SETTINGS_KEY, { ...cur, ...patch })
      mutate(patch)
    },
    [mutate]
  )

  const setHubShown = useCallback(
    (id: NavHubId, shown: boolean) => apply((p) => hubPatch(p, id, shown)),
    [apply]
  )
  const setItemShown = useCallback(
    (path: string, shown: boolean) => apply((p) => itemPatch(p, path, shown)),
    [apply]
  )
  const showAll = useCallback(
    () => apply(() => ({ hiddenNavHubs: [], hiddenNavItems: [] })),
    [apply]
  )
  // «Повернути» is the reverse operation on the current cache, not a snapshot: whatever was switched
  // between hiding and the click stays as it is.
  const hideWithUndo = useCallback(
    (place: NavPlace, label: string) => {
      apply((p) => patchFor(p, place, false))
      toast.success(`«${label}» сховано з меню`, {
        description: 'Повернути можна в Налаштування → Меню',
        action: { label: 'Повернути', onClick: () => apply((p) => patchFor(p, place, true)) }
      })
    },
    [apply]
  )

  return { setHubShown, setItemShown, showAll, hideWithUndo, pending: update.isPending }
}
