import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { templateVersions, type Proposal, type ProposalPatch } from '@shared/domain/freelance'
import { useApi, useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { Choice } from '@/components/common/choice'
import { DisabledHint } from '@/components/common/disabled-hint'
import { TemplateFillDialog } from './template-fill-dialog'

/** «Шаблон відгуку»: pick a proposal template and paste its text into the cover letter. */
export function TemplatePicker({
  proposal,
  patch
}: {
  proposal: Proposal
  patch: (p: ProposalPatch) => void
}): ReactElement {
  const navigate = useNavigate()
  const { data: templates = [], isLoading } = useApi('templates', 'list', {
    situation: 'proposal',
    purpose: 'freelance'
  })
  const markCopied = useApiMutation('templates', 'markCopied')
  const [selected, setSelected] = useState<string | null>(proposal.templateId)
  const [filling, setFilling] = useState(false)
  const { data: settings } = useApi('settings', 'get')
  const tpl = templates.find((t) => t.id === selected)
  /** «Вставити» first asks for the {variables} (the person's name is known already), then writes the text. */
  const insert = (): void => {
    if (tpl) setFilling(true)
  }
  const write = (filled: string): void => {
    if (!tpl) return
    patch({ coverLetter: filled, templateId: tpl.id })
    markCopied.mutate(tpl.id)
    setFilling(false)
    toast.success('Шаблон вставлено у відгук')
  }
  // An empty list would only promise a template that is not there.
  if (!isLoading && templates.length === 0)
    return (
      <p className="text-body text-muted-foreground">
        Шаблонів відгуків ще немає.{' '}
        <Button variant="link" onClick={() => navigate('/freelance/templates?purpose=freelance&situation=proposal')}>
          Створити шаблон
        </Button>
      </p>
    )
  return (
    <div className="flex items-end gap-2">
      {tpl && (
        <TemplateFillDialog
          open={filling}
          onOpenChange={setFilling}
          heading="Вставити шаблон"
          title={tpl.title}
          body={tpl.body}
          // Several text versions (translations): the dialog lets you pick one, the first is shown first.
          versions={templateVersions(tpl)}
          submitLabel="Вставити у відгук"
          onSubmit={write}
          initial={
            settings?.userName ? { my_name: settings.userName, name: settings.userName } : undefined
          }
        />
      )}
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
