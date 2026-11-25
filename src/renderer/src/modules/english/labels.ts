import type { WordKind, WordStage } from '@shared/domain/english'

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

export const KIND_LABEL: Record<WordKind, string> = {
  word: 'Слово',
  phrase: 'Фраза',
  idiom: 'Ідіома',
  term: 'Термін'
}
