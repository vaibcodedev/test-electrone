import { useCallback } from 'react'
import type { EnglishAccent } from '@shared/domain/english'
import { useApi } from '@/lib/query'
import { pickVoice, speak, useVoices } from '@/lib/speech'

export const ACCENT_LABEL: Record<EnglishAccent, string> = {
  'en-US': 'Американська',
  'en-GB': 'Британська'
}

/** Why there is nothing to speak with: the button stays, disabled, and says how to fix it. */
export const NO_VOICE_REASON =
  'У системі немає англійського голосу. Додайте його: Параметри Windows › Час і мова › Мовлення'

export interface Pronounce {
  canSpeak: boolean
  /** The voice is of the chosen accent (false: another English voice stands in). */
  exact: boolean
  accent: EnglishAccent
  autoplay: boolean
  say: (text: string) => void
}

/** Pronunciation with the voice and autoplay chosen in «Налаштування тренування». */
export function usePronounce(): Pronounce {
  const { data: settings } = useApi('settings', 'get')
  const accent = settings?.englishAccent ?? 'en-US'
  const voices = useVoices()
  const { voice, exact } = pickVoice(voices, accent)
  const say = useCallback((text: string) => speak(text, voice, accent), [voice, accent])
  return { canSpeak: !!voice, exact, accent, autoplay: !!settings?.englishAutoplay, say }
}
