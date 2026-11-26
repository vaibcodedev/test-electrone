import { useRef, useState, type ReactElement, type RefObject } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, FolderOpen, Maximize2, RefreshCw, Replace } from 'lucide-react'
import {
  DESIGN_KINDS,
  designInputSchema,
  type Design,
  type DesignKind,
  type DesignPatch
} from '@shared/domain/designs'
import { revealStoredFile } from '@/lib/files'
import { limitsOf } from '@/lib/limits'
import { cn } from '@/lib/utils'
import { useApiMutation, useInPlaceApi } from '@/lib/query'
import { RecordLoadError } from '@/components/common/record-load-error'
import { api } from '@/lib/api'
import { toFileSources } from '@/lib/files'
import { reportError } from '@/lib/error-reporting'
import { useAutosave } from '@/hooks/use-autosave'
import {
  DetailPane,
  EntityAside,
  InlineTitle,
  SectionLabel
} from '@/components/common/master-detail'
import { toastTrashed } from '@/components/common/trash-toast'
import { Field, Segmented } from '@/components/common/page'
import { LinkInput } from '@/components/common/text-field'
import { copyText } from '@/components/common/copy-button'
import { useReadOnly } from '@/components/common/detail-mode-context'
import type { DetailMode } from '@/components/common/detail-mode'
import { ButtonGroup } from '@/components/ui/button-group'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { IconAction } from '@/components/common/icon-action'
import { AddToMoodboard, DesignMedia } from './shared'
import { KIND_LABEL, designFileMeta, designTitle } from './labels'
import { MEDIA_ACCEPT, fillPalette, isVideoPath } from './media'

const LIMITS = limitsOf(designInputSchema)

/** idle — nothing tried in this pane yet; busy — extracting; failed — tried and got no colours. */
type PaletteState = 'idle' | 'busy' | 'failed'

