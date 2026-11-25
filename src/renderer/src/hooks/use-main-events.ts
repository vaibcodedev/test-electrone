import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import type { MainEventName, MainEvents } from '@shared/api'
import { invalidateAll, queryClient } from '@/lib/query'
import { useUi } from '@/stores/ui-store'
import { reportError } from '@/lib/error-reporting'

/**
 * Subscribes to a main-process event without letting an unknown one take the screen down: the preload refuses
 * names it doesn't know (a renderer newer than its preload — `npm run dev` after main/preload changes, or a
 * half-applied update). That is logged and the subscription is a no-op; the page keeps working.
 */
function subscribe(event: MainEventName, listener: (payload: unknown) => void): () => void {
  try {
    return window.vault.on(event, listener)
  } catch (e) {
    reportError(e, `events:${event}`)
    return () => undefined
  }
}

export function useMainEvent<E extends MainEventName>(
  event: E,
  handler: (payload: MainEvents[E]) => void
): void {
  useEffect(() => subscribe(event, (p) => handler(p as MainEvents[E])), [event, handler])
}

/** Wires main-process events into the app: cache refresh, navigation, global search. */
export function useMainEventsBridge(): void {
  const navigate = useNavigate()
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  useEffect(() => {
    const offs = [
      subscribe('data:changed', () => invalidateAll()),
      subscribe('settings:changed', () => invalidateAll()),
      // The sidebar UpdateBanner shows progress and «Перезапустити» (useApi re-reads the status). Only the
      // updates queries: progress events come often, and each used to refetch the whole app.
      subscribe(
        'updates:status',
        () => void queryClient.invalidateQueries({ queryKey: ['updates'] })
      ),
      subscribe('navigate', (p) => {
        const { route } = p as MainEvents['navigate']
        if (route.includes('search=1')) setPaletteOpen(true)
        else navigate(route)
      })
    ]
    return () => offs.forEach((off) => off())
  }, [navigate, setPaletteOpen])
}
