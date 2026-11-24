import { useState } from 'react'
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
import { EmptyState, Field, Segmented } from '@/components/common/page'
import { CodeEditor } from '@/components/common/code'
import { LivePreview } from '@/components/common/live-preview'
import { EntityAside, InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyMedia } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { PREVIEW_IMPORTS } from './starter'

type Layout = 'split' | 'code' | 'preview'

const BG_LABEL: Record<PreviewBackground, string> = { light: 'Светлый', dark: 'Тёмный', grid: 'Сетка' }
const LAYOUTS: { value: Layout; label: string; icon: typeof Code2 }[] = [
  { value: 'code', label: 'Только код', icon: Code2 },
  { value: 'split', label: 'Код и превью', icon: Columns2 },
  { value: 'preview', label: 'Только превью', icon: Monitor }
]

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
      <SectionLabel>Скриншот или GIF</SectionLabel>
      <div {...props}>
        {item.coverPath ? (
          <Card className={cn('relative gap-0 overflow-hidden bg-card py-0', isOver && 'ring-2 ring-ring')}>
            <img src={fileUrl(item.coverPath)} alt="" className="max-h-48 w-full object-cover" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="soft"
                  size="icon-xs"
                  aria-label="Убрать обложку"
                  className="absolute top-2 right-2 bg-card/90 hover:bg-card"
                  onClick={() => removeCover.mutate(item.id)}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Убрать обложку</TooltipContent>
            </Tooltip>
          </Card>
        ) : (
          <Empty className={cn('gap-2 border border-dashed border-input p-5 md:p-5', isOver && 'border-ring bg-lime-soft')}>
            <EmptyMedia variant="icon" className="size-9 rounded-full bg-card">
              <ImagePlus className="size-4 text-muted-foreground" />
            </EmptyMedia>
            <EmptyDescription className="text-caption">Перетащите картинку или нажмите Ctrl+V</EmptyDescription>
          </Empty>
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Ко всем компонентам" onClick={() => navigate('/components')}>
              <ArrowLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ко всем компонентам</TooltipContent>
        </Tooltip>
        <InlineTitle value={title} onChange={setTitle} className="min-w-0 flex-1 text-[24px]" />
        <Segmented<ComponentLanguage>
          size="xs"
          value={item.language}
          onChange={(language) => save({ language })}
          options={COMPONENT_LANGUAGES.map((l) => ({ value: l, label: l.toUpperCase() }))}
        />
        <Segmented<Layout>
          value={layout}
          onChange={setLayout}
          size="xs"
          options={LAYOUTS.map((l) => ({ value: l.value, title: l.label, label: <l.icon /> }))}
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
          <Button variant="ghost" size="icon-sm" aria-label="В корзину">
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
              <span className="text-caption font-medium text-muted-foreground">Живое превью</span>
              <Segmented<PreviewBackground>
                size="xs"
                value={item.previewBg}
                onChange={(previewBg) => save({ previewBg })}
                options={PREVIEW_BACKGROUNDS.map((b) => ({ value: b, label: BG_LABEL[b] }))}
              />
            </div>
            <LivePreview code={code} language={item.language} bg={item.previewBg} className="flex-1" />
          </div>
        )}

        <Card className="w-[280px] shrink-0 gap-6 overflow-y-auto px-4 py-4">
          <Field label="Описание">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Где используется, какие пропсы"
              className="min-h-20 bg-card"
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="soft" size="icon" className="bg-card" aria-label="Открыть источник" onClick={() => api.app.openExternal(sourceUrl)}>
                      <ExternalLink />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Открыть источник</TooltipContent>
                </Tooltip>
              )}
            </div>
          </Field>
          <CoverField item={item} />
          <Separator />
          <section className="flex flex-col gap-2">
            <SectionLabel>Доступно в превью</SectionLabel>
            <div className="flex flex-wrap gap-1">
              {PREVIEW_IMPORTS.map((m) => (
                <Badge key={m} variant="outline" className="bg-card font-mono text-meta font-normal">
                  {m}
                </Badge>
              ))}
            </div>
            <p className="text-meta leading-relaxed text-muted-foreground">
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
        </Card>
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
