/**
 * Pronunciation through the system speech synthesis (Web Speech API; on Windows — its own voices): free,
 * offline, no keys. Voices load asynchronously and a system may have no English voice at all, so every caller
 * asks `useSpeech()` whether it can speak before offering the button.
 */
import { useSyncExternalStore } from 'react'
import type { EnglishAccent } from '@shared/domain/english'

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null

const NO_VOICES: SpeechSynthesisVoice[] = []
let cache: SpeechSynthesisVoice[] = NO_VOICES

function read(): SpeechSynthesisVoice[] {
  const list = synth()?.getVoices() ?? NO_VOICES
  // A stable array while nothing changed: useSyncExternalStore compares snapshots by identity.
  if (list.length !== cache.length || list.some((v, i) => v !== cache[i])) cache = list
  return cache
}

function subscribe(onChange: () => void): () => void {
  const s = synth()
  if (!s) return () => {}
  s.addEventListener('voiceschanged', onChange)
  return () => s.removeEventListener('voiceschanged', onChange)
}

const langOf = (v: SpeechSynthesisVoice): string => v.lang.replace('_', '-').toLowerCase()

/** The voice of the accent; any English one when the system has none of it; local voices first. */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  accent: EnglishAccent
): { voice: SpeechSynthesisVoice | null; exact: boolean } {
  const english = voices.filter((v) => langOf(v).startsWith('en'))
  const sorted = [...english].sort((a, b) => Number(b.localService) - Number(a.localService))
  const exact = sorted.find((v) => langOf(v) === accent.toLowerCase())
  return { voice: exact ?? sorted[0] ?? null, exact: !!exact }
}

export function speak(
  text: string,
  voice: SpeechSynthesisVoice | null,
  accent: EnglishAccent
): void {
  const s = synth()
  const clean = text.trim()
  if (!s || !clean) return
  // A new word interrupts the previous one instead of queueing behind it.
  s.cancel()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = voice?.lang ?? accent
  if (voice) u.voice = voice
  u.rate = 0.95
  s.speak(u)
}

export function useVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(subscribe, read, () => NO_VOICES)
}
