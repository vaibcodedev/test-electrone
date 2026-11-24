import { ExternalLink, FolderOpen, Play, Square, Trash2 } from 'lucide-react'
import type { DevProject, Editor } from '@shared/domain/dev'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { Field, Segmented } from '@/components/common/page'
import { InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { defaultScript } from './dev-shared'

const AUTO = '__auto'

function Editor({ project: p, onClose }: { project: DevProject; onClose: () => void }) {
  const update = useApiMutation('devProjects', 'update', { silent: false })
  const remove = useApiMutation('devProjects', 'remove', { successMessage: 'Проект убран из Vault' })
  const run = useApiMutation('devProjects', 'run')
  const stop = useApiMutation('devProjects', 'stop')
  const save = (patch: Parameters<typeof update.mutate>[0]['patch']): void => update.mutate({ id: p.id, patch })
  const [name, setName] = useAutosave(p.name, (v) => v.trim() && save({ name: v.trim() }))
  const [notes, setNotes] = useAutosave(p.notes, (v) => save({ notes: v }))
  const [repo, setRepo] = useAutosave(p.githubRepo, (v) => save({ githubRepo: v.trim() }))
  const scripts = Object.keys(p.scripts)
  const auto = defaultScript({ ...p, mainScript: '' })

  return (
    <div className="flex flex-col gap-5">
      <InlineTitle value={name} onChange={setName} />

      <Field label="Папка">
        <InputGroup>
          <InputGroupInput readOnly value={p.path} title={p.path} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="xs" onClick={() => api.devProjects.open({ projectId: p.id, target: 'folder' })}>
              <FolderOpen /> Открыть
            </InputGroupButton>
            <InputGroupButton
              size="xs"
              onClick={async () => {
                const path = await api.devProjects.pickFolder()
                if (path) save({ path })
              }}
            >
              Изменить
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Редактор по умолчанию">
          <Segmented<Editor>
            value={p.editor}
            onChange={(editor) => save({ editor })}
            options={[
              { value: 'vscode', label: 'VS Code' },
              { value: 'cursor', label: 'Cursor' }
            ]}
          />
        </Field>
        <Field label="Кнопка «Запустить»">
          <Select value={p.mainScript && p.mainScript in p.scripts ? p.mainScript : AUTO} onValueChange={(v) => save({ mainScript: v === AUTO ? '' : v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>Авто{auto ? ` (${auto})` : ''}</SelectItem>
              {scripts.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Репозиторий GitHub (owner/repo)">
        <InputGroup>
          <InputGroupInput value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="определяется по git remote" />
          {repo && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Открыть на GitHub" onClick={() => api.app.openExternal(`https://github.com/${repo}`)}>
                <ExternalLink />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </Field>

      <section className="flex flex-col gap-2">
        <SectionLabel>Скрипты package.json</SectionLabel>
        {scripts.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">В папке нет package.json или в нём нет скриптов.</p>
        ) : (
          <ItemGroup className="gap-1">
            {scripts.map((s) => {
              const r = p.running.find((x) => x.script === s)
              return (
                <Item key={s} size="xs" variant="muted">
                  <ItemContent className="min-w-0 gap-0">
                    <ItemTitle className="font-mono text-[12.5px]">{s}</ItemTitle>
                    <ItemDescription className="truncate font-mono text-[11px]">{p.scripts[s]}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {r ? (
                      <Button size="xs" variant="outline" onClick={() => stop.mutate(r.runId)}>
                        <Square /> Стоп
                      </Button>
                    ) : (
                      <Button size="xs" variant="soft" className="bg-card" onClick={() => run.mutate({ projectId: p.id, script: s })}>
                        <Play /> Запустить
                      </Button>
                    )}
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>
        )}
      </section>

      <MarkdownField label="Заметки" value={notes} onChange={setNotes} placeholder="Как запускать, переменные окружения, доступы к стендам…" minHeight="120px" />

      <Field label="Добавлен">
        <Input readOnly value={new Date(p.createdAt).toLocaleString('ru-RU')} />
      </Field>

      <Confirm
        title={`Убрать «${p.name}» из Vault?`}
        description="Папка на диске не удаляется — проект просто пропадёт из списка. Запущенные скрипты будут остановлены."
        confirmLabel="Убрать"
        onConfirm={() => {
          remove.mutate(p.id)
          onClose()
        }}
      >
        <Button variant="ghost" className="self-start text-destructive hover:text-destructive">
          <Trash2 /> Убрать из Vault
        </Button>
      </Confirm>
    </div>
  )
}

/** Project details in a right sheet (?open=id). */
export function ProjectSheet({ project, onClose }: { project: DevProject | null; onClose: () => void }) {
  return (
    <Sheet open={!!project} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[520px] overflow-y-auto sm:max-w-[520px]">
        <SheetHeader className="px-6 pb-0">
          <SheetTitle className="sr-only">Проект</SheetTitle>
          <SheetDescription className="sr-only">Настройки локального проекта</SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">{project && <Editor key={project.id} project={project} onClose={onClose} />}</div>
      </SheetContent>
    </Sheet>
  )
}
