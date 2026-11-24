import type { Priority } from '@shared/domain/boards'

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: 'Без пріоритету',
  low: 'Низький',
  medium: 'Середній',
  high: 'Високий',
  urgent: 'Терміново'
}

export const PRIORITY_DOT: Record<Priority, string> = {
  none: 'bg-transparent ring-1 ring-inset ring-border',
  low: 'bg-ink-muted',
  medium: 'bg-info',
  high: 'bg-warn',
  urgent: 'bg-destructive'
}

export type BoardView = 'kanban' | 'list' | 'calendar'

export const BOARD_VIEWS: { value: BoardView; label: string }[] = [
  { value: 'kanban', label: 'Канбан' },
  { value: 'list', label: 'Список' },
  { value: 'calendar', label: 'Календар' }
]
