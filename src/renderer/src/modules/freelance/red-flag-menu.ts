import { Gauge } from 'lucide-react'
import type { RedFlag, RedFlagPatch } from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'
import { SEVERITY_LABEL } from './g2-labels'

const SEVERITIES = [1, 2, 3] as const

/** A red flag's right click and «⋯». */
export const redFlagMenu = defineRecordMenu<RedFlag, { onOpen: () => void }>({
  title: (f) => f.title,
  entity: (f) => ({ type: 'redflag', id: f.id }),
  useGroups(f, { onOpen }) {
    const ref = { type: 'redflag' as const, id: f.id }
    const update = useApiMutation('redflags', 'update')
    const save = (patch: RedFlagPatch): void => update.mutate({ id: f.id, patch })
    return {
      open: [useOpenItem(ref, onOpen)],
      state: [
        choiceSubmenu(
          'Наскільки серйозно',
          Gauge,
          SEVERITIES,
          f.severity as (typeof SEVERITIES)[number],
          (n) => SEVERITY_LABEL[n],
          (severity) => save({ severity })
        ),
        useTagsSubmenu(f.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('redflags', ref, 'Прапорець переміщено в кошик')]
    }
  }
})
