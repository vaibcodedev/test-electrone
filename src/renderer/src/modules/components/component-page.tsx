import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Clipboard, Code2, Columns2, ExternalLink, ImagePlus, Monitor, Trash2, X } from 'lucide-react'
import {
  COMPONENT_LANGUAGES,
  PREVIEW_BACKGROUNDS,
  type ComponentLanguage,
  type ComponentPatch,
  type PreviewBackground,
  type UiComponent
} from '@shared/domain/components'
import type { FileSource } from '@shared/domain/designs'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fileUrl, isImageFile } from '@/lib/files'
import { useAutosave } from '@/hooks/use-autosave'
import { useFileDrop, usePasteFiles } from '@/hooks/use-file-drop'
import { EmptyState, Field } from '@/components/common/page'
import { CodeEditor } from '@/components/common/code'
import { LivePreview } from '@/components/common/live-preview'
import { EntityAside, InlineTitle } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { PREVIEW_IMPORTS } from './starter'

type Layout = 'split' | 'code' | 'preview'

const BG_LABEL: Record<PreviewBackground, string> = { light: 'Светлый', dark: 'Тёмный', grid: 'Сетка' }
const LAYOUTS: { value: Layout; label: string; icon: typeof Code2 }[] = [
  { value: 'code', label: 'Только код', icon: Code2 },
  { value: 'split', label: 'Код и превью', icon: Columns2 },
  { value: 'preview', label: 'Только превью', icon: Monitor }
]

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-full bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] transition-colors',
            value === o.value ? 'bg-ink text-ink-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Screenshot / GIF of the component: drop, paste (Ctrl+V) or take from clipboard. */
function CoverField({ item }: { item: UiComponent }) {
  const setCover = useApiMutation('components', 'setCover', { successMessage: 'Обложка обновлена' })
  const removeCover = useApiMutation('components', 'removeCover')
  const apply = (sources: FileSource[]): void => {
    if (sources[0]) setCover.mutate({ id: item.id, source: sources[0] })
  }
  const { isOver, props } = useFileDrop(apply, { accept: isImageFile })
  usePasteFiles(apply)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[12px] text-muted-foreground">Скриншот или GIF</h3>
      <div
        {...props}
        className={cn(
          'relative overflow-hidden rounded-2xl border border-dashed border-input transition-colors',
          isOver && 'border-ring bg-lime-soft'
        )}
      >
        {item.coverPath ? (
          <>
            <img src={fileUrl(item.coverPath)} alt="" className="max-h-48 w-full object-cover" />
            <button
              type="button"
              onClick={() => removeCover.mutate(item.id)}
              className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-ink/80 text-ink-foreground hover:bg-ink"
              title="Убрать обложку"
            >
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 px-3 py-6 text-center text-[12px] text-muted-foreground">
            <ImagePlus className="size-5" />
            Перетащите картинку или нажмите Ctrl+V
          </div>
        )}
      </div>
      <Button
        variant="soft"
        size="xs"
        className="self-start"
        onClick={() => setCover.mutate({ id: item.id, source: { kind: 'clipboard' } })}
      >
        <Clipboard /> Из буфера обмена
      </Button>
    </section>
  )
}

function Editor({ item }: { item: UiComponent }) {
  const navigate = useNavigate()
  const update = useApiMutation('components', 'update', { silent: false })
  const remove = useApiMutation('components', 'remove', { successMessage: 'Компонент в корзине' })
  const save = (patch: ComponentPatch): void => update.mutate({ id: item.id, patch })
  const [layout, setLayout] = useState<Layout>('split')

  const [title, setTitle] = useAutosave(item.title, (title) => title.trim() && save({ title }))
  const [code, setCode] = useAutosave(item.code, (code) => save({ code }), 800)
  const [description, setDescription] = useAutosave(item.description, (description) => save({ description }))
  const [sourceUrl, setSourceUrl] = useAutosave(item.sourceUrl, (sourceUrl) => save({ sourceUrl }))

  const editorHeight = 'calc(100vh - 210px)'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate('/components')} title="Ко всем компонентам">
          <ArrowLeft />
        </Button>
        <InlineTitle value={title} onChange={setTitle} className="min-w-0 flex-1 text-[24px]" />
        <Segmented<ComponentLanguage>
          value={item.language}
          onChange={(language) => save({ language })}
          options={COMPONENT_LANGUAGES.map((l) => ({ value: l, label: l.toUpperCase() }))}
        />
        <Segmented<Layout>
          value={layout}
          onChange={setLayout}
          options={LAYOUTS.map((l) => ({ value: l.value, title: l.label, label: <l.icon className="size-3.5" /> }))}
        />
        <PinButtons entity={{ type: 'component', id: item.id }} />
        <Confirm
          title="Удалить компонент?"
          description="Он попадёт в корзину на 30 дней."
          confirmLabel="В корзину"
          onConfirm={() => {
            remove.mutate(item.id)
            navigate('/components')
          }}
        >
          <Button variant="ghost" size="icon-sm" title="В корзину">
            <Trash2 />
          </Button>
        </Confirm>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {layout !== 'preview' && (
          <div className="flex min-w-0 flex-1 flex-col">
            <CodeEditor
              value={code}
              onChange={setCode}
              language={item.language}
              minHeight={editorHeight}
              maxHeight={editorHeight}
              className="flex-1"
            />
          </div>
        )}
        {layout !== 'code' && (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">Живое превью</span>
              <Segmented<PreviewBackground>
                value={item.previewBg}
                onChange={(previewBg) => save({ previewBg })}
                options={PREVIEW_BACKGROUNDS.map((b) => ({ value: b, label: BG_LABEL[b] }))}
              />
            </div>
            <LivePreview code={code} language={item.language} bg={item.previewBg} className="flex-1" />
          </div>
        )}

        <aside className="flex w-[280px] shrink-0 flex-col gap-6 overflow-y-auto rounded-2xl bg-surface/60 p-4">
          <Field label="Описание">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Где используется, какие пропсы"
              className="bg-card"
            />
          </Field>
          <Field label="Источник">
            <div className="flex gap-1.5">
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://…"
                className="bg-card"
              />
              {/^https?:\/\//i.test(sourceUrl) && (
                <Button variant="soft" size="icon" title="Открыть" onClick={() => api.app.openExternal(sourceUrl)}>
                  <ExternalLink />
                </Button>
              )}
            </div>
          </Field>
          <CoverField item={item} />
          <section className="flex flex-col gap-1.5">
            <h3 className="text-[12px] text-muted-foreground">Доступно в превью</h3>
            <div className="flex flex-wrap gap-1">
              {PREVIEW_IMPORTS.map((m) => (
                <code key={m} className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[11px]">
                  {m}
                </code>
              ))}
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Tailwind-классы работают. Покажется <code className="font-mono">export default</code> или компонент с именем
              App / Demo / Preview, либо вызов <code className="font-mono">render(&lt;X /&gt;)</code>.
            </p>
          </section>
          <EntityAside
            entity={{ type: 'component', id: item.id }}
            tags={item.tags}
            onTagsChange={(tagIds) => save({ tagIds })}
            createdAt={item.createdAt}
            updatedAt={item.updatedAt}
            files={false}
          />
        </aside>
      </div>
    </div>
  )
}

export function ComponentPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('components', 'get', id)
  if (isLoading) return null
  if (!data)
    return (
      <EmptyState
        title="Компонент не найден"
        hint="Возможно, он в корзине."
        action={<Button onClick={() => navigate('/components')}>Ко всем компонентам</Button>}
      />
    )
  return <Editor key={data.id} item={data} />
}
