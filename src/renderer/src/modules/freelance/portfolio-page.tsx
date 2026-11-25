import { useRef, useState, type ReactElement } from 'react'
import { BriefcaseBusiness, ClipboardCopy, ImagePlus, Plus } from 'lucide-react'
import type { FileSource } from '@shared/domain/designs'
import { caseInputSchema, type CasePatch, type PortfolioCase } from '@shared/domain/freelance'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { countLabel, mdPreview } from '@/lib/format'
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
  FilterChips,
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
import {
  AutoMarkdown,
  AutoTitle,
  Block,
  EditorStack,
  InputField,
  TextareaBlock
} from '../claude/editor-kit'
import { DisabledHint } from './disabled-hint'

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
function CaseCover({ c }: { c: PortfolioCase }): ReactElement {
  const readOnly = useReadOnly()
  const fileRef = useRef<HTMLInputElement>(null)
  const setCover = useApiMutation('cases', 'setCover', { successMessage: 'Обкладинку оновлено' })
  const onFiles = (sources: FileSource[]): void => {
    if (sources[0]) setCover.mutate({ id: c.id, source: sources[0] })
  }
  const { isOver, props } = useFileDrop(onFiles, { accept: isImageFile })
  usePasteFiles(onFiles, !readOnly)
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
          <Card className={cn('overflow-hidden bg-surface p-2', isOver && 'ring-2 ring-inset ring-ring')}>
            <img src={fileUrl(c.coverPath)} alt="" className="max-h-80 w-full rounded-2xl object-contain ring-1 ring-foreground/8" />
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
          data-edit-only
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

function CaseDetail({ c, onClose }: { c: PortfolioCase; onClose: () => void }) {
  const update = useApiMutation('cases', 'update')
  const remove = useApiMutation('cases', 'remove', { successMessage: 'Переміщено в кошик' })
  const { data: projectList = [] } = useApi('projects', 'list')
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
      <ClipboardCopy /> Копіювати англійською
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
      headerExtra={
        <DisabledHint reason={nothingToCopy ? 'Додайте опис кейсу, щоб копіювати' : undefined}>
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
          <InputField
            label="Тип завдання"
            value={c.niche}
            maxLength={CASE_L.niche}
            onSave={(niche) => save({ niche })}
            placeholder="Next.js, Shopify…"
          />
          <InputField
            label="Клієнт / індустрія"
            value={c.client}
            maxLength={CASE_L.client}
            onSave={(client) => save({ client })}
            placeholder="E-commerce, SaaS…"
          />
          <InputField
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
          <Block label="Проєкт">
            <Select
              value={c.projectId ?? NO_PROJECT}
              onValueChange={(v) => save({ projectId: v === NO_PROJECT ? null : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
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
          </Block>
        </EntityAside>
      }
    >
      <EditorStack>
        <CaseCover c={c} />
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
          label="Що зробив"
          value={c.whatDone}
          onSave={(whatDone) => save({ whatDone })}
          maxLength={CASE_L.whatDone}
          minHeight="140px"
          placeholder="Ключові рішення: що й як ви зробили"
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
          hint="Його копіює кнопка «Копіювати англійською». Порожньо — збереться із завдання, роботи й результату."
          value={c.textEn}
          maxLength={CASE_L.textEn}
          onSave={(textEn) => save({ textEn })}
          className="min-h-40 text-lead leading-relaxed"
          placeholder="Built a … that …"
        />
      </EditorStack>
    </DetailPane>
  )
}

function CoverlessPreview({ c }: { c: PortfolioCase }): ReactElement {
  const text = mdPreview(c.result || c.problem || c.whatDone)
  return (
    <div
      className={cn(
        'flex size-full flex-col gap-2 p-3',
        text ? 'items-start' : 'items-center justify-center'
      )}
    >
      <div className="rounded-xl bg-foreground/[0.07] p-2 text-muted-foreground">
        <BriefcaseBusiness className="size-4" />
      </div>
      {text && <p className="line-clamp-4 text-caption text-muted-foreground">{text}</p>}
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

  return (
    <Page>
      <PageHeader
        title="Портфоліо"
        subtitle={
          list.items.length
            ? `${countLabel(list.items.length, list.hasMore, ['кейс', 'кейси', 'кейсів'])} · завдання, результат, скриншоти й англійський текст для відгуків`
            : 'Кейси: завдання, що зроблено, результат, скриншоти й готовий англійський текст для профілю та відгуків.'
        }
        actions={
          <Button variant="lime" onClick={() => create.mutate({ title: 'Новий кейс' })}>
            <Plus /> Кейс
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {niches.length > 0 && (
            <FilterChips
              allLabel="Усі"
              value={niche}
              onChange={setNiche}
              options={niches.map((n) => ({ value: n, label: n }))}
            />
          )}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Шукати в кейсах"
            className="ml-auto w-64"
          />
        </div>
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          listSize="38%"
          list={
            <VirtualGrid
              className="pr-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(c) => c.id}
              minColumnWidth={220}
              rowHeight={230}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading && (
                  <EmptyState
                    icon={BriefcaseBusiness}
                    title={search || niche ? 'Нічого не знайдено' : 'Кейсів поки немає'}
                    hint={search || niche ? undefined : 'Додайте завершений проєкт — знадобиться для відгуків і профілю.'}
                    action={
                      !search && !niche && (
                        <Button variant="soft" onClick={() => create.mutate({ title: 'Новий кейс' })}>
                          <Plus /> Додати кейс
                        </Button>
                      )
                    }
                  />
                )
              }
              renderItem={(c) => (
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpen(c.id)
                    }
                  }}
                  className={cn(
                    // Same tile language as Дизайни: a surface frame, so a dark cover never melts into the page.
                    'tile h-full gap-0 overflow-hidden bg-surface p-1.5',
                    c.id === open && 'outline-2 -outline-offset-2 outline-foreground/40'
                  )}
                >
                  <div className="aspect-[16/10] overflow-hidden rounded-[18px] bg-card ring-1 ring-foreground/8 ring-inset">
                    {c.coverPath ? (
                      <img src={fileUrl(c.coverPath)} alt="" className="size-full object-cover object-top" />
                    ) : (
                      // No screenshot: the case's own words instead of an empty frame on every tile.
                      <CoverlessPreview c={c} />
                    )}
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-1.5 px-2.5 pt-3 pb-1.5">
                    <div className="truncate text-body font-semibold">{c.title}</div>
                    {/* Reserved line: cards stay the same height with or without niche/stack. */}
                    <div className="flex h-6 min-w-0 items-center gap-1.5">
                      {c.niche && (
                        <Badge variant="soft" className="shrink" title={c.niche}>
                          <span className="truncate">{c.niche}</span>
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
