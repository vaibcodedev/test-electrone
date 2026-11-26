import { Copy, ThumbsUp } from 'lucide-react'
import type { ClaudeItem, ClaudeKind, ClaudePatch } from '@shared/domain/claude'
import { useApiMutation } from '@/lib/query'
import { copyText } from '@/components/common/copy-button'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem, useTagsSubmenu, useTrashItem } from '@/features/record-menu/actions'

/** Accusative noun of the trash toast: «Промт переміщено в кошик» (glossary: always with the noun). */
export const TRASHED: Record<ClaudeKind, string> = {
  note: 'Нотатку',
  branch: 'Гілку',
  skill: 'Скіл',
  plugin: 'Плагін',
  guide: 'Гайд',
  prompt: 'Промт'
}

/** A Claude record's right click and «⋯»: a prompt is copied from here like from its row's button. */
export const claudeMenu = defineRecordMenu<ClaudeItem, { onOpen: () => void }>({
  title: (i) => i.title,
  entity: (i) => ({ type: 'claude', id: i.id }),
  useGroups(i, { onOpen }) {
    const ref = { type: 'claude' as const, id: i.id }
    const update = useApiMutation('claude', 'update')
    const save = (patch: ClaudePatch): void => update.mutate({ id: i.id, patch })
    const markCopied = useApiMutation('claude', 'markCopied', { silent: true })
    const prompt = i.kind === 'prompt'
    return {
      open: [
        useOpenItem(ref, onOpen),
        prompt &&
          !!i.content.trim() && {
            label: 'Копіювати промт',
            icon: Copy,
            run: async () => {
              if (await copyText(i.content, 'Промт скопійовано')) markCopied.mutate(i.id)
            }
          }
      ],
      state: [
        prompt && { label: 'Працює', icon: ThumbsUp, on: i.works, run: () => save({ works: !i.works }) },
        useTagsSubmenu(i.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('claude', ref, `${TRASHED[i.kind]} переміщено в кошик`)]
    }
  }
})
