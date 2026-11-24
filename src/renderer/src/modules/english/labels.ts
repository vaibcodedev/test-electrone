import type { WordKind, WordStage } from '@shared/domain/english'

export const STAGE_LABEL: Record<WordStage, string> = {
  new: 'Новые',
  learning: 'Учу',
  review: 'Повторяю',
  mastered: 'Выучено'
}

export const STAGE_BADGE: Record<WordStage, 'soft' | 'info' | 'warn' | 'lime'> = {
  new: 'soft',
  learning: 'warn',
  review: 'info',
  mastered: 'lime'
}

export const KIND_LABEL: Record<WordKind, string> = {
  word: 'Слово',
  phrase: 'Фраза',
  idiom: 'Идиома',
  term: 'Термин'
}
