/** Header and side panel of the component page (component-page.tsx keeps the editor and the preview). */
import type { ReactElement } from 'react'
import { ArrowLeft, Clipboard, Code2, Columns2, ImagePlus, Monitor, Trash2, X } from 'lucide-react'
import {
  COMPONENT_LANGUAGES,
  componentInputSchema,
  type ComponentLanguage,
  type ComponentPatch,
  type UiComponent
} from '@shared/domain/components'
import type { FileSource } from '@shared/domain/designs'
import { useApiMutation } from '@/lib/query'
import { fileUrl, isImageFile } from '@/lib/files'
import { limitsOf } from '@/lib/limits'
import { cn } from '@/lib/utils'
import { useAutosave } from '@/hooks/use-autosave'
import { useFileDrop, usePasteFiles } from '@/hooks/use-file-drop'
import { Field, Segmented } from '@/components/common/page'
import {
  EditToggle,
  RecordMode,
  useReadOnly,
  type DetailMode
} from '@/components/common/detail-mode'
import { EntityAside, InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { LinkInput } from '@/components/common/text-field'
import { PinButtons } from '@/components/common/pin-buttons'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyMedia } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PREVIEW_IMPORTS } from './starter'

const LIMITS = limitsOf(componentInputSchema)

export type Layout = 'split' | 'code' | 'preview'

const LAYOUTS: { value: Layout; label: string; icon: typeof Code2 }[] = [
  { value: 'code', label: 'Лише код', icon: Code2 },
  { value: 'split', label: 'Код і превʼю', icon: Columns2 },
  { value: 'preview', label: 'Лише превʼю', icon: Monitor }
]

/**
 * Back · title · language (record fields, follow the view/edit mode) · layout (a view setting, always
 * switchable) · pin · trash · «Редагувати» / «Скасувати»·«Зберегти».
 */
export function ComponentToolbar({
  item,
  mode,
  title,
  onTitle,
  layout,
  onLayout,
  save,
  onBack,
  onDelete
}: {
  item: UiComponent
  mode: DetailMode
  title: string
  onTitle: (title: string) => void
  layout: Layout
  onLayout: (layout: Layout) => void
  save: (patch: ComponentPatch) => void
  onBack: () => void
  onDelete: () => void
}): ReactElement {
  return (
    // items-start: with a two-line title the controls stay next to its first line.
    <header className="flex items-start gap-3 border-b border-border px-6 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="До всіх компонентів"
            // Esc while reading goes back to the gallery; while editing Esc leaves editing (EditToggle).
            data-close-detail={mode.editing ? undefined : true}
            onClick={() => (mode.confirmClose ? mode.confirmClose(onBack) : onBack())}
          >
            <ArrowLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent>До всіх компонентів{mode.editing ? '' : ' · Esc'}</TooltipContent>
      </Tooltip>
      <RecordMode mode={mode}>
        {/* Two lines at most: a 500-character title no longer pushes the editor half a screen down. */}
        <div className="min-w-0 flex-1">
          <InlineTitle
            value={title}
            onChange={onTitle}
            maxLength={LIMITS.title}
            className={mode.editing ? 'max-h-[2.5em] overflow-y-auto' : 'line-clamp-2'}
          />
        </div>
        <Segmented<ComponentLanguage>
          size="xs"
          value={item.language}
          onChange={(language) => save({ language })}
          options={COMPONENT_LANGUAGES.map((l) => ({ value: l, label: l.toUpperCase() }))}
        />
      </RecordMode>
      {/* Outside RecordMode: view mode would hide the unselected layouts, and layout never changes the record. */}
      <Segmented<Layout>
        value={layout}
        onChange={onLayout}
        size="xs"
        options={LAYOUTS.map((l) => ({ value: l.value, title: l.label, label: <l.icon /> }))}
      />
      <PinButtons entity={{ type: 'component', id: item.id }} />
      <Tooltip>
        <Confirm
          title="Видалити компонент?"
          description="Він потрапить у кошик на 30 днів."
          confirmLabel="У кошик"
          onConfirm={onDelete}
        >
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="У кошик">
              <Trash2 />
            </Button>
          </TooltipTrigger>
        </Confirm>
        <TooltipContent>У кошик</TooltipContent>
      </Tooltip>
      <EditToggle mode={mode} onClose={onBack} />
    </header>
  )
}

