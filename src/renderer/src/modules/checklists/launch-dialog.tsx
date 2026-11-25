import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDayFull } from '@/lib/format'
import { FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/page'
import { Choice } from '@/components/common/choice'
import { checklistInputSchema } from '@shared/domain/checklists'
import { limitsOf, requiredOf } from '@/lib/limits'
import { freshOnOpen } from '@/components/common/fresh-on-open'

const LIMITS = limitsOf(checklistInputSchema)
const REQUIRED = requiredOf(checklistInputSchema)

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
function LaunchDialogForm({
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
  // Created anew on each opening (freshOnOpen): the run's name comes from the template it was opened for.
  const [title, setTitle] = useState(() => (template ? runTitle(template.title) : ''))
  const [projectId, setProjectId] = useState<string | null>(null)
  const instantiate = useApiMutation('checklists', 'instantiate', {
    successMessage: 'Прогін створено',
    onSuccess: (run) => {
      onOpenChange(false)
      navigate(`/checklists/${run.id}`)
    }
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Запустити прогін"
      description="Створюється копія шаблону, у якій можна позначати пункти. Шаблон не змінюється."
      submitLabel="Запустити"
      invalid={!template}
      pending={instantiate.isPending}
      onSubmit={() => {
        if (template)
          instantiate.mutate({ templateId: template.id, title: title.trim(), projectId })
      }}
      className="sm:max-w-120"
    >
      <Field label="Назва прогону" htmlFor="run-title" required={REQUIRED.title}>
        <Input
          id="run-title"
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

/** Opens clean every time: created anew on each opening (freshOnOpen). */
export const LaunchDialog = freshOnOpen(LaunchDialogForm, { identity: (p) => p.template?.id })
