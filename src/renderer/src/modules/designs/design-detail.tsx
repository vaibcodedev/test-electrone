import { useEffect, useRef } from 'react'
import { ExternalLink, RefreshCw, Replace } from 'lucide-react'
import { toast } from 'sonner'
import { DESIGN_KINDS, type Design, type DesignPatch } from '@shared/domain/designs'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { extractPalette, fileUrl, toFileSources } from '@/lib/files'
import { useAutosave } from '@/hooks/use-autosave'
import { DetailPane, EntityAside, InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { Field, FilterChips } from '@/components/common/page'
import { copyText } from '@/components/common/copy-button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AddToMoodboard, DesignMedia, KIND_LABEL } from './shared'

function Swatches({ colors, onRecalc }: { colors: string[]; onRecalc: () => void }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Пересчитать палитру" onClick={onRecalc}>
                <RefreshCw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Пересчитать палитру</TooltipContent>
          </Tooltip>
        }
      >
        Палитра — клик копирует
      </SectionLabel>
      <div className="flex flex-wrap gap-1">
        {colors.map((c) => (
          <Button
            key={c}
            variant="ghost"
            className="h-auto flex-col gap-1 rounded-2xl px-1.5 py-1.5"
            aria-label={`Скопировать ${c}`}
            onClick={() => void copyText(c, `${c} скопирован`)}
          >
            <span className="size-10 rounded-xl ring-1 ring-border" style={{ background: c }} />
            <span className="font-mono text-[10.5px] font-normal text-muted-foreground">{c}</span>
          </Button>
        ))}
        {!colors.length && <span className="text-caption text-muted-foreground">Определяется…</span>}
      </div>
    </section>
  )
}

function Editor({ design, onClose }: { design: Design; onClose: () => void }) {
  const update = useApiMutation('designs', 'update')
  const remove = useApiMutation('designs', 'remove', { successMessage: 'Дизайн в корзине' })
  const replace = useApiMutation('designs', 'replaceImage', { successMessage: 'Картинка заменена' })
  const save = (patch: DesignPatch): void => update.mutate({ id: design.id, patch })
  const [title, setTitle] = useAutosave(design.title, (title) => save({ title }))
  const [notes, setNotes] = useAutosave(design.notes, (notes) => save({ notes }))
  const [sourceUrl, setSourceUrl] = useAutosave(design.sourceUrl, (sourceUrl) => save({ sourceUrl }))
  const fileInput = useRef<HTMLInputElement>(null)
  const tried = useRef<string | null>(null)

  const recalc = async (): Promise<void> => {
    if (!design.imagePath || /\.(mp4|webm|mov)$/i.test(design.imagePath)) return
    try {
      const colors = await extractPalette(fileUrl(design.imagePath)!)
      if (colors.length) save({ colors })
    } catch {
      toast.error('Не удалось определить цвета')
    }
  }

  // Auto-extract the palette once per image when it has none yet.
  useEffect(() => {
    if (design.colors.length || !design.imagePath || tried.current === design.imagePath) return
    tried.current = design.imagePath
    void recalc()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.imagePath, design.colors.length])

  return (
    <DetailPane
      entity={{ type: 'design', id: design.id }}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(design.id)
        onClose()
      }}
      headerExtra={<AddToMoodboard designId={design.id} />}
      aside={
        <EntityAside
          entity={{ type: 'design', id: design.id }}
          tags={design.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={design.createdAt}
          updatedAt={design.updatedAt}
          files={false}
        >
          <Swatches colors={design.colors} onRecalc={() => void recalc()} />
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        <Card className="group relative gap-0 overflow-hidden bg-surface p-2">
          <DesignMedia path={design.imagePath} className="max-h-[60vh] w-full rounded-2xl object-contain" />
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/mp4,video/webm"
            hidden
            onChange={async (e) => {
              const [source] = e.target.files ? await toFileSources(e.target.files) : []
              if (source) replace.mutate({ id: design.id, source })
              e.target.value = ''
            }}
          />
          <Button
            variant="soft"
            size="sm"
            className="absolute right-3 bottom-3 bg-card opacity-0 shadow-sm group-hover:opacity-100 hover:bg-card focus-visible:opacity-100"
            onClick={() => fileInput.current?.click()}
          >
            <Replace /> Заменить
          </Button>
        </Card>
        <InlineTitle value={title} onChange={setTitle} placeholder="Название или сайт" />
        <Field label="Тип">
          <FilterChips
            options={DESIGN_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            value={design.kind}
            onChange={(kind) => kind && save({ kind })}
          />
        </Field>
        <Field label="Оригинал">
          <div className="flex gap-1.5">
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
            {/^https?:\/\//i.test(sourceUrl) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="soft" size="icon" aria-label="Открыть оригинал" onClick={() => api.app.openExternal(sourceUrl)}>
                    <ExternalLink />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Открыть оригинал</TooltipContent>
              </Tooltip>
            )}
          </div>
        </Field>
        <Field label="Заметки — что понравилось, что взять">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-24" />
        </Field>
      </div>
    </DetailPane>
  )
}

export function DesignDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useApi('designs', 'get', id)
  if (!data) return null
  return <Editor key={data.id} design={data} onClose={onClose} />
}
