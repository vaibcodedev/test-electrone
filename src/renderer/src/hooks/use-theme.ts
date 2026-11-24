import { useEffect, useSyncExternalStore } from 'react'
import type { Theme } from '@shared/domain/system'
import { useApi } from '@/lib/query'
import { api } from '@/lib/api'

const media = window.matchMedia('(prefers-color-scheme: dark)')

function subscribe(cb: () => void): () => void {
  media.addEventListener('change', cb)
  return () => media.removeEventListener('change', cb)
}

/** Resolved theme ('light' | 'dark'), following the saved setting or the OS. */
export function useResolvedTheme(): 'light' | 'dark' {
  const { data } = useApi('settings', 'get')
  const systemDark = useSyncExternalStore(subscribe, () => media.matches)
  const theme: Theme = data?.theme ?? 'system'
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}

/** Applies the `.dark` class on <html>. Mount once per window. */
export function useApplyTheme(): 'light' | 'dark' {
  const resolved = useResolvedTheme()
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.style.colorScheme = resolved
    void api.app.setWindowTheme(resolved).catch(() => undefined)
  }, [resolved])
  return resolved
}
