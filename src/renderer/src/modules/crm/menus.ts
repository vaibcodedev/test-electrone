import { useNavigate } from 'react-router'
import { CircleDot, Copy, FolderPlus, Mail, Play, Square } from 'lucide-react'
import {
  CLIENT_STATUSES,
  PROJECT_STATUSES,
  type ClientPatch,
  type ClientSummary,
  type ProjectPatch,
  type ProjectSummary
} from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { copyText } from '@/components/common/copy-button'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'
import { CLIENT_STATUS_LABEL, PROJECT_STATUS_LABEL } from './labels'

/** A client card's right click and «⋯»: a new project, write, copy the phone, the status. The trash asks (as on its page). */
export const clientMenu = defineRecordMenu<ClientSummary>({
  title: (c) => c.name,
  entity: (c) => ({ type: 'client', id: c.id }),
  useGroups(c) {
    const navigate = useNavigate()
    const ref = { type: 'client' as const, id: c.id }
    const update = useApiMutation('clients', 'update')
    const save = (patch: ClientPatch): void => update.mutate({ id: c.id, patch })
    const trash = useTrashItem('clients', ref, 'Клієнта переміщено в кошик')
    return {
      open: [
        useOpenItem(ref),
        // The client page opens its own project dialog, with this client and their terms filled in.
        { label: 'Новий проєкт', icon: FolderPlus, run: () => navigate(`/clients/${c.id}?new=1`) },
        !!c.email.trim() && {
          label: 'Написати листа',
          icon: Mail,
          run: () => void openUrl(`mailto:${c.email.trim()}`)
        },
        !!c.phone.trim() && {
          label: 'Копіювати телефон',
          icon: Copy,
          run: () => void copyText(c.phone.trim(), 'Телефон скопійовано')
        }
      ],
      state: [
        choiceSubmenu(
          'Статус',
          CircleDot,
          CLIENT_STATUSES,
          c.status,
          (s) => CLIENT_STATUS_LABEL[s],
          (status) => save({ status })
        ),
        useTagsSubmenu(c.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [
        {
          ...trash,
          confirm: {
            title: 'Видалити клієнта?',
            description: 'Клієнт піде в кошик на 30 днів. Проєкти залишаться без клієнта.',
            confirmLabel: 'У кошик'
          }
        }
      ]
    }
  }
})

/** A project row's right click and «⋯»: the timer, the status. The trash asks (its hours and payments go too). */
export const projectMenu = defineRecordMenu<ProjectSummary>({
  title: (p) => p.title,
  entity: (p) => ({ type: 'project', id: p.id }),
  useGroups(p) {
    const ref = { type: 'project' as const, id: p.id }
    const update = useApiMutation('projects', 'update')
    const save = (patch: ProjectPatch): void => update.mutate({ id: p.id, patch })
    const { data: running } = useApi('time', 'running')
    const start = useApiMutation('time', 'start', { successMessage: 'Таймер запущено' })
    const stop = useApiMutation('time', 'stop', { successMessage: 'Таймер зупинено' })
    const trash = useTrashItem('projects', ref, 'Проєкт переміщено в кошик')
    const mine = running?.projectId === p.id
    return {
      open: [
        useOpenItem(ref),
        running !== undefined &&
          (mine
            ? { label: 'Зупинити таймер', icon: Square, run: () => stop.mutate(undefined) }
            : { label: 'Почати таймер', icon: Play, run: () => start.mutate({ projectId: p.id }) })
      ],
      state: [
        choiceSubmenu(
          'Статус',
          CircleDot,
          PROJECT_STATUSES,
          p.status,
          (s) => PROJECT_STATUS_LABEL[s],
          (status) => save({ status })
        ),
        useTagsSubmenu(p.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [
        {
          ...trash,
          confirm: {
            title: 'Видалити проєкт?',
            description: 'Проєкт піде в кошик на 30 днів разом із годинами й оплатами.',
            confirmLabel: 'У кошик'
          }
        }
      ]
    }
  }
})
