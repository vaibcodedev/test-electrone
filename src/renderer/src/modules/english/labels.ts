import type { EntryKind, WordStage } from '@shared/domain/english'
import { gapCards } from '@shared/english-gaps'
import { plural } from '@/lib/format'

export const STAGE_LABEL: Record<WordStage, string> = {
  new: 'Нові',
  learning: 'Вчу',
  review: 'Повторюю',
  mastered: 'Вивчено'
}

/** One word's stage (a row, the record header); STAGE_LABEL above names the groups in filters. */
export const STAGE_LABEL_ONE: Record<WordStage, string> = {
  new: 'Нове',
  learning: 'Вчу',
  review: 'Повторюю',
  mastered: 'Вивчене'
}

/**
 * Stage dot in the rows and the stage chips (full class strings: Tailwind can't see interpolated names). The same
 * tones as STAGE_BADGE: one stage, one colour. `*-fill`, not the text tokens: those are darkened for text, and a
 * «Вчу» dot in the light theme read as brown.
 */
export const STAGE_COLOR: Record<WordStage, string> = {
  new: 'bg-muted-foreground/50',
  learning: 'bg-warn-fill',
  review: 'bg-info-fill',
  mastered: 'bg-success-fill'
}

/** Stage badge in the record header: «Вивчене» is a success, not a second lime accent next to the page's one. */
export const STAGE_BADGE: Record<WordStage, 'soft' | 'info' | 'warn' | 'success'> = {
  new: 'soft',
  learning: 'warn',
  review: 'info',
  mastered: 'success'
}

export const KIND_LABEL: Record<EntryKind, string> = {
  word: 'Слово',
  phrase: 'Фраза',
  idiom: 'Ідіома',
  term: 'Термін',
  rule: 'Правило'
}

/** How the trainer reads the examples: one place says it for the dialog and the record. */
export const GAPS_HINT =
  'По реченню в рядку. Що вписати — у квадратних дужках, після | — підказка: Yesterday I [went|go] home.'

/** What the examples give the trainer, in words: «3 картки для тренування» or why there are none. */
export function gapsSummary(examples: string): string {
  const n = gapCards(examples).length
  if (!examples.trim()) return GAPS_HINT
  return n
    ? `${n} ${plural(n, ['картка', 'картки', 'карток'])} «заповни пропуск» для тренування`
    : 'Пропусків немає — позначте у квадратних дужках, що вписати, інакше правило не потрапить у тренування.'
}