/** Screenshot / GIF of the component: drop, paste (Ctrl+V) or take from clipboard — while editing. */
function CoverField({ item }: { item: UiComponent }): ReactElement | null {
  const readOnly = useReadOnly()
  const setCover = useApiMutation('components', 'setCover', {
    successMessage: 'Обкладинку оновлено'
  })
  const removeCover = useApiMutation('components', 'removeCover')
  const apply = (sources: FileSource[]): void => {
    if (sources[0]) setCover.mutate({ id: item.id, source: sources[0] })
  }
  const { isOver, props } = useFileDrop(apply, { accept: isImageFile })
  // Ctrl+V anywhere on the page changes the record: only after «Редагувати».
  usePasteFiles(apply, !readOnly)

  if (readOnly && !item.coverPath) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Скриншот або GIF</SectionLabel>
      <div {...(readOnly ? {} : props)}>
        {item.coverPath ? (
          <Card
            className={cn(
              'relative gap-0 overflow-hidden bg-card py-0',
              isOver && 'ring-2 ring-inset ring-ring'
            )}
          >
            <img src={fileUrl(item.coverPath)} alt="" className="max-h-48 w-full object-cover" />
            {!readOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="soft"
                    size="icon-xs"
                    aria-label="Прибрати обкладинку"
                    className="absolute top-2 right-2 bg-card/90 hover:bg-card"
                    onClick={() => removeCover.mutate(item.id)}
                  >
                    <X />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Прибрати обкладинку</TooltipContent>
              </Tooltip>
            )}
          </Card>
        ) : (
          <Empty
            className={cn(
              'gap-2 border border-dashed border-input p-5 md:p-5',
              isOver && 'border-ring bg-lime-soft'
            )}
          >
            <EmptyMedia variant="icon" className="size-9 rounded-full bg-card">
              <ImagePlus className="size-4 text-muted-foreground" />
            </EmptyMedia>
            <EmptyDescription className="text-caption">
              Перетягніть картинку або натисніть Ctrl+V
            </EmptyDescription>
          </Empty>
        )}
      </div>
      <Button
        data-edit-only
        variant="soft"
        size="xs"
        className="self-start"
        onClick={() => setCover.mutate({ id: item.id, source: { kind: 'clipboard' } })}
      >
        <Clipboard /> З буфера обміну
      </Button>
    </section>
  )
}

/** Description, source link, cover, tags and links; while editing — what the preview can import. */
export function ComponentSidePanel({
  item,
  save
}: {
  item: UiComponent
  save: (patch: ComponentPatch) => void
}): ReactElement {
  const readOnly = useReadOnly()
  const [description, setDescription] = useAutosave(item.description, (description) =>
    save({ description })
  )
  return (
    <Card className="w-[280px] shrink-0 gap-6 overflow-y-auto px-4 py-4">
      {/* Reading: plain text — a read-only textarea kept its own scrollbar inside the scrolling column. */}
      {readOnly ? (
        description.trim() ? (
          <p className="text-body leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </p>
        ) : null
      ) : (
        <Field label="Опис" count={{ length: description.length, max: LIMITS.description }}>
          <Textarea
            value={description}
            maxLength={LIMITS.description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Де використовується, які пропси"
            className="min-h-20 bg-card"
          />
        </Field>
      )}
      <LinkInput
        label="Джерело"
        value={item.sourceUrl}
        onSave={(sourceUrl) => save({ sourceUrl })}
        maxLength={LIMITS.sourceUrl}
        openLabel="Відкрити джерело"
      />
      <CoverField item={item} />
      <EntityAside
        entity={{ type: 'component', id: item.id }}
        tags={item.tags}
        onTagsChange={(tagIds) => save({ tagIds })}
        createdAt={item.createdAt}
        updatedAt={item.updatedAt}
        files={false}
      />
      {/* A reference for whoever writes the code: after tags and links, and only while editing. */}
      <div data-edit-only className="flex flex-col gap-6">
        <Separator />
        <section className="flex flex-col gap-2">
          <SectionLabel>Доступно в превʼю</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {PREVIEW_IMPORTS.map((m) => (
              <Badge key={m} variant="outline" className="bg-card font-mono text-meta font-normal">
                {m}
              </Badge>
            ))}
          </div>
          <p className="text-meta leading-relaxed text-muted-foreground">
            Tailwind-класи працюють. Покажеться <code className="font-mono">export default</code> або
            компонент з іменем App / Demo / Preview чи виклик{' '}
            <code className="font-mono">render(&lt;X /&gt;)</code>.
          </p>
        </section>
      </div>
    </Card>
  )
}
