import { useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowRight, Copy, MessageSquareQuote, Plus } from 'lucide-react'
import {
  TEMPLATE_SITUATIONS,
  templateInputSchema,
  type MessageTemplate,
  type TemplatePatch,
  type TemplateSituation
} from '@shared/domain/freelance'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { limitsOf } from '@/lib/limits'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { capitalize, fmtPercent, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SectionLabel } from '@/components/common/section-label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ItemDescription } from '@/components/ui/item'
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
import { useReadOnly } from '@/components/common/detail-mode-context'
import {
  DetailPane,
  EntityAside,
  ListItem,
  MasterDetail,
  useOpenParam
} from '@/components/common/master-detail'
import { AutoTitle, Block, EditorStack, EnumSelect, TextareaBlock } from '../claude/editor-kit'
import { SITUATION_LABEL, templateVariables, variableLabel } from './g2-labels'
import { TemplateFillDialog } from './template-fill-dialog'
import { ImportButton } from '@/components/common/import-dialog'
import { DisabledHint } from '@/components/common/disabled-hint'
import { NicheCombobox } from './niche-combobox'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { bindMenu } from '@/features/record-menu/model'
import { templateMenu } from './template-menu'

const TPL_L = limitsOf(templateInputSchema)
const SITUATION_OPTIONS = TEMPLATE_SITUATIONS.map((s) => ({ value: s, label: SITUATION_LABEL[s] }))

/**
 * «Скопіювати»: asks for the {variables}, shows the filled text and copies it. Soft, not lime: the page's
 * one lime action is «+ Шаблон» in the header. A plain button opens the dialog (no DialogTrigger asChild:
 * it would replace the button's data-slot).
 */
function CopyTemplateButton({
  template
}: {
  template: Pick<MessageTemplate, 'id' | 'title' | 'body'>
}): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="soft" size="sm" onClick={() => setOpen(true)}>
        <Copy /> Скопіювати
      </Button>
      <CopyTemplateDialog template={template} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** «Скопіювати шаблон»: the gaps filled in, then the text goes to the clipboard and counts as copied. */
function CopyTemplateDialog({
  template,
  open,
  onOpenChange
}: {
  template: Pick<MessageTemplate, 'id' | 'title' | 'body'>
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const markCopied = useApiMutation('templates', 'markCopied')
  return (
    <TemplateFillDialog
      open={open}
      onOpenChange={onOpenChange}
      heading="Скопіювати шаблон"
      title={template.title}
      body={template.body}
      submitLabel="Скопіювати текст"
      onSubmit={async (filled) => {
        if (!(await copyText(filled, 'Шаблон скопійовано'))) return
        markCopied.mutate(template.id)
        onOpenChange(false)
      }}
    />
  )
}

/** What the template brought: how often it went into proposals and how many of them got a reply or a contract. */
function TemplateResults({ t }: { t: MessageTemplate }): ReactElement | null {
  if (!t.usedIn && !t.copyCount) return null
  const share = (n: number, tone?: string): ReactElement => (
    <>
      {n} з {t.usedIn} · <span className={tone}>{fmtPercent((n / t.usedIn) * 100)}</span>
    </>
  )
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Результати</SectionLabel>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-body">
        {t.usedIn > 0 && (
          <>
            <dt className="text-caption text-muted-foreground">У відгуках</dt>
            <dd className="tabular-nums">{t.usedIn}</dd>
            <dt className="text-caption text-muted-foreground">Відповіли</dt>
            <dd className="tabular-nums">{share(t.replied)}</dd>
            <dt className="text-caption text-muted-foreground">Контракти</dt>
            <dd className="tabular-nums">{share(t.hired, 'text-success')}</dd>
          </>
        )}
        {t.copyCount > 0 && (
          <>
            <dt className="text-caption text-muted-foreground">Скопійовано</dt>
            <dd className="tabular-nums">
              {t.copyCount} {plural(t.copyCount, ['раз', 'рази', 'разів'])}
            </dd>
          </>
        )}
      </dl>
    </section>
  )
}

/** The template's own {variables} while reading: what the copy dialog will ask for. */
function TemplateVariables({ body }: { body: string }): ReactElement | null {
  const readOnly = useReadOnly()
  const vars = templateVariables(body)
  if (!readOnly || !vars.length) return null
  return (
    <div className="-mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-caption text-muted-foreground">Змінні:</span>
      {vars.map((v) => (
        // Name and {key} are cut together, so not Badge `truncate`: it takes a single string child.
        <Badge
          key={v}
          variant="soft"
          className="min-w-0 shrink justify-start"
          title={`${variableLabel(v)} {${v}}`}
        >
          <span className="min-w-0 truncate">
            {variableLabel(v)} <span className="font-mono text-muted-foreground">{`{${v}}`}</span>
          </span>
        </Badge>
      ))}
    </div>
  )
}

