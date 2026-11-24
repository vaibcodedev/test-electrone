import { toast } from 'sonner'
import { api } from './api'

/** «djinni.co» → «https://djinni.co»: links typed without a scheme still open. mailto: is kept. */
export function normalizeUrl(url: string): string {
  const v = url.trim()
  if (!v || /^[a-z][\w+.-]*:/i.test(v)) return v
  return `https://${v}`
}

/**
 * Opens a link in the default browser. Never rejects: a bad link says so in a toast instead of an unhandled
 * error (openExternal validates the URL and throws). Use this instead of api.app.openExternal directly.
 */
export async function openUrl(url: string): Promise<void> {
  try {
    await api.app.openExternal(normalizeUrl(url))
  } catch {
    toast.error(`Не вдалося відкрити посилання: ${url}`)
  }
}
