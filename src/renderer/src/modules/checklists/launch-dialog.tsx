import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Rocket } from 'lucide-react'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDate } from '@/lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/page'
import { Choice } from '@/modules/crm/parts'

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
    successMessage: 'Прогон создан',
    onSuccess: (run) => {
      onOpenChange(false)
      navigate(`/checklists/${run.id}`)
    }
  })

  useEffect(() => {
    if (open && template) {
      setTitle(`${template.title} — ${fmtDate(Date.now(), 'd MMM')}`)
      setProjectId(null)
    }
  }, [open, template])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Запустить прогон</DialogTitle>
          <DialogDescription>
            Создаётся копия шаблона, в которой можно отмечать пункты. Шаблон не меняется.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (template && title.trim())
              instantiate.mutate({ templateId: template.id, title: title.trim(), projectId })
          }}
        >
          <Field label="Название прогона">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Проект">
            <Choice
              value={projectId}
              none="Без проекта"
              onChange={setProjectId}
              options={projects.map((p) => ({
                value: p.id,
                label: p.clientName ? `${p.title} — ${p.clientName}` : p.title
              }))}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="lime" disabled={!title.trim() || instantiate.isPending}>
              <Rocket /> Запустить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
