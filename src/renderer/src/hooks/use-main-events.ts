import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import type { MainEventName, MainEvents } from '@shared/api'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { useUi } from '@/stores/ui-store'

export function useMainEvent<E extends MainEventName>(event: E, handler: (payload: MainEvents[E]) => void): void {
  useEffect(() => window.vault.on(event, (p) => handler(p as MainEvents[E])), [event, handler])
}

/** Wires main-process events into the app: cache refresh, navigation, global search. */
export function useMainEventsBridge(): void {
  const navigate = useNavigate()
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  useEffect(() => {
    const offs = [
      window.vault.on('data:changed', () => invalidateAll()),
      window.vault.on('settings:changed', () => invalidateAll()),
      window.vault.on('updates:status', (p) => {
        invalidateAll()
        // Downloaded in the background: say so wherever the user is, not only in Settings.
        const st = p as MainEvents['updates:status']
        if (st.state === 'ready')
          toast.success(`Оновлення ${st.version} готове`, {
            id: 'update-ready',
            duration: Infinity,
            description: 'Встановиться під час наступного запуску — або перезапустіть зараз.',
            action: { label: 'Перезапустити', onClick: () => void api.updates.install() }
          })
      }),
      window.vault.on('navigate', (p) => {
        const { route } = p as MainEvents['navigate']
        if (route.includes('search=1')) setPaletteOpen(true)
        else navigate(route)
      })
    ]
    return () => offs.forEach((off) => off())
  }, [navigate, setPaletteOpen])
}
