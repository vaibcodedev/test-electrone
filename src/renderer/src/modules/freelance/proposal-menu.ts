import { useNavigate } from 'react-router'
import { CircleDot, ExternalLink, FileText } from 'lucide-react'
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABEL,
  type Proposal,
  type ProposalPatch
} from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'

/** A proposal's right click (list rows): the job post, the status, «Зберегти як шаблон». */
export const proposalMenu = defineRecordMenu<Proposal, { onOpen: () => void }>({
  title: (p) => p.jobTitle,
  entity: (p) => ({ type: 'proposal', id: p.id }),
  useGroups(p, { onOpen }) {
    const navigate = useNavigate()
    const ref = { type: 'proposal' as const, id: p.id }
    const update = useApiMutation('proposals', 'update')
    const save = (patch: ProposalPatch): void => update.mutate({ id: p.id, patch })
    const toTemplate = useApiMutation('proposals', 'toTemplate', {
      successMessage: 'Шаблон створено',
      onSuccess: (t) => navigate(`/freelance/templates?open=${t.id}`)
    })
    const url = p.jobUrl.trim()
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!url && { label: 'Відкрити вакансію', icon: ExternalLink, run: () => void openUrl(url) }
      ],
      state: [
        choiceSubmenu(
          'Статус',
          CircleDot,
          PROPOSAL_STATUSES,
          p.status,
          (s) => PROPOSAL_STATUS_LABEL[s],
          (status) => save({ status })
        ),
        useTagsSubmenu(p.tags, (tagIds) => save({ tagIds }))
      ],
      share: [
        !!p.coverLetter.trim() && {
          label: 'Зберегти як шаблон',
          icon: FileText,
          run: () => toTemplate.mutate(p.id)
        }
      ],
      danger: [useTrashItem('proposals', ref, 'Відгук переміщено в кошик')]
    }
  }
})
