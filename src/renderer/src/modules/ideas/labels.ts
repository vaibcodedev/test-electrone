import type { IdeaStatus } from '@shared/domain/ideas'

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  inbox: 'Вхідні',
  thinking: 'Обмірковую',
  planned: 'У планах',
  in_progress: 'У роботі',
  done: 'Зроблено',
  dropped: 'Відмовився'
}

export const IMPACT_LABEL = ['Не оцінена', 'Дрібниця', 'Варта уваги', 'Важлива'] as const