function TemplateDetail({ t, onClose }: { t: MessageTemplate; onClose: () => void }) {
  const update = useApiMutation('templates', 'update')
  const remove = useApiMutation('templates', 'remove', {
    successMessage: 'Шаблон переміщено в кошик'
  })
  const save = (patch: TemplatePatch): void => update.mutate({ id: t.id, patch })
  const entity = { type: 'template' as const, id: t.id }
  const isTalk = t.situation === 'small_talk'

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => remove.mutate(t.id)}
      emptyHint={
        <>
          Тексту шаблону ще немає. Натисніть «Редагувати» або <Kbd>E</Kbd> і напишіть відповідь —
          змінні у фігурних дужках заповните під час копіювання.
        </>
      }
      headerExtra={
        t.body.trim() ? (
          <CopyTemplateButton template={t} />
        ) : (
          <DisabledHint reason="Додайте текст шаблону, щоб скопіювати">
            <Button variant="soft" size="sm" disabled>
              <Copy /> Скопіювати
            </Button>
          </DisabledHint>
        )
      }
      aside={
        <EntityAside
          entity={entity}
          tags={t.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={t.createdAt}
          updatedAt={t.updatedAt}
          files={false}
        >
          <Block label="Ситуація">
            <EnumSelect
              options={SITUATION_OPTIONS}
              value={t.situation}
              onChange={(situation) => save({ situation })}
              ariaLabel="Ситуація"
            />
          </Block>
          <Block label="Тип завдання" htmlFor={`niche-${t.id}`}>
            <NicheCombobox
              id={`niche-${t.id}`}
              value={t.niche}
              maxLength={TPL_L.niche}
              onChange={(niche) => save({ niche })}
            />
          </Block>
          <TemplateResults t={t} />
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle
          value={t.title}
          onSave={(title) => save({ title })}
          maxLength={TPL_L.title}
          placeholder="Назва шаблону"
        />
        <TextareaBlock
          label={isTalk ? 'Фраза клієнта' : 'Коли використовувати'}
          value={t.trigger}
          maxLength={TPL_L.trigger}
          onSave={(trigger) => save({ trigger })}
          placeholder={isTalk ? 'How are you doing?' : 'Напр.: клієнт запитав про терміни'}
        />
        <TextareaBlock
          label={isTalk ? 'Моя відповідь' : 'Текст'}
          hint={
            <span data-edit-only>
              Змінні у фігурних дужках — {'{client}'}, {'{deadline}'} — заповнюються під час
              копіювання.
            </span>
          }
          value={t.body}
          maxLength={TPL_L.body}
          onSave={(body) => save({ body })}
          placeholder="Hi {client}, …"
          className="min-h-48 text-lead leading-relaxed"
        />
        <TemplateVariables body={t.body} />
        <TextareaBlock
          label="Нотатка для себе"
          value={t.note}
          maxLength={TPL_L.note}
          onSave={(note) => save({ note })}
          placeholder="Напр.: не для клієнтів із фіксованим бюджетом"
        />
      </EditorStack>
    </DetailPane>
  )
}

