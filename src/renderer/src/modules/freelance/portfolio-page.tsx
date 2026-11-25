import { useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { BriefcaseBusiness, ClipboardCopy, ImagePlus, Plus } from 'lucide-react'
import type { FileSource } from '@shared/domain/designs'
import { caseInputSchema, type CasePatch, type PortfolioCase } from '@shared/domain/freelance'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { capitalize, mdPreview } from '@/lib/format'
import { clickableProps } from '@/lib/clickable'
import { limitsOf } from '@/lib/limits'
import { fileUrl, isImageFile, toFileSources } from '@/lib/files'
import { cn } from '@/lib/utils'
import { useFileDrop, usePasteFiles } from '@/hooks/use-file-drop'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  EmptyState,
  FilterBar,
  FilterChips,
  Kbd,
  NoResults,
  Page,
  PageBody,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import { copyText } from '@/components/common/copy-button'
import { LinkInput } from '@/components/common/text-field'
import { useReadOnly } from '@/components/common/detail-mode-context'
import {
  DetailPane,
  EntityAside,
  MasterDetail,
  useOpenParam
} from '@/components/common/master-detail'
import { AutoMarkdown, AutoTitle, Block, EditorStack, TextareaBlock } from '../claude/editor-kit'
import { DisabledHint } from '@/components/common/disabled-hint'
import { NicheCombobox } from './niche-combobox'
import { FavoriteMark } from '@/components/common/favorite-mark'

const CASE_L = limitsOf(caseInputSchema)

/** English block ready to paste into a platform portfolio or a proposal. */
function englishText(c: PortfolioCase): string {
  const body =
    c.textEn.trim() ||
    [
      c.problem && `Challenge: ${c.problem}`,
      c.whatDone && `What I did: ${c.whatDone}`,
      c.result && `Result: ${c.result}`
    ]
      .filter(Boolean)
      .join('\n\n')
  return [c.title, body, c.stack && `Stack: ${c.stack}`, c.url && `Link: ${c.url}`]
    .filter(Boolean)
    .join('\n\n')
}

const NO_PROJECT = '__none__'

/**
 * Cover screenshot. Rendered inside DetailPane, so it sees the record mode: drop, Ctrl+V and
 * «Вибрати файл» work only while editing; in view mode only the image itself is shown.
 */
function CaseCover({ c }: { c: PortfolioCase }): ReactElement | null {
  const readOnly = useReadOnly()
  const fileRef = useRef<HTMLInputElement>(null)
  const setCover = useApiMutation('cases', 'setCover', { successMessage: 'Обкладинку оновлено' })
  const onFiles = (sources: FileSource[]): void => {
    if (sources[0]) setCover.mutate({ id: c.id, source: sources[0] })
  }
  const { isOver, props } = useFileDrop(onFiles, { accept: isImageFile })
  usePasteFiles(onFiles, !readOnly)
  // Nothing to show while reading: no empty wrapper in the stack (it added a gap above the title).
  if (readOnly && !c.coverPath) return null
  return (
    <div {...(readOnly ? {} : props)}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          if (e.target.files?.length) onFiles(await toFileSources(e.target.files))
          e.target.value = ''
        }}
      />
      {c.coverPath ? (
        <>
          {/* Framed like a design preview: the whole screenshot is visible and never melts into the pane. */}
          {/* Concentric: Card 28 − the 10px frame = the screenshot's 18 (it had 24 in an 8px frame). */}
          <Card className={cn('overflow-hidden bg-surface p-2.5', isOver && 'ring-2 ring-inset ring-ring')}>
            <img src={fileUrl(c.coverPath)} alt="" className="max-h-80 w-full rounded-xl object-contain ring-1 ring-foreground/8" />
          </Card>
          <Button
            variant="ghost"
            size="sm"
            data-edit-only
            className="mt-1 -ml-3"
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus /> Замінити обкладинку
          </Button>
        </>
      ) : (
        <Empty
          className={cn(
            'gap-3 border border-dashed border-input p-6 md:p-6',
            isOver && 'border-ring bg-lime-soft'
          )}
        >
          <ImagePlus className="size-5 text-muted-foreground" />
          <EmptyDescription className="text-caption">
            Перетягніть скриншот, вставте Ctrl+V або виберіть файл
          </EmptyDescription>
          <Button variant="soft" size="sm" onClick={() => fileRef.current?.click()}>
            Вибрати файл
          </Button>
        </Empty>
      )}
    </div>
  )
}

/**
 * «Проєкт»: while reading, the linked project is a link to it and no link hides the field; while editing,
 * a Select whose «Не пов’язано» is a placeholder (an item would read as a value).
 */
