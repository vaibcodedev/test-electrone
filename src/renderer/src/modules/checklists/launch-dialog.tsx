import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDayFull } from '@/lib/format'
import { FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/page'
import { Choice } from '@/modules/crm/parts'
import { checklistInputSchema } from '@shared/domain/checklists'
import { limitsOf } from '@/lib/limits'

const LIMITS = limitsOf(checklistInputSchema)

/** «Деплой — 25 листопада»: the run is named after its template and the day it was started. */
const runTitle = (template: string): string => `${template} — ${fmtDayFull(Date.now())}`

/** Creates a run (a tickable copy) from a template, optionally tied to a project. */
export function LaunchDialog({
  template,
  open,
  onOpenChange
}: {
  template: { id: string; title: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { data: projects = [] } = useApi('projects', 'list', undefined, { enabled: open })
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const instantiate = useApiMutation('checklists', 'instantiate', {
    successMessage: 'Прогін створено',
    onSuccess: (run) => {
      onOpenChange(false)
      navigate(`/checklists/${run.id}`)
    }
  })

  // Reset once per opening, during render: `template` is a new object on every parent render, and a refetch
  // while the dialog is open used to wipe the typed name (docs/design-system.md → Сброс формы диалога).
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && template) {
      setTitle(runTitle(template.title))
      setProjectId(null)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Запустити прогін"
      description="Створюється копія шаблону, у якій можна позначати пункти. Шаблон не змінюється."
      submitLabel="Запустити"
      invalid={!title.trim() || !template}
      pending={instantiate.isPending}
      onSubmit={() => {
        if (template) instantiate.mutate({ templateId: template.id, title: title.trim(), projectId })
      }}
      className="sm:max-w-[480px]"
    >
      <Field label="Назва прогону">
        <Input autoFocus value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Проєкт">
        <Choice
          value={projectId}
          none="Без проєкту"
          onChange={setProjectId}
          options={projects.map((p) => ({
            value: p.id,
            label: p.clientName ? `${p.title} — ${p.clientName}` : p.title
          }))}
        />
      </Field>
    </FormDialog>
  )
}
