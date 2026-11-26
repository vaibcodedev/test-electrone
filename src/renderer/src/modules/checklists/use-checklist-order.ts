import { useMemo, useState } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type SensorDescriptor,
  type SensorOptions
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { checklistItemInputSchema, type ChecklistItem } from '@shared/domain/checklists'
import { limitsOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'

export const ITEM_LIMITS = limitsOf(checklistItemInputSchema)

export const NO_SECTION = 'Без розділу'

/** A checklist in the import's JSON format («Скопіювати як JSON» on its page and in its menu); `items` in their order. */
export function checklistJson(
  title: string,
  description: string,
  items: ChecklistItem[]
): { title: string; description: string; sections: { title: string; items: unknown[] }[] } {
  return {
    title,
    description,
    sections: groupBySection(items).map(([section, list]) => ({
      title: section,
      items: list.map((i) => (i.hint ? { text: i.text, hint: i.hint } : i.text))
    }))
  }
}

/** Groups items by section, keeping the order in which sections first appear. */
function groupBySection(items: ChecklistItem[]): [string, ChecklistItem[]][] {
  const map = new Map<string, ChecklistItem[]>()
  for (const item of items) map.set(item.section, [...(map.get(item.section) ?? []), item])
  return [...map.entries()]
}

/**
 * Item order of a checklist with drag & drop: a local copy for instant feedback that follows the server
 * otherwise. Dropping an item on another section moves it there; sections stay contiguous.
 */
export function useChecklistOrder(
  checklistId: string,
  serverItems: ChecklistItem[] | undefined
): {
  items: ChecklistItem[]
  groups: [string, ChecklistItem[]][]
  sensors: SensorDescriptor<SensorOptions>[]
  onDragEnd: (e: DragEndEvent) => void
} {
  const reorder = useApiMutation('checklists', 'reorderItems')
  const updateItem = useApiMutation('checklists', 'updateItem')
  const [items, setItems] = useState<ChecklistItem[]>(serverItems ?? [])
  // Fresh server data replaces the local order (adjusting state while rendering, not in an effect).
  const [synced, setSynced] = useState(serverItems)
  if (serverItems !== synced) {
    setSynced(serverItems)
    setItems(serverItems ?? [])
  }
  const groups = useMemo(() => groupBySection(items), [items])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from < 0 || to < 0) return
    const moved = items[from]
    const target = items[to]
    let next = arrayMove(items, from, to)
    if (moved.section !== target.section) {
      next = next.map((i) => (i.id === moved.id ? { ...i, section: target.section } : i))
      updateItem.mutate({ id: moved.id, patch: { section: target.section } })
    }
    // Keep items of one section contiguous, in the order sections appear.
    const ordered = groupBySection(next).flatMap(([, list]) => list)
    setItems(ordered)
    reorder.mutate({ checklistId, ids: ordered.map((i) => i.id) })
  }

  return { items, groups, sensors, onDragEnd }
}
