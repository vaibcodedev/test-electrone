import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Info, Sparkles, SearchX } from 'lucide-react'
import {
  COMPONENT_LANGUAGES,
  componentInputSchema,
  PREVIEW_BACKGROUNDS,
  type ComponentPatch,
  type PreviewBackground,
  type UiComponent
} from '@shared/domain/components'
import { api } from '@/lib/api'
import { invalidateAll, useApiMutation, useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { reportError } from '@/lib/error-reporting'
import { useAutosave } from '@/hooks/use-autosave'
import { limitsOf } from '@/lib/limits'
import { EmptyState, Segmented } from '@/components/common/page'
import { IconAction } from '@/components/common/icon-action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CodeEditor } from '@/components/common/code'
import { LivePreview } from '@/components/common/live-preview'
import { EditHintText, RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { toastTrashed } from '@/components/common/trash-toast'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { LanguageSuggestion } from '../claude/editor-kit'
import { ComponentSidePanel, ComponentToolbar, type Layout } from './component-parts'
import { PREVIEW_IMPORTS, STARTER } from './starter'

const CODE_MAX = limitsOf(componentInputSchema).code

const BG_LABEL: Record<PreviewBackground, string> = {
  light: 'Світлий',
  dark: 'Темний',
  grid: 'Сітка'
}

/** What the sandboxed preview can import: next to «Живе прев’ю», where it is needed while writing the code. */
function PreviewImportsInfo(): ReactElement {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconAction label="Що доступно в прев’ю">
          <Info />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {PREVIEW_IMPORTS.map((m) => (
            <Badge key={m} variant="outline" className="font-mono text-meta font-normal">
              {m}
            </Badge>
          ))}
        </div>
        <p className="text-caption leading-relaxed text-muted-foreground">
          Tailwind-класи працюють. Покажеться <code className="font-mono">export default</code> або
          компонент з іменем App / Demo / Preview чи виклик{' '}
          <code className="font-mono">render(&lt;X /&gt;)</code>.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/** Component record page: view first, «Редагувати» / E to change it (docs/design-system.md → Просмотр и редактирование). */
function Editor({ item }: { item: UiComponent }): ReactElement {
  const navigate = useNavigate()
  const mode = useRecordMode(item.id, 'component')
  const update = useApiMutation('components', 'update')
  // No confirmation: the trash is reversible, and the toast's «Скасувати» brings a missed click straight back.
  const remove = useApiMutation('components', 'remove', {
    onSuccess: (_r, id) => toastTrashed('Компонент переміщено в кошик', { type: 'component', id })
  })
  const save = (patch: ComponentPatch): void => update.mutate({ id: item.id, patch })
  const [layout, setLayout] = useState<Layout>('split')

  const [title, setTitle] = useAutosave(item.title, (title) => title.trim() && save({ title }))
  const [code, setCode] = useAutosave(item.code, (code) => save({ code }), 800)

  // «Скасувати» / Esc on a fresh component settle asynchronously: by then the person may be on another page,
  // and navigating back to the gallery would pull them away from it.
  const alive = useRef(true)
  const back = (): void => {
    if (alive.current) void navigate('/components')
  }
  // Leaving an untouched new component (arrow, sidebar) discards it, as DetailPane does for list modules;
  // the server re-checks, so a late autosave wins. A remount in between (StrictMode) keeps it.
  useEffect(() => {
    alive.current = true
    const ref = { type: 'component' as const, id: item.id }
    return () => {
      alive.current = false
      setTimeout(() => {
        if (alive.current) return
        api.trash
          .discardDraft(ref)
          .then((discarded) => discarded && invalidateAll())
          .catch((e) => reportError(e, 'component-page:discardDraft'))
      }, 800)
    }
  }, [item.id])
  const noCode = !code.trim()
  // Editing an empty component: «Вставити приклад» stands above the editor, which gives up its height.
  const editorHeight = mode.editing && noCode ? 'calc(100vh - 242px)' : 'calc(100vh - 210px)'
  // Reading a component without code: a hint what to fill instead of a tall empty editor with a lone «1».
  const emptyView = !mode.editing && noCode
  // Nothing to render while reading: the hint takes the preview's place too, even in «Лише прев’ю».
  const showCode = layout !== 'preview' || emptyView
  const showPreview = layout !== 'code' && !emptyView

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ComponentToolbar
        item={item}
        mode={mode}
        title={title}
        onTitle={setTitle}
        layout={layout}
        onLayout={setLayout}
        save={save}
        onBack={back}
        onDelete={() => {
          remove.mutate(item.id)
          back()
        }}
      />

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {showCode && (
          <RecordMode mode={mode}>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {emptyView ? (
                <Empty className="min-w-0 flex-1 border border-dashed border-input">
                  <EmptyDescription className="text-body">
                    Коду ще немає. <EditHintText action="вставити компонент" />
                  </EmptyDescription>
                </Empty>
              ) : (
                <>
                  {noCode && (
                    <Button
                      variant="soft"
                      size="xs"
                      className="self-start"
                      onClick={() => setCode(STARTER[item.language])}
                    >
                      <Sparkles /> Вставити приклад
                    </Button>
                  )}
                  <CodeEditor
                    value={code}
                    onChange={setCode}
                    language={item.language}
                    minHeight={editorHeight}
                    maxLength={CODE_MAX}
                    maxHeight={editorHeight}
                    className="flex-1"
                  />
                </>
              )}
              <LanguageSuggestion
                code={item.code}
                language={item.language}
                languages={COMPONENT_LANGUAGES}
                onSwitch={(language) => save({ language })}
              />
            </div>
          </RecordMode>
        )}
        {/* The preview and its background are a way of looking at the record: always available. */}
        {showPreview && (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-caption font-medium text-muted-foreground">Живе прев’ю</span>
                <PreviewImportsInfo />
              </div>
              <Segmented<PreviewBackground>
                size="xs"
                value={item.previewBg}
                onChange={(previewBg) => save({ previewBg })}
                options={PREVIEW_BACKGROUNDS.map((b) => ({ value: b, label: BG_LABEL[b] }))}
              />
            </div>
            <LivePreview
              code={code}
              language={item.language}
              bg={item.previewBg}
              className="flex-1"
            />
          </div>
        )}
        <RecordMode mode={mode}>
          <ComponentSidePanel item={item} save={save} />
        </RecordMode>
      </div>
    </div>
  )
}

export function ComponentPage(): ReactElement {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const record = useInPlaceApi('components', 'get', id)
  const { data, isLoading } = record
  if (record.failed)
    return <LoadError title="Не вдалося завантажити компонент" onRetry={record.retry} />
  if (isLoading) return <PageSkeleton kind="detail" />
  if (!data)
    return (
      <EmptyState
        icon={SearchX}
        title="Компонент не знайдено"
        hint="Можливо, він у кошику."
        cta={{
          label: 'До всіх компонентів',
          icon: ArrowLeft,
          onClick: () => void navigate('/components')
        }}
      />
    )
  return <Editor key={data.id} item={data} />
}
