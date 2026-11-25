import { useState, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  COMPONENT_LANGUAGES,
  componentInputSchema,
  PREVIEW_BACKGROUNDS,
  type ComponentPatch,
  type PreviewBackground,
  type UiComponent
} from '@shared/domain/components'
import { useApi, useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { limitsOf } from '@/lib/limits'
import { EmptyState, Segmented } from '@/components/common/page'
import { CodeEditor } from '@/components/common/code'
import { LivePreview } from '@/components/common/live-preview'
import { RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { Button } from '@/components/ui/button'
import { LanguageSuggestion } from '../claude/editor-kit'
import { ComponentSidePanel, ComponentToolbar, type Layout } from './component-parts'

const CODE_MAX = limitsOf(componentInputSchema).code

const BG_LABEL: Record<PreviewBackground, string> = {
  light: 'Світлий',
  dark: 'Темний',
  grid: 'Сітка'
}

/** Component record page: view first, «Редагувати» / E to change it (docs/design-system.md → Просмотр и редактирование). */
function Editor({ item }: { item: UiComponent }): ReactElement {
  const navigate = useNavigate()
  const mode = useRecordMode(item.id, 'component')
  const update = useApiMutation('components', 'update')
  const remove = useApiMutation('components', 'remove', {
    successMessage: 'Компонент переміщено в кошик'
  })
  const save = (patch: ComponentPatch): void => update.mutate({ id: item.id, patch })
  const [layout, setLayout] = useState<Layout>('split')

  const [title, setTitle] = useAutosave(item.title, (title) => title.trim() && save({ title }))
  const [code, setCode] = useAutosave(item.code, (code) => save({ code }), 800)

  const back = (): void => void navigate('/components')
  const editorHeight = 'calc(100vh - 210px)'

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
        {layout !== 'preview' && (
          <RecordMode mode={mode}>
            <div className="flex min-w-0 flex-1 flex-col">
              <CodeEditor
                value={code}
                onChange={setCode}
                language={item.language}
                minHeight={editorHeight}
                maxLength={CODE_MAX}
                maxHeight={editorHeight}
                className="flex-1"
              />
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
        {layout !== 'code' && (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium text-muted-foreground">Живе превʼю</span>
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
  const { data, isLoading } = useApi('components', 'get', id)
  if (isLoading) return <PageSkeleton kind="detail" />
  if (!data)
    return (
      <EmptyState
        title="Компонент не знайдено"
        hint="Можливо, він у кошику."
        action={<Button onClick={() => navigate('/components')}>До всіх компонентів</Button>}
      />
    )
  return <Editor key={data.id} item={data} />
}
