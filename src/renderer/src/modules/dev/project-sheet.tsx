import type { ReactElement } from 'react'
import { ExternalLink, FolderOpen, Play, Square, Trash2 } from 'lucide-react'
import { openUrl } from '@/lib/open-url'
import { devProjectInputSchema, type DevProject, type Editor } from '@shared/domain/dev'
import { limitsOf } from '@/lib/limits'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { fmtDateTime } from '@/lib/format'
import { reportError } from '@/lib/error-reporting'
import { toast } from 'sonner'
import { useAutosave } from '@/hooks/use-autosave'
import { Field, Segmented } from '@/components/common/page'
import { InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from '@/components/ui/item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { defaultScript } from './dev-shared'

const AUTO = '__auto'
const LIMITS = limitsOf(devProjectInputSchema)
/** Empty or owner/repo; invalid values are shown with an error and not saved. */
const repoOk = (v: string): boolean => !v.trim() || /^[\w.-]+\/[\w.-]+$/.test(v.trim())

function Editor({
  project: p,
  onClose
}: {
  project: DevProject
  onClose: () => void
}): ReactElement {
  const update = useApiMutation('devProjects', 'update')
  const open = useApiMutation('devProjects', 'open')
  const remove = useApiMutation('devProjects', 'remove', {
    successMessage: 'Проєкт прибрано з Vault'
  })
  const run = useApiMutation('devProjects', 'run')
  const stop = useApiMutation('devProjects', 'stop')
  const save = (patch: Parameters<typeof update.mutate>[0]['patch']): void =>
    update.mutate({ id: p.id, patch })
  const [name, setName] = useAutosave(p.name, (v) => v.trim() && save({ name: v.trim() }))
  const [notes, setNotes] = useAutosave(p.notes, (v) => save({ notes: v }))
  const [repo, setRepo] = useAutosave(
    p.githubRepo,
    (v) => repoOk(v) && save({ githubRepo: v.trim() })
  )
  const scripts = Object.keys(p.scripts)
  const auto = defaultScript({ ...p, mainScript: '' })

  return (
    <div className="flex flex-col gap-5">
      <InlineTitle value={name} onChange={setName} maxLength={LIMITS.name} />

      <Field label="Папка">
        <InputGroup>
          {/* Clipped from the left with «…»: the folder's own name at the end is what tells projects apart.
              text-left: rtl alone pushed a short path that fits against the buttons. */}
          <span
            className="min-w-0 flex-1 truncate px-3 text-left text-body"
            title={p.path}
            dir="rtl"
          >
            <bdi>{p.path}</bdi>
          </span>
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="xs"
              onClick={() => open.mutate({ projectId: p.id, target: 'folder' })}
            >
              <FolderOpen /> Відкрити
            </InputGroupButton>
            <InputGroupButton
              size="xs"
              onClick={async () => {
                try {
                  const path = await api.devProjects.pickFolder()
                  if (path) save({ path })
                } catch (e) {
                  toast.error((e as Error).message)
                  reportError(e, 'dev:pickFolder')
                }
              }}
            >
              Змінити
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Типовий редактор">
          <Segmented<Editor>
            value={p.editor}
            onChange={(editor) => save({ editor })}
            options={[
              { value: 'vscode', label: 'VS Code' },
              { value: 'cursor', label: 'Cursor' }
            ]}
          />
        </Field>
        <Field label="Кнопка «Запустити»">
          <Select
            value={p.mainScript && p.mainScript in p.scripts ? p.mainScript : AUTO}
            onValueChange={(v) => save({ mainScript: v === AUTO ? '' : v })}
          >
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

      <Field
        label="Репозиторій GitHub (owner/repo)"
        error={repoOk(repo) ? undefined : 'Формат: owner/repo, наприклад vercel/next.js'}
      >
        <InputGroup>
          <InputGroupInput
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="визначається за git remote"
            spellCheck={false}
            maxLength={LIMITS.githubRepo}
            aria-invalid={!repoOk(repo) || undefined}
          />
          {repo && repoOk(repo) && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Відкрити на GitHub"
                onClick={() => openUrl(`https://github.com/${repo}`)}
              >
                <ExternalLink />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </Field>

      <section className="flex flex-col gap-2">
        <SectionLabel>Скрипти package.json</SectionLabel>
        {scripts.length === 0 ? (
          <p className="text-caption text-muted-foreground">
            У папці немає package.json або в ньому немає скриптів.
          </p>
        ) : (
          <ItemGroup className="gap-1">
            {scripts.map((s) => {
              const r = p.running.find((x) => x.script === s)
              return (
                <Item key={s} size="xs" variant="muted">
                  <ItemContent className="min-w-0 gap-0">
                    <ItemTitle className="font-mono text-caption">{s}</ItemTitle>
                    <ItemDescription className="truncate font-mono text-meta">
                      {p.scripts[s]}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {r ? (
                      <Button size="xs" variant="outline" onClick={() => stop.mutate(r.runId)}>
                        <Square /> Зупинити
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        variant="soft"
                        className="bg-card"
                        onClick={() => run.mutate({ projectId: p.id, script: s })}
                      >
                        <Play /> Запустити
                      </Button>
                    )}
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>
        )}
      </section>

      <MarkdownField
        label="Нотатки"
        value={notes}
        onChange={setNotes}
        placeholder="Як запускати, змінні оточення, доступи до стендів…"
        minHeight="120px"
        maxLength={LIMITS.notes}
      />

      <Field label="Додано">
        <Input readOnly value={fmtDateTime(p.createdAt)} />
      </Field>

      <Confirm
        title={`Прибрати «${p.name}» з Vault?`}
        description="Папку на диску не буде видалено — проєкт просто зникне зі списку. Запущені скрипти буде зупинено."
        confirmLabel="Прибрати"
        onConfirm={() => {
          remove.mutate(p.id)
          onClose()
        }}
      >
        <Button
          variant="ghost"
          className="-ml-3 self-start text-muted-foreground hover:text-destructive"
        >
          <Trash2 /> Прибрати з Vault
        </Button>
      </Confirm>
    </div>
  )
}

/** Project details in a right sheet (?open=id). */
export function ProjectSheet({
  project,
  onClose
}: {
  project: DevProject | null
  onClose: () => void
}): ReactElement {
  return (
    <Sheet open={!!project} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-130 overflow-y-auto sm:max-w-130">
        <SheetHeader className="px-6 pb-0">
          <SheetTitle className="sr-only">Проєкт</SheetTitle>
          <SheetDescription className="sr-only">Налаштування локального проєкту</SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          {project && <Editor key={project.id} project={project} onClose={onClose} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