export function TemplatesPage() {
  const [open, setOpen] = useOpenParam()
  // In the URL: other pages link to «?situation=follow_up» and the like.
  const [params, setParams] = useSearchParams()
  const raw = params.get('situation')
  const situation = TEMPLATE_SITUATIONS.includes(raw as TemplateSituation)
    ? (raw as TemplateSituation)
    : undefined
  const setSituation = (v: TemplateSituation | undefined): void =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v) next.set('situation', v)
        else next.delete('situation')
        return next
      },
      { replace: true }
    )
  const [search, setSearch] = useState('')
  const term = useDebounced(search.trim())
  // Full list feeds the situation counters and the open template; the column pages from the server.
  const { data: all = [] } = useApi('templates', 'list', {})
  const list = useInfiniteApi('templates', 'list', { situation, search: term || undefined })
  const create = useApiMutation('templates', 'create', { onSuccess: (t) => setOpen(t.id) })
  const current = all.find((t) => t.id === open)
  const add = (): void =>
    create.mutate({ title: 'Новий шаблон', situation: situation ?? 'proposal' })
  const filtered = !!search.trim() || !!situation
  const filterHint = [
    search.trim() && `За запитом «${search.trim()}»`,
    situation && `у ситуації «${SITUATION_LABEL[situation]}»`
  ]
    .filter(Boolean)
    .join(' ')

  // «Скопіювати…» from a row's menu: one dialog for the page (the menu is gone by the time it opens). The
  // template is kept after closing, so the dialog fades out with its text.
  const [copying, setCopying] = useState<MessageTemplate | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const counts = all.reduce<Partial<Record<TemplateSituation, number>>>((acc, t) => {
    acc[t.situation] = (acc[t.situation] ?? 0) + 1
    return acc
  }, {})

  return (
    <Page>
      {copying && <CopyTemplateDialog template={copying} open={copyOpen} onOpenChange={setCopyOpen} />}
      <PageHeader
        title="Шаблони"
        subtitle="Готові тексти для замовлень і вакансій: відгуки, листи, відповіді."
        actions={
          <>
            <ImportButton kind="template" onImported={(id) => id && setOpen(id)} />
            <Button variant="lime" onClick={add}>
              <Plus /> Шаблон
            </Button>
          </>
        }
      >
        {/* Nothing to filter or search on an empty base: the row comes with the first template. */}
        {(all.length > 0 || search || situation) && (
          <FilterBar
            chips={
              <FilterChips
                allLabel="Усі"
                value={situation}
                onChange={setSituation}
                options={SITUATION_OPTIONS.map((o) => ({ ...o, count: counts[o.value] ?? 0 }))}
              />
            }
            trailing={
              <SearchInput value={search} onChange={setSearch} placeholder="Шукати в шаблонах" />
            }
          />
        )}
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="pr-1"
              activeKey={open}
              items={list.items}
              loading={list.isLoading}
              getKey={(t) => t.id}
              estimateSize={84}
              gap={8}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading &&
                (filtered ? (
                  <NoResults
                    hint={`${capitalize(filterHint)} шаблонів немає.`}
                    onReset={() => {
                      setSearch('')
                      setSituation(undefined)
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={MessageSquareQuote}
                    title="Шаблонів поки немає"
                    hint="Збережіть вдалий відгук чи відповідь клієнтові, щоб не писати його заново."
                    cta={{ label: 'Додати шаблон', icon: Plus, onClick: add }}
                  />
                ))
              }
              renderItem={(t) => (
                <ListItem
                  active={t.id === open}
                  onClick={() => setOpen(t.id)}
                  menu={bindMenu(templateMenu, t, {
                    onOpen: () => setOpen(t.id),
                    onCopy: () => {
                      setCopying(t)
                      setCopyOpen(true)
                    }
                  })}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-body font-medium">{t.title}</span>
                        <FavoriteMark
                          entity={{ type: 'template', id: t.id }}
                          onInk={t.id === open}
                        />
                      </div>
                      {t.situation === 'small_talk' ? (
                        <ItemDescription className="mt-1 line-clamp-2 text-caption">
                          {t.trigger || '—'}{' '}
                          <ArrowRight
                            className="inline size-3 align-[-2px]"
                            aria-label="відповідь"
                          />{' '}
                          {t.body || '—'}
                        </ItemDescription>
                      ) : (
                        t.body && (
                          <ItemDescription className="mt-1 line-clamp-2 text-caption">
                            {t.body}
                          </ItemDescription>
                        )
                      )}
                      {/* With a situation filter on, the label would only repeat the chip. */}
                      {!situation && (
                        <ItemDescription className="mt-1 text-meta">
                          {SITUATION_LABEL[t.situation]}
                        </ItemDescription>
                      )}
                    </div>
                    {t.usedIn > 0 && (
                      // The row is a button: a title, not a Tooltip. On the ink row — a tint, not lime.
                      <Badge
                        variant="soft"
                        className={cn(
                          'shrink-0',
                          t.id === open && 'bg-ink-foreground/12 text-ink-foreground'
                        )}
                        title={`Контракти: ${t.hired} з ${t.usedIn} ${plural(t.usedIn, ['відгуку', 'відгуків', 'відгуків'])}`}
                      >
                        {fmtPercent((t.hired / t.usedIn) * 100)}
                      </Badge>
                    )}
                  </div>
                </ListItem>
              )}
            />
          }
          detail={
            current ? (
              <TemplateDetail key={current.id} t={current} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