function CaseProject({
  projectId,
  onChange
}: {
  projectId: string | null
  onChange: (projectId: string | null) => void
}): ReactElement {
  const readOnly = useReadOnly()
  const navigate = useNavigate()
  const { data: projectList = [] } = useApi('projects', 'list')
  const project = projectList.find((p) => p.id === projectId)
  return (
    <Block label="Проєкт">
      {readOnly ? (
        project ? (
          <span data-view>
            <Button
              variant="link"
              className="no-underline hover:underline"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              {project.title}
            </Button>
          </span>
        ) : (
          <span data-empty />
        )
      ) : (
        <Select
          value={projectId ?? ''}
          onValueChange={(v) => onChange(v === NO_PROJECT ? null : v)}
        >
          <SelectTrigger className="w-full" aria-label="Проєкт">
            <SelectValue placeholder="Не пов’язано" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PROJECT}>Не пов’язано</SelectItem>
            {projectList.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Block>
  )
}

function CaseDetail({ c, onClose }: { c: PortfolioCase; onClose: () => void }) {
  const update = useApiMutation('cases', 'update')
  const remove = useApiMutation('cases', 'remove', { successMessage: 'Кейс переміщено в кошик' })
  const save = (patch: CasePatch): void => update.mutate({ id: c.id, patch })
  const entity = { type: 'case' as const, id: c.id }
  // Without any text the copy would be just the title: the button waits for content.
  const nothingToCopy = ![c.textEn, c.problem, c.whatDone, c.result].some((t) => t.trim())
  const copyButton = (
    <Button
      variant="lime"
      size="sm"
      disabled={nothingToCopy}
      onClick={() => void copyText(englishText(c), 'Текст кейсу скопійовано')}
    >
      <ClipboardCopy /> Скопіювати англійською
    </Button>
  )

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(c.id)
        onClose()
      }}
      emptyHint={
        <>
          Опишіть завдання клієнта, що зроблено й результат — з них збереться текст англійською.
          Натисніть «Редагувати» або <Kbd>E</Kbd>.
        </>
      }
      headerExtra={
        <DisabledHint
          reason={
            nothingToCopy
              ? 'Заповніть завдання, що зроблено або результат, щоб скопіювати'
              : undefined
          }
        >
          {copyButton}
        </DisabledHint>
      }
      aside={
        <EntityAside
          entity={entity}
          tags={c.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={c.createdAt}
          updatedAt={c.updatedAt}
        >
          <Block label="Тип завдання" htmlFor={`niche-${c.id}`}>
            <NicheCombobox
              id={`niche-${c.id}`}
              value={c.niche}
              maxLength={CASE_L.niche}
              onChange={(niche) => save({ niche })}
            />
          </Block>
          {/* Textareas, not inputs: a long value wraps while reading instead of ending in «…». */}
          <TextareaBlock
            label="Клієнт / індустрія"
            value={c.client}
            maxLength={CASE_L.client}
            onSave={(client) => save({ client })}
            placeholder="E-commerce, SaaS…"
          />
          <TextareaBlock
            label="Стек"
            value={c.stack}
            maxLength={CASE_L.stack}
            onSave={(stack) => save({ stack })}
            placeholder="Next.js, Tailwind, Stripe"
          />
          <LinkInput
            label="Посилання"
            value={c.url}
            maxLength={CASE_L.url}
            onSave={(url) => save({ url })}
            openLabel="Відкрити кейс"
          />
          <CaseProject projectId={c.projectId} onChange={(projectId) => save({ projectId })} />
        </EntityAside>
      }
    >
      <EditorStack>
        {/* Without a cover the drop zone goes last: E must not push the title down by its height. */}
        {c.coverPath && <CaseCover c={c} />}
        <AutoTitle
          value={c.title}
          onSave={(title) => save({ title })}
          maxLength={CASE_L.title}
          placeholder="Назва кейсу"
        />
        <AutoMarkdown
          label="Завдання клієнта"
          value={c.problem}
          onSave={(problem) => save({ problem })}
          maxLength={CASE_L.problem}
          minHeight="100px"
          placeholder="Що хотів клієнт і яка була проблема"
        />
        <AutoMarkdown
          label="Що зроблено"
          value={c.whatDone}
          onSave={(whatDone) => save({ whatDone })}
          maxLength={CASE_L.whatDone}
          minHeight="140px"
          placeholder="Ключові рішення: що й як зроблено"
        />
        <AutoMarkdown
          label="Результат"
          value={c.result}
          onSave={(result) => save({ result })}
          maxLength={CASE_L.result}
          minHeight="100px"
          placeholder="Цифри: швидкість, конверсія, терміни"
        />
        <TextareaBlock
          label="Текст англійською"
          hint="Його копіює кнопка «Скопіювати англійською». Якщо поле порожнє, текст збереться із завдання, що зроблено й результату."
          value={c.textEn}
          maxLength={CASE_L.textEn}
          onSave={(textEn) => save({ textEn })}
          className="min-h-40 text-lead leading-relaxed"
          placeholder="Built a … that …"
        />
        {!c.coverPath && <CaseCover c={c} />}
      </EditorStack>
    </DetailPane>
  )
}

