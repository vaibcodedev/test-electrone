import type { IdeaStatus } from '@shared/domain/ideas'

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  inbox: 'Вхідні',
  thinking: 'Обмірковую',
  planned: 'У планах',
  in_progress: 'У роботі',
  done: 'Зроблено',
  dropped: 'Відмовився'
}

/** Status badge in a row (docs/design-system.md §10): neutral while queued, info in progress, success done. */
export const IDEA_STATUS_BADGE: Record<IdeaStatus, 'soft' | 'info' | 'success'> = {
  inbox: 'soft',
  thinking: 'soft',
  planned: 'soft',
  in_progress: 'info',
  done: 'success',
  dropped: 'soft'
}

export const IMPACT_LABEL = ['Не оцінена', 'Дрібниця', 'Варта уваги', 'Важлива'] as const
