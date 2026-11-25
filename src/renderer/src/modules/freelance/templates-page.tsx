import { useMemo, useState, type ReactElement } from 'react'
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
import { fmtPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ItemDescription } from '@/components/ui/item'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  EmptyState,
  FilterChips,
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
import {
  AutoTitle,
  Block,
  EditorStack,
  EnumSelect,
  InputField,
  TextareaBlock
} from '../claude/editor-kit'
import { fillTemplate, SITUATION_LABEL, templateVariables, variableLabel } from './g2-labels'
import { ImportButton } from '@/components/common/import-dialog'
import { DisabledHint } from './disabled-hint'

const TPL_L = limitsOf(templateInputSchema)
const SITUATION_OPTIONS = TEMPLATE_SITUATIONS.map((s) => ({ value: s, label: SITUATION_LABEL[s] }))

/** Asks for {variables}, shows the filled text and copies it. */
function CopyTemplateDialog({
  template,
  trigger
}: {
  template: Pick<MessageTemplate, 'id' | 'title' | 'body'>
  trigger: React.ReactNode
}) {
  const vars = useMemo(() => templateVariables(template.body), [template.body])
  const [values, setValues] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const markCopied = useApiMutation('templates', 'markCopied')
  const filled = fillTemplate(template.body, values)

  const doCopy = async (): Promise<void> => {
    await copyText(filled, 'Шаблон скопійовано')
    markCopied.mutate(template.id)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setValues({})
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template.title}</DialogTitle>
          <DialogDescription>
            {vars.length
              ? 'Заповніть змінні — порожні лишаться у фігурних дужках.'
              : 'Змінних немає, текст скопіюється як є.'}
          </DialogDescription>
        </DialogHeader>
        {vars.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {vars.map((v, i) => (
              <Field key={v} className="gap-1.5">
                <FieldLabel htmlFor={`var-${v}`} className="flex w-full items-baseline justify-between gap-2">
                  {variableLabel(v)}
                  <span className="font-mono text-meta font-normal text-muted-foreground">{`{${v}}`}</span>
                </FieldLabel>
                <Input
                  id={`var-${v}`}
                  placeholder={`Порожньо — лишиться {${v}}`}
                  autoFocus={i === 0}
                  value={values[v] ?? ''}
                  onChange={(e) => setValues((s) => ({ ...s, [v]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && void doCopy()}
                />
              </Field>
            ))}
          </div>
        )}
        <Field className="gap-1.5">
          <FieldLabel>Вийде</FieldLabel>
          <Textarea
            readOnly
            value={filled}
            className="max-h-72 min-h-32 text-body leading-relaxed"
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Скасувати
          </Button>
          <Button variant="lime" onClick={() => void doCopy()}>
            <Copy /> Копіювати текст
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatBadges({ t }: { t: MessageTemplate }) {
  if (!t.usedIn && !t.copyCount) return null
  return (
    <div className="flex flex-wrap gap-1">
      {t.usedIn > 0 && <Badge variant="soft">у відгуках: {t.usedIn}</Badge>}
      {t.usedIn > 0 && (
        <Badge variant="info">
          відповіді {t.replied} · {fmtPercent((t.replied / t.usedIn) * 100)}
        </Badge>
      )}
      {t.usedIn > 0 && (
        <Badge variant="success">
          контракти {t.hired} · {fmtPercent((t.hired / t.usedIn) * 100)}
        </Badge>
      )}
      {t.copyCount > 0 && <Badge variant="outline">скопійовано {t.copyCount}×</Badge>}
    </div>
  )
}

/** The template's own {variables} while reading: what the copy dialog will ask for. */
function TemplateVariables({ body }: { body: string }): ReactElement | null {
  const readOnly = useReadOnly()
  const vars = templateVariables(body)
  if (!readOnly || !vars.length) return null
  return (
    <div className="-mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-caption text-muted-foreground">Змінні:</span>
      {vars.map((v) => (
        <Badge key={v} variant="soft">
          {variableLabel(v)}
        </Badge>
      ))}
    </div>
  )
}

function TemplateDetail({ t, onClose }: { t: MessageTemplate; onClose: () => void }) {
  const update = useApiMutation('templates', 'update')
  const remove = useApiMutation('templates', 'remove', { successMessage: 'Переміщено в кошик' })
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
      headerExtra={
        t.body.trim() ? (
          <CopyTemplateDialog
            template={t}
            trigger={
              <Button variant="lime" size="sm">
                <Copy /> Копіювати
              </Button>
            }
          />
        ) : (
          <DisabledHint reason="Додайте текст, щоб копіювати">
            <Button variant="lime" size="sm" disabled>
              <Copy /> Копіювати
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
          <InputField
            label="Тип завдання"
            value={t.niche}
            maxLength={TPL_L.niche}
            onSave={(niche) => save({ niche })}
            placeholder="Next.js, верстка, боти…"
          />
          <StatBadges t={t} />
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
          placeholder={isTalk ? 'How are you doing?' : 'Наприклад: клієнт запитав про терміни'}
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
          placeholder="Що означає, коли не варто використовувати"
        />
      </EditorStack>
    </DetailPane>
  )
}

export function TemplatesPage() {
  const [open, setOpen] = useOpenParam()
  const [situation, setSituation] = useState<TemplateSituation | undefined>()
  const [search, setSearch] = useState('')
  const term = useDebounced(search.trim())
  // Full list feeds the situation counters and the open template; the column pages from the server.
  const { data: all = [] } = useApi('templates', 'list', {})
  const list = useInfiniteApi('templates', 'list', { situation, search: term || undefined })
  const create = useApiMutation('templates', 'create', { onSuccess: (t) => setOpen(t.id) })
  const current = all.find((t) => t.id === open)

  const counts = all.reduce<Partial<Record<TemplateSituation, number>>>((acc, t) => {
    acc[t.situation] = (acc[t.situation] ?? 0) + 1
    return acc
  }, {})

  return (
    <Page>
      <PageHeader
        title="Шаблони"
        subtitle="Готові відповіді для різних ситуацій. Позначайте шаблон у відгуку — статистика покаже, який приводить до контрактів."
        actions={
          <>
            <ImportButton kind="template" onImported={(id) => id && setOpen(id)} />
            <Button
              variant="lime"
              onClick={() =>
                create.mutate({ title: 'Новий шаблон', situation: situation ?? 'proposal' })
              }
            >
              <Plus /> Шаблон
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Шукати в шаблонах"
            className="w-64"
          />
          {/* Only situations that have templates: a zero chip always leads to an empty list. */}
          <FilterChips
            allLabel="Усі"
            value={situation}
            onChange={setSituation}
            options={SITUATION_OPTIONS.filter(
              (o) => (counts[o.value] ?? 0) > 0 || o.value === situation
            ).map((o) => ({ ...o, count: counts[o.value] ?? 0 }))}
          />
        </div>
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="pr-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(t) => t.id}
              estimateSize={84}
              gap={8}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading && (
                  <EmptyState
                    icon={MessageSquareQuote}
                    title={search ? 'Нічого не знайдено' : 'Шаблонів поки немає'}
                    hint="Збережіть вдалий відгук чи відповідь клієнтові, щоб не писати його заново."
                  />
                )
              }
              renderItem={(t) => (
                <ListItem active={t.id === open} onClick={() => setOpen(t.id)}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-medium">{t.title}</div>
                      {t.situation === 'small_talk' ? (
                        <ItemDescription className="mt-1 line-clamp-2 text-caption">
                          {t.trigger || '—'}{' '}
                          <ArrowRight className="inline size-3 align-[-2px]" aria-label="відповідь" />{' '}
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
                      <Badge variant={t.id === open ? 'lime' : 'soft'} className="shrink-0">
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
