import { useRef, useState, type ReactElement } from 'react'
import { RefreshCw, Replace } from 'lucide-react'
import { DESIGN_KINDS, designInputSchema, type Design, type DesignKind, type DesignPatch } from '@shared/domain/designs'
import { limitsOf } from '@/lib/limits'
import { invalidateAll, useApi, useApiMutation } from '@/lib/query'
import { toFileSources } from '@/lib/files'
import { reportError } from '@/lib/error-reporting'
import { useAutosave } from '@/hooks/use-autosave'
import { DetailPane, EntityAside, InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { Field, Segmented } from '@/components/common/page'
import { LinkInput } from '@/components/common/text-field'
import { copyText } from '@/components/common/copy-button'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { IconAction } from '@/components/common/icon-action'
import { AddToMoodboard, DesignMedia, KIND_LABEL } from './shared'
import { MEDIA_ACCEPT, fillPalette, isVideoPath } from './media'

const LIMITS = limitsOf(designInputSchema)

/** idle — nothing tried in this pane yet; busy — extracting; failed — tried and got no colours. */
type PaletteState = 'idle' | 'busy' | 'failed'

function Swatches({ colors, state, onRecalc }: { colors: string[]; state: PaletteState; onRecalc: () => void }): ReactElement | null {
  const readOnly = useReadOnly()
  // Nothing to show while reading: the empty section hides like any empty field.
  if (!colors.length && readOnly) return null
  const empty =
    state === 'busy' ? (
      <span className="text-caption text-muted-foreground">Визначається…</span>
    ) : (
      <span className="flex items-center gap-1 text-caption text-muted-foreground">
        {state === 'failed' ? 'Не вдалося визначити кольори' : 'Кольори ще не визначено'}
        <IconAction label={state === 'failed' ? 'Спробувати ще' : 'Визначити кольори'} onClick={onRecalc}>
          <RefreshCw />
        </IconAction>
      </span>
    )
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel
        action={
          colors.length > 0 && (
            <IconAction label="Перерахувати палітру" data-edit-only disabled={state === 'busy'} onClick={onRecalc}>
              <RefreshCw />
            </IconAction>
          )
        }
      >
        Палітра
      </SectionLabel>
      {colors.length ? (
        <div className="flex flex-wrap gap-1">
          {colors.map((c) => (
            <Tooltip key={c}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-auto flex-col gap-1 rounded-2xl px-1.5 py-1.5"
                  aria-label={`Скопіювати ${c}`}
                  onClick={() => void copyText(c, `${c} скопійовано`)}
                >
                  <span className="size-10 rounded-xl ring-1 ring-border" style={{ background: c }} />
                  <span className="font-mono text-meta font-normal text-muted-foreground">{c}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Скопіювати {c}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      ) : (
        empty
      )}
    </section>
  )
}

function Editor({ design, onClose }: { design: Design; onClose: () => void }): ReactElement {
  const update = useApiMutation('designs', 'update')
  const remove = useApiMutation('designs', 'remove', { successMessage: 'Дизайн переміщено в кошик' })
  const replace = useApiMutation('designs', 'replaceImage', {
    successMessage: 'Картинку замінено',
    // A new image starts without a palette (the server clears it): extract it right away.
    onSuccess: (d) =>
      void fillPalette(d)
        .then((colors) => colors.length && invalidateAll())
        .catch((e) => reportError(e, 'designs:palette'))
  })
  const save = (patch: DesignPatch): void => update.mutate({ id: design.id, patch })
  const [title, setTitle] = useAutosave(design.title, (title) => save({ title }))
  const [notes, setNotes] = useAutosave(design.notes, (notes) => save({ notes }))
  const [palette, setPalette] = useState<PaletteState>('idle')
  const fileInput = useRef<HTMLInputElement>(null)
  const video = !!design.imagePath && isVideoPath(design.imagePath)

  const recalc = async (): Promise<void> => {
    setPalette('busy')
    try {
      const colors = await fillPalette(design)
      if (colors.length) invalidateAll()
      setPalette(colors.length ? 'idle' : 'failed')
    } catch (e) {
      reportError(e, 'designs:palette')
      setPalette('failed')
    }
  }

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
          {/* A video has no palette to extract. */}
          {!video && design.imagePath && <Swatches colors={design.colors} state={palette} onRecalc={() => void recalc()} />}
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        <Card className="group relative gap-0 overflow-hidden bg-surface p-2">
          <DesignMedia path={design.imagePath} className="max-h-[60vh] w-full rounded-2xl object-contain" />
          <input
            ref={fileInput}
            type="file"
            accept={MEDIA_ACCEPT}
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
            <Replace /> Замінити
          </Button>
        </Card>
        <InlineTitle value={title} onChange={setTitle} placeholder="Назва або сайт" maxLength={LIMITS.title} />
        <Field label="Тип">
          {/* Six options: xs, and a narrow pane wraps them instead of overflowing. */}
          <Segmented<DesignKind>
            size="xs"
            className="max-w-full data-[variant=segment]:flex-wrap"
            options={DESIGN_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            value={design.kind}
            onChange={(kind) => save({ kind })}
          />
        </Field>
        <LinkInput
          label="Оригінал"
          value={design.sourceUrl}
          onSave={(sourceUrl) => save({ sourceUrl })}
          maxLength={LIMITS.sourceUrl}
          openLabel="Відкрити оригінал"
        />
        <Field label="Нотатки" count={{ length: notes.length, max: LIMITS.notes }}>
          <Textarea
            value={notes}
            maxLength={LIMITS.notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Що сподобалося, що взяти"
            className="min-h-24"
          />
        </Field>
      </div>
    </DetailPane>
  )
}

export function DesignDetail({ id, onClose }: { id: string; onClose: () => void }): ReactElement | null {
  const { data } = useApi('designs', 'get', id)
  if (!data) return null
  return <Editor key={data.id} design={data} onClose={onClose} />
}