function Swatches({
  colors,
  state,
  onRecalc
}: {
  colors: string[]
  state: PaletteState
  onRecalc: () => void
}): ReactElement | null {
  const readOnly = useReadOnly()
  // Nothing to show while reading: the empty section hides like any empty field.
  if (!colors.length && readOnly) return null
  const empty =
    state === 'busy' ? (
      <span className="text-caption text-muted-foreground">Визначається…</span>
    ) : (
      <span className="flex items-center gap-1 text-caption text-muted-foreground">
        {state === 'failed' ? 'Не вдалося визначити кольори' : 'Кольори ще не визначено'}
        <IconAction
          label={state === 'failed' ? 'Спробувати ще' : 'Визначити кольори'}
          onClick={onRecalc}
        >
          <RefreshCw />
        </IconAction>
      </span>
    )
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel
        action={
          colors.length > 0 && (
            <IconAction
              label="Перерахувати палітру"
              data-edit-only
              disabled={state === 'busy'}
              onClick={onRecalc}
            >
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
                  <span
                    className="size-10 rounded-xl ring-1 ring-border"
                    style={{ background: c }}
                  />
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

/** Reading, an untitled design is named the way its tile, search and pins name it (site or «Знімок …»). */
function DesignTitle({
  design,
  value,
  onChange
}: {
  design: Design
  value: string
  onChange: (v: string) => void
}): ReactElement {
  const readOnly = useReadOnly()
  return (
    <InlineTitle
      value={value}
      onChange={onChange}
      placeholder={readOnly ? designTitle(design) : 'Назва або сайт'}
      maxLength={LIMITS.title}
    />
  )
}

/** Neighbours in the gallery for ← / → (DesignDialog); null at either end. */
export interface DesignNav {
  prev: string | null
  next: string | null
  go: (id: string | null) => void
}

/** «‹ ›» in the header: the same steps as ← / →, for the mouse; hidden while editing (the record is held). */
function NavButtons({ nav }: { nav: DesignNav }): ReactElement | null {
  const reading = useReadOnly()
  if (!reading) return null
  return (
    <ButtonGroup aria-label="Інші дизайни">
      <IconAction
        size="icon-sm"
        label="Попередній дизайн"
        shortcut="←"
        disabled={!nav.prev}
        onClick={() => nav.go(nav.prev)}
      >
        <ChevronLeft />
      </IconAction>
      <IconAction
        size="icon-sm"
        label="Наступний дизайн"
        shortcut="→"
        disabled={!nav.next}
        onClick={() => nav.go(nav.next)}
      >
        <ChevronRight />
      </IconAction>
    </ButtonGroup>
  )
}

function Editor({
  design,
  onClose,
  modeRef,
  nav
}: {
  design: Design
  onClose: () => void
  modeRef?: RefObject<DetailMode | null>
  nav?: DesignNav
}): ReactElement {
  const update = useApiMutation('designs', 'update')
  const remove = useApiMutation('designs', 'remove', {
    onSuccess: (_r, id) => toastTrashed('Дизайн переміщено в кошик', { type: 'design', id })
  })
  const replace = useApiMutation('designs', 'replaceImage', {
    successMessage: 'Картинку замінено',
    // A new image starts without a palette (the server clears it): extract it right away, through the same
    // state as the button (no second extraction, «Не вдалося…» on failure). `d`, not `design`: the closure
    // still holds the old image path.
    onSuccess: (d) => void recalc(d)
  })
  const save = (patch: DesignPatch): void => update.mutate({ id: design.id, patch })
  const [title, setTitle] = useAutosave(design.title, (title) => save({ title }))
  const [notes, setNotes] = useAutosave(design.notes, (notes) => save({ notes }))
  const [palette, setPalette] = useState<PaletteState>('idle')
  const fileInput = useRef<HTMLInputElement>(null)
  /** Only the latest extraction sets the state: one for a replaced image ends without colours and must not say «Не вдалося». */
  const latest = useRef(0)
  const video = !!design.imagePath && isVideoPath(design.imagePath)

  // The write itself refreshes the queries (data:changed). The same image twice shares one extraction
  // (fillPalette), and one started for a replaced image never writes its colours.
  const recalc = async (target: Pick<Design, 'id' | 'imagePath'> = design): Promise<void> => {
    const call = ++latest.current
    setPalette('busy')
    let next: PaletteState
    try {
      next = (await fillPalette(target)).length ? 'idle' : 'failed'
    } catch (e) {
      reportError(e, 'designs:palette')
      next = 'failed'
    }
    if (call === latest.current) setPalette(next)
  }

  const openImage = (): void => {
    if (!design.imagePath) return
    api.files.openPath(design.imagePath).catch((e) => {
      reportError(e, 'designs:open')
      toast.error(video ? 'Не вдалося відкрити відео' : 'Не вдалося відкрити картинку')
    })
  }

  return (
    <DetailPane
      entity={{ type: 'design', id: design.id }}
      modeRef={modeRef}
      // The dialog is the frame: no second border, shadow or slide-in of a side pane.
      className="animate-none rounded-none border-0 shadow-none"
      onClose={onClose}
      onDelete={() => remove.mutate(design.id)}
      headerExtra={
        <>
          {nav && <NavButtons nav={nav} />}
          <AddToMoodboard designId={design.id} />
        </>
      }
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
          {!video && design.imagePath && (
            <Swatches colors={design.colors} state={palette} onRecalc={() => void recalc()} />
          )}
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        {/* p-2.5: Card's 28px corner minus 10px is the picture's 18 (rounded-xl) — concentric corners. */}
        <Card className="group relative gap-0 overflow-hidden bg-surface p-2.5">
          {/* A tall page screenshot stays a preview here; the full size opens in the system viewer. The click is a
              mouse shortcut, the keyboard has «Відкрити картинку» in the corner. */}
          {video ? (
            // A video plays here by its own ▶ (the player's controls); a click on it must not open the system viewer.
            <DesignMedia
              path={design.imagePath}
              full
              play="controls"
              className="max-h-[56vh] w-full rounded-xl object-contain"
            />
          ) : (
            <div className="cursor-zoom-in" onClick={openImage}>
              <DesignMedia
                path={design.imagePath}
                full
                alt={designTitle(design)}
                className="max-h-[56vh] w-full rounded-xl object-contain"
              />
            </div>
          )}
          {design.imagePath && (
            // top/right 5: inside the picture, clear of the card's 28px corner curve.
            <div className="absolute top-5 right-5 flex gap-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-focus-visible:opacity-100">
              <IconAction
                label="Показати в папці"
                className="bg-card shadow-sm hover:bg-card"
                onClick={() => void revealStoredFile(design.imagePath!)}
              >
                <FolderOpen />
              </IconAction>
              <IconAction
                label={video ? 'Відкрити відео' : 'Відкрити картинку'}
                className="bg-card shadow-sm hover:bg-card"
                onClick={openImage}
              >
                <Maximize2 />
              </IconAction>
            </div>
          )}
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
          {/* Edit only: a new file changes the record (DS §8). */}
          <Button
            data-edit-only
            variant="soft"
            size="sm"
            // Clear of the corner curve; on a video it goes to the top-left, off the player's bar.
            className={cn(
              'absolute bg-card opacity-0 shadow-sm group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-card focus-visible:opacity-100',
              video ? 'top-5 left-5' : 'right-5 bottom-5'
            )}
            onClick={() => fileInput.current?.click()}
          >
            <Replace /> Замінити
          </Button>
        </Card>
        <div className="flex flex-col gap-1">
          <DesignTitle design={design} value={title} onChange={setTitle} />
          {designFileMeta(design) && (
            <span className="text-caption text-muted-foreground tabular-nums">
              {designFileMeta(design)}
            </span>
          )}
        </div>
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

export function DesignDetail({
  id,
  onClose,
  modeRef,
  nav
}: {
  id: string
  onClose: () => void
  modeRef?: RefObject<DetailMode | null>
  nav?: DesignNav
}): ReactElement | null {
  const record = useInPlaceApi('designs', 'get', id)
  const { data } = record
  if (record.failed) return <RecordLoadError onRetry={record.retry} onClose={onClose} />
  if (!data) return null
  return <Editor key={data.id} design={data} onClose={onClose} modeRef={modeRef} nav={nav} />
}
