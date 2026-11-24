import type { IdeaStatus } from '@shared/domain/ideas'

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  inbox: 'Входящие',
  thinking: 'Обдумываю',
  planned: 'В планах',
  in_progress: 'В работе',
  done: 'Сделано',
  dropped: 'Отказался'
}

export const IMPACT_LABEL = ['Не оценена', 'Мелочь', 'Стоящая', 'Важная'] as const
