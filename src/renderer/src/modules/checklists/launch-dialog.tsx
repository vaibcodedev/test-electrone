import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDayFull } from '@/lib/format'
import { FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/page'
import { Choice } from '@/components/common/choice'
import { checklistInputSchema } from '@shared/domain/checklists'
import { limitsOf } from '@/lib/limits'

const LIMITS = limitsOf(checklistInputSchema)

/**
 * «Деплой — 25 листопада»: the run is named after its template and the day it was started. A template name
 * near the limit is shortened so the dated name still fits the schema (maxLength doesn't cut a value set in code).
 */
const runTitle = (template: string): string => {
  const suffix = ` — ${fmtDayFull(Date.now())}`
  const room = (LIMITS.title ?? Infinity) - suffix.length
  return (template.length > room ? template.slice(0, room - 1).trimEnd() + '…' : template) + suffix
}

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
      invalidReason="Вкажіть назву прогону"
      pending={instantiate.isPending}
      onSubmit={() => {
        if (template)
          instantiate.mutate({ templateId: template.id, title: title.trim(), projectId })
      }}
      className="sm:max-w-120"
    >
      <Field label="Назва прогону">
        <Input
          autoFocus
          value={title}
          maxLength={LIMITS.title}
          onChange={(e) => setTitle(e.target.value)}
        />
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
