import type { QuickAddTarget } from '@shared/domain/system'
import type { EntityType } from '@shared/entity-types'

export interface QuickTile {
  target: QuickAddTarget
  label: string
  type: EntityType
}

/** Home quick-add tiles; the dashboard shows those whose section is in the menu (QUICK_ADD_PLACE). */
export const QUICK_TILES: QuickTile[] = [
  { target: 'idea', label: 'Записати ідею', type: 'idea' },
  { target: 'card', label: 'Нове завдання', type: 'card' },
  { target: 'snippet', label: 'Зберегти сніпет', type: 'snippet' },
  { target: 'word', label: 'Нове слово', type: 'word' }
]
