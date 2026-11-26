import { Code, Copy } from 'lucide-react'
import { SNIPPET_LANGUAGES, type Snippet, type SnippetPatch } from '@shared/domain/snippets'
import { useApiMutation } from '@/lib/query'
import { LANGUAGE_LABEL } from '@/lib/code-language'
import { copyText } from '@/components/common/copy-button'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'

/** A snippet's right click and «⋯» (grid cards). */
export const snippetMenu = defineRecordMenu<Snippet, { onOpen: () => void }>({
  title: (s) => s.title,
  entity: (s) => ({ type: 'snippet', id: s.id }),
  useGroups(s, { onOpen }) {
    const ref = { type: 'snippet' as const, id: s.id }
    const update = useApiMutation('snippets', 'update')
    const save = (patch: SnippetPatch): void => update.mutate({ id: s.id, patch })
    // Counted like the card's own «Скопіювати» («Часто копіюю» on the knowledge page).
    const markCopied = useApiMutation('snippets', 'markCopied', { silent: true })
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!s.code.trim() && {
          label: 'Копіювати код',
          icon: Copy,
          run: async () => {
            if (await copyText(s.code, 'Код скопійовано')) markCopied.mutate(s.id)
          }
        }
      ],
      state: [
        choiceSubmenu(
          'Мова',
          Code,
          SNIPPET_LANGUAGES,
          s.language,
          (l) => LANGUAGE_LABEL[l],
          (language) => save({ language })
        ),
        useTagsSubmenu(s.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('snippets', ref, 'Сніпет переміщено в кошик')]
    }
  }
})