function CoverlessPreview({ c }: { c: PortfolioCase }): ReactElement {
  const text = mdPreview(c.result || c.problem || c.whatDone)
  // Nothing to show: one quiet line, not an icon alone in a big empty frame.
  if (!text)
    return (
      <div className="flex size-full items-center justify-center gap-1.5 p-3 text-caption text-muted-foreground">
        <BriefcaseBusiness className="size-3.5 shrink-0" />
        Немає опису й скриншота
      </div>
    )
  return (
    <div className="flex size-full flex-col items-start gap-2 p-3">
      <div className="rounded-xl bg-foreground/[0.07] p-2 text-muted-foreground">
        <BriefcaseBusiness className="size-4" />
      </div>
      <p className="line-clamp-4 text-caption text-muted-foreground">{text}</p>
    </div>
  )
}

export function PortfolioPage() {
  const [open, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const [niche, setNiche] = useState<string | undefined>()
  // Niche chips come from a capped sample; the grid itself is paged on the server and virtualized.
  const { data: sample = [] } = useApi('cases', 'list', { limit: 500 })
  const q = useDebounced(search.trim())
  const list = useInfiniteApi('cases', 'list', { search: q || undefined, niche })
  const create = useApiMutation('cases', 'create', { onSuccess: (c) => setOpen(c.id) })
  const { data: current } = useApi('cases', 'get', open ?? '', { enabled: !!open })
  const niches = [...new Set(sample.map((c) => c.niche).filter(Boolean))]
  const add = (): void => create.mutate({ title: 'Новий кейс' })
  const filterHint = [
    search.trim() && `За запитом «${search.trim()}»`,
    niche && `з типом «${niche}»`
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Page>
      <PageHeader
        title="Портфоліо"
        subtitle="Кейси: завдання, що зроблено, результат, скриншоти й англійський текст для профілю та відгуків."
        actions={
          <Button variant="lime" onClick={add}>
            <Plus /> Кейс
          </Button>
        }
      >
        {/* Nothing to filter or search on an empty base: the row comes with the first case. */}
        {(sample.length > 0 || search || niche) && (
          <FilterBar
            chips={
              niches.length > 0 && (
                <FilterChips
                  allLabel="Усі"
                  value={niche}
                  onChange={setNiche}
                  options={niches.map((n) => ({ value: n, label: n }))}
                />
              )
            }
            trailing={
              <SearchInput value={search} onChange={setSearch} placeholder="Шукати в кейсах" />
            }
          />
        )}
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualGrid
              className="pr-1"
              activeKey={open}
              items={list.items}
              loading={list.isLoading}
              getKey={(c) => c.id}
              minColumnWidth={220}
              rowHeight={230}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading &&
                (search.trim() || niche ? (
                  <NoResults
                    hint={`${capitalize(filterHint)} кейсів немає.`}
                    onReset={() => {
                      setSearch('')
                      setNiche(undefined)
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={BriefcaseBusiness}
                    title="Кейсів поки немає"
                    hint="Додайте завершений проєкт — знадобиться для відгуків і профілю."
                    cta={{ label: 'Додати кейс', icon: Plus, onClick: add }}
                  />
                ))
              }
              renderItem={(c) => (
                <Card
                  {...clickableProps(() => setOpen(c.id))}
                  className={cn(
                    // Same tile language as Дизайни: a surface frame, so a dark cover never melts into the page.
                    // rounded-2xl (24) = the cover's 18 + the 6px frame (concentric corners, as in Дизайни).
                    'tile h-full gap-0 overflow-hidden rounded-2xl bg-surface p-1.5',
                    c.id === open && 'outline-2 -outline-offset-2 outline-foreground/40'
                  )}
                >
                  <div className="aspect-16/10 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8 ring-inset">
                    {c.coverPath ? (
                      <img src={fileUrl(c.coverPath)} alt="" className="size-full object-cover object-top" />
                    ) : (
                      // No screenshot: the case's own words instead of an empty frame on every tile.
                      <CoverlessPreview c={c} />
                    )}
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-1.5 px-2.5 pt-3 pb-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-body font-semibold">{c.title}</span>
                      <FavoriteMark entity={{ type: 'case', id: c.id }} />
                    </div>
                    {/* Reserved line: cards stay the same height with or without niche/stack. */}
                    <div className="flex h-6 min-w-0 items-center gap-1.5">
                      {c.niche && (
                        <Badge variant="soft" truncate>
                          {c.niche}
                        </Badge>
                      )}
                      {c.stack && <span className="min-w-0 truncate text-meta text-muted-foreground">{c.stack}</span>}
                    </div>
                  </CardContent>
                </Card>
              )}
            />
          }
          detail={
            current && current.id === open ? (
              <CaseDetail key={current.id} c={current} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
