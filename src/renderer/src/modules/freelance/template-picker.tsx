import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import type { Proposal, ProposalPatch } from '@shared/domain/freelance'
import { useApi, useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { Choice } from '../crm/parts'
import { DisabledHint } from './disabled-hint'

/** «Шаблон відгуку»: pick a proposal template and paste its text into the cover letter. */
export function TemplatePicker({
  proposal,
  patch
}: {
  proposal: Proposal
  patch: (p: ProposalPatch) => void
}): ReactElement {
  const { data: templates = [] } = useApi('templates', 'list', { situation: 'proposal' })
  const markCopied = useApiMutation('templates', 'markCopied')
  const [selected, setSelected] = useState<string | null>(proposal.templateId)
  const tpl = templates.find((t) => t.id === selected)
  const insert = (): void => {
    if (!tpl) return
    patch({ coverLetter: tpl.body, templateId: tpl.id })
    markCopied.mutate(tpl.id)
    toast.success('Шаблон вставлено — замініть {змінні}')
  }
  return (
    <div className="flex items-end gap-2">
      <Field label="Шаблон відгуку" className="flex-1">
        <Choice
          value={selected}
          onChange={(v) => {
            setSelected(v)
            patch({ templateId: v })
          }}
          none="Без шаблону"
          placeholder="Оберіть шаблон"
          options={templates.map((t) => ({ value: t.id, label: t.title }))}
        />
      </Field>
      {!tpl ? (
        <DisabledHint reason="Оберіть шаблон зі списку">
          <Button variant="soft" disabled>
            <FileText /> Вставити
          </Button>
        </DisabledHint>
      ) : proposal.coverLetter.trim() ? (
        <Confirm
          title="Замінити текст відгуку?"
          description="Поточний текст буде замінено шаблоном."
          confirmLabel="Замінити"
          onConfirm={insert}
        >
          <Button variant="soft">
            <FileText /> Вставити
          </Button>
        </Confirm>
      ) : (
        <Button variant="soft" onClick={insert}>
          <FileText /> Вставити
        </Button>
      )}
    </div>
  )
}
