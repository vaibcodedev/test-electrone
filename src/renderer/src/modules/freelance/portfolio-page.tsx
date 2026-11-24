import { useState } from 'react'
import { openUrl } from '@/lib/open-url'
import { BriefcaseBusiness, ClipboardCopy, ExternalLink, ImagePlus, Plus } from 'lucide-react'
import type { FileSource } from '@shared/domain/designs'
import { caseInputSchema, type CasePatch, type PortfolioCase } from '@shared/domain/freelance'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { countLabel } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { fileUrl, isImageFile } from '@/lib/files'
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
  TextareaBlock,
  UrlBlock
} from '../claude/editor-kit'

const CASE_L = limitsOf(caseInputSchema)

/** English block ready to paste into the platform portfolio / a proposal. */
function upworkText(c: PortfolioCase): string {
  const body =
    c.textEn.trim() ||
    [
      c.problem && `Challenge: ${c.problem}`,
      c.whatDone && `What I did: ${c.whatDone}`,
      c.result && `Result: ${c.result}`
    ]
      .filter(Boolean)
      .join('\n\n')
  return [c.title, '', body, c.stack && `\nStack: ${c.stack}`, c.url && `Link: ${c.url}`]
    .filter((x) => x !== '' && x !== undefined)
    .join('\n')
}

const NO_PROJECT = '__none__'

function CaseDetail({ c, onClose }: { c: PortfolioCase; onClose: () => void }) {
  const update = useApiMutation('cases', 'update')
  const remove = useApiMutation('cases', 'remove', { successMessage: 'Переміщено в кошик' })
  const setCover = useApiMutation('cases', 'setCover', { successMessage: 'Обкладинку оновлено' })
  const { data: projectList = [] } = useApi('projects', 'list')
  const save = (patch: CasePatch): void => update.mutate({ id: c.id, patch })
  const entity = { type: 'case' as const, id: c.id }

  const onFiles = (sources: FileSource[]): void => {
    if (sources[0]) setCover.mutate({ id: c.id, source: sources[0] })
  }
  const { isOver, props } = useFileDrop(onFiles, { accept: isImageFile })
  usePasteFiles(onFiles)

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(c.id)
        onClose()
      }}
      headerExtra={
        <Button
          variant="lime"
          size="sm"
          onClick={() => void copyText(upworkText(c), 'Текст для Upwork скопійовано')}
        >
          <ClipboardCopy /> Скопіювати для Upwork
        </Button>
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
          <UrlBlock
            label="Посилання"
            value={c.url}
            maxLength={CASE_L.url}
            onSave={(url) => save({ url })}
            trailing={() =>
              c.url && (
                <Button
                  variant="soft"
                  size="icon"
                  className="shrink-0"
                  aria-label="Відкрити"
                  onClick={() => void openUrl(c.url)}
                >
                  <ExternalLink />
                </Button>
              )
            }
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
        <div {...props}>
          {c.coverPath ? (
            // Framed like a design preview: the whole screenshot is visible and never melts into the pane.
            <Card className={cn('overflow-hidden bg-surface p-2', isOver && 'ring-2 ring-inset ring-ring')}>
              <img src={fileUrl(c.coverPath)} alt="" className="max-h-80 w-full rounded-2xl object-contain ring-1 ring-foreground/8" />
            </Card>
          ) : (
            <Empty
              className={cn(
                'gap-2 border border-dashed border-input p-6 md:p-6',
                isOver && 'border-ring bg-lime-soft'
              )}
            >
              <ImagePlus className="size-5 text-muted-foreground" />
              <EmptyDescription className="text-caption">
                Перетягніть скриншот сюди або натисніть Ctrl+V
              </EmptyDescription>
            </Empty>
          )}
        </div>
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
          minHeight="100px"
        />
        <AutoMarkdown
          label="Що зробив"
          value={c.whatDone}
          onSave={(whatDone) => save({ whatDone })}
          minHeight="140px"
        />
        <AutoMarkdown
          label="Результат"
          value={c.result}
          onSave={(result) => save({ result })}
          minHeight="100px"
          placeholder="Цифри: швидкість, конверсія, терміни"
        />
        <TextareaBlock
          label="Текст англійською"
          hint="Його копіює кнопка «Скопіювати для Upwork». Порожньо — збереться із завдання, роботи й результату."
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
                  />
                )
              }
              renderItem={(c) => (
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen(c.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setOpen(c.id)}
                  className={cn(
                    // Same tile language as Дизайни: a surface frame, so a dark cover never melts into the page.
                    'tile h-full gap-0 overflow-hidden bg-surface p-1.5',
                    c.id === open && 'bg-accent outline-2 -outline-offset-2 outline-chart-1'
                  )}
                >
                  <div className="aspect-[16/10] overflow-hidden rounded-[18px] bg-card ring-1 ring-foreground/8 ring-inset">
                    {c.coverPath ? (
                      <img src={fileUrl(c.coverPath)} alt="" className="size-full object-cover object-top" />
                    ) : (
                      <div className="m-2 grid h-[calc(100%-1rem)] place-items-center rounded-xl border border-dashed border-foreground/12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-1.5 text-caption">
                          <BriefcaseBusiness className="size-5" />
                          Без обкладинки
                        </div>
                      </div>
                    )}
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-1.5 px-2.5 pt-3 pb-1.5">
                    <div className="truncate text-body font-semibold">{c.title}</div>
                    {/* Reserved line: cards stay the same height with or without niche/stack. */}
                    <div className="flex h-6 min-w-0 items-center gap-1.5">
                      {c.niche && <Badge variant="soft">{c.niche}</Badge>}
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
