import { useNavigate } from 'react-router'
import type { Moodboard } from '@shared/domain/designs'
import { useApi, useApiMutation } from '@/lib/query'
import { useUi } from '@/stores/ui-store'

/** Boards shown in the row over the gallery; the rest are behind «+N» / «Усі добірки». */
export const STRIP_LIMIT = 12
/** Key of the row in `useUi.collapsed` (remembered in localStorage between runs). */
export const MOODBOARDS_COLLAPSE_KEY = 'designs.moodboards'

/** Row data: the first boards (favourites first, the server orders them) and the total for «Добірки N». */
export function useMoodboardStrip(): {
  boards: Moodboard[]
  total: number
  isLoading: boolean
  isError: boolean
  retry: () => void
} {
  const list = useApi('moodboards', 'list', { limit: STRIP_LIMIT })
  const count = useApi('moodboards', 'count')
  return {
    boards: list.data ?? [],
    // The count can lag a list refetch by a moment: never show fewer than the tiles on screen.
    total: Math.max(count.data ?? 0, list.data?.length ?? 0),
    isLoading: list.isLoading || count.isLoading,
    isError: list.isError || count.isError,
    retry: () => {
      void list.refetch()
      void count.refetch()
    }
  }
}

/** «Нова добірка»: creates one under the default title and opens it in edit mode; a failure is toasted. */
export function useNewMoodboard(): { create: () => void; pending: boolean } {
  const navigate = useNavigate()
  const create = useApiMutation('moodboards', 'create')
  return {
    create: () => {
      if (create.isPending) return
      create
        .mutateAsync({ title: 'Нова добірка' })
        .then((b) => navigate(`/designs/boards/${b.id}`))
        // The mutation has toasted the error already.
        .catch(() => undefined)
    },
    pending: create.isPending
  }
}

/** Collapsed state of the row. localStorage isn't validated by persist: anything but `true` is expanded. */
export function useStripCollapsed(): [collapsed: boolean, setCollapsed: (on: boolean) => void] {
  const collapsed = useUi((s) => s.collapsed?.[MOODBOARDS_COLLAPSE_KEY] === true)
  const setCollapsed = useUi((s) => s.setCollapsed)
  return [collapsed, (on) => setCollapsed(MOODBOARDS_COLLAPSE_KEY, on)]
}
