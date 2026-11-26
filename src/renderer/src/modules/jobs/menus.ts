import { Copy, ExternalLink, Folder } from 'lucide-react'
import {
  QUESTION_CATEGORIES,
  type Company,
  type CompanyPatch,
  type InterviewQuestion,
  type QuestionPatch
} from '@shared/domain/jobs'
import { useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { isLikelyUrl } from '@/lib/limits'
import { copyText } from '@/components/common/copy-button'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'
import { QUESTION_CATEGORY_LABEL } from './labels'

/** A bank question's right click and «⋯». */
export const questionMenu = defineRecordMenu<InterviewQuestion, { onOpen: () => void }>({
  title: (q) => q.question,
  entity: (q) => ({ type: 'question', id: q.id }),
  useGroups(q, { onOpen }) {
    const ref = { type: 'question' as const, id: q.id }
    const update = useApiMutation('jobs', 'updateQuestion')
    const save = (patch: QuestionPatch): void => update.mutate({ id: q.id, patch })
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!q.answer.trim() && {
          label: 'Копіювати відповідь',
          icon: Copy,
          run: () => void copyText(q.answer, 'Відповідь скопійовано')
        }
      ],
      state: [
        choiceSubmenu(
          'Категорія',
          Folder,
          QUESTION_CATEGORIES,
          q.category,
          (c) => QUESTION_CATEGORY_LABEL[c],
          (category) => save({ category })
        ),
        useTagsSubmenu(q.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('jobs', ref, 'Питання переміщено в кошик', 'removeQuestion')]
    }
  }
})

/** A company's right click and «⋯». */
export const companyMenu = defineRecordMenu<Company, { onOpen: () => void }>({
  title: (c) => c.name,
  entity: (c) => ({ type: 'company', id: c.id }),
  useGroups(c, { onOpen }) {
    const ref = { type: 'company' as const, id: c.id }
    const update = useApiMutation('jobs', 'updateCompany')
    const save = (patch: CompanyPatch): void => update.mutate({ id: c.id, patch })
    const site = c.website.trim()
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!site &&
          isLikelyUrl(site) && { label: 'Відкрити сайт', icon: ExternalLink, run: () => void openUrl(site) }
      ],
      state: [useTagsSubmenu(c.tags, (tagIds) => save({ tagIds }))],
      danger: [useTrashItem('jobs', ref, 'Компанію переміщено в кошик', 'removeCompany')]
    }
  }
})
