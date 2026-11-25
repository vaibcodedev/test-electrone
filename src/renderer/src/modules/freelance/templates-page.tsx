import { useMemo, useState, type ReactElement } from 'react'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import { FormDialog } from '@/components/common/form-dialog'
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
import { fillTemplate, SITUATION_LABEL, templateVariables, variableLabel } from './g2-labels'
import { ImportButton } from '@/components/common/import-dialog'
import { DisabledHint } from './disabled-hint'
import { NicheCombobox } from './niche-combobox'

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
  const vars = useMemo(() => templateVariables(template.body), [template.body])
  const [values, setValues] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const markCopied = useApiMutation('templates', 'markCopied')
  const filled = fillTemplate(template.body, values)

  const onOpenChange = (o: boolean): void => {
    setOpen(o)
    if (!o) setValues({})
  }
  const doCopy = async (): Promise<void> => {
    if (!(await copyText(filled, 'Шаблон скопійовано'))) return
    markCopied.mutate(template.id)
    onOpenChange(false)
  }

  return (
    <>
      <Button variant="soft" size="sm" onClick={() => setOpen(true)}>
        <Copy /> Скопіювати
      </Button>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Скопіювати шаблон"
        description={
          vars.length
            ? 'Заповніть змінні — порожні лишаться у фігурних дужках.'
            : 'Змінних немає, текст скопіюється як є.'
        }
        submitLabel="Скопіювати текст"
        onSubmit={doCopy}
        className="sm:max-w-2xl"
      >
        {/* The name goes in the body, not the title: a long one without spaces ran under ✕. */}
        <p
          className="line-clamp-2 text-body font-medium wrap-anywhere"
          title={template.title}
        >
          {template.title}
        </p>
        {vars.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {vars.map((v, i) => (
              <Field key={v} className="gap-1.5">
                <FieldLabel
                  htmlFor={`var-${v}`}
                  className="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-2"
                >
                  <span className="min-w-0">{variableLabel(v)}</span>
                  <span
                    className="min-w-0 truncate font-mono text-meta font-normal text-muted-foreground"
                    title={`{${v}}`}
                  >
                    {`{${v}}`}
                  </span>
                </FieldLabel>
                <Input
                  id={`var-${v}`}
                  autoFocus={i === 0}
                  value={values[v] ?? ''}
                  onChange={(e) => setValues((s) => ({ ...s, [v]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        )}
        <Field className="gap-1.5">
          <FieldLabel htmlFor="template-filled">Готовий текст</FieldLabel>
          <Textarea
            id="template-filled"
            readOnly
            value={filled}
            className="max-h-72 min-h-32 text-body leading-relaxed"
          />
        </Field>
      </FormDialog>
    </>
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
      onDelete={() => {
        remove.mutate(t.id)
        onClose()
      }}
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
  // In the URL: the sidebar and the job pages link to «?situation=cover_letter» and the like.
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

  const counts = all.reduce<Partial<Record<TemplateSituation, number>>>((acc, t) => {
    acc[t.situation] = (acc[t.situation] ?? 0) + 1
    return acc
  }, {})

  return (
    <Page>
      <PageHeader
        title="Шаблони"
        subtitle="Готові відповіді для відгуків і листування з клієнтами."
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
                <ListItem active={t.id === open} onClick={() => setOpen(t.id)}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-medium">{t.title}</div>
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
