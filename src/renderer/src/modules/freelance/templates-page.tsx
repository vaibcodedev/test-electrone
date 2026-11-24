import { useMemo, useState } from 'react'
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
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  TextareaBlock,
  useEscapeToClose
} from '../claude/editor-kit'
import { fillTemplate, pct, SITUATION_LABEL, templateVariables, variableLabel } from './g2-labels'
import { ImportButton } from '@/components/common/import-dialog'

const TPL_L = limitsOf(templateInputSchema)
const SITUATION_OPTIONS = TEMPLATE_SITUATIONS.map((s) => ({ value: s, label: SITUATION_LABEL[s] }))

/** Asks for {variables}, shows the filled text and copies it. */
export function CopyTemplateDialog({
  template,
  trigger
}: {
  template: Pick<MessageTemplate, 'id' | 'title' | 'body'>
  trigger: React.ReactNode
}) {
  const vars = useMemo(() => templateVariables(template.body), [template.body])
  const [values, setValues] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const filled = fillTemplate(template.body, values)

  const doCopy = async (): Promise<void> => {
    await copyText(filled, 'Шаблон скопійовано')
    await api.templates.markCopied(template.id)
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
            <Copy /> Скопіювати
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
          відповіді {t.replied} · {pct((t.replied / t.usedIn) * 100)}
        </Badge>
      )}
      {t.usedIn > 0 && (
        <Badge variant="success">
          контракти {t.hired} · {pct((t.hired / t.usedIn) * 100)}
        </Badge>
      )}
      {t.copyCount > 0 && <Badge variant="outline">скопійовано {t.copyCount}×</Badge>}
    </div>
  )
}

function TemplateDetail({ t, onClose }: { t: MessageTemplate; onClose: () => void }) {
  const update = useApiMutation('templates', 'update')
  const remove = useApiMutation('templates', 'remove', { successMessage: 'Переміщено в кошик' })
  const save = (patch: TemplatePatch): void => update.mutate({ id: t.id, patch })
  const entity = { type: 'template' as const, id: t.id }
  const isTalk = t.situation === 'small_talk'
  useEscapeToClose(onClose)

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(t.id)
        onClose()
      }}
      headerExtra={
        <CopyTemplateDialog
          template={t}
          trigger={
            <Button variant="lime" size="sm">
              <Copy /> Копіювати
            </Button>
          }
        />
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
          hint="Змінні у фігурних дужках — {client}, {deadline} — заповнюються під час копіювання."
          value={t.body}
          maxLength={TPL_L.body}
          onSave={(body) => save({ body })}
          placeholder="Hi {client}, …"
          className="min-h-48 text-lead leading-relaxed"
        />
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
          <FilterChips
            allLabel="Усі"
            value={situation}
            onChange={setSituation}
            options={SITUATION_OPTIONS.map((o) => ({ ...o, count: counts[o.value] ?? 0 }))}
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Шукати в шаблонах"
            className="ml-auto w-64"
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
                      <div className="text-meta opacity-60">{SITUATION_LABEL[t.situation]}</div>
                      <div className="truncate text-body font-medium">{t.title}</div>
                      {t.situation === 'small_talk' ? (
                        <div className="mt-1 flex items-center gap-1.5 text-caption opacity-70">
                          <span className="truncate">{t.trigger || '—'}</span>
                          <ArrowRight className="size-3 shrink-0" />
                          <span className="truncate">{t.body || '—'}</span>
                        </div>
                      ) : (
                        <div className="mt-1 line-clamp-2 text-caption opacity-70">{t.body}</div>
                      )}
                    </div>
                    {t.usedIn > 0 && (
                      <Badge variant={t.id === open ? 'lime' : 'soft'} className={cn('shrink-0')}>
                        {pct((t.hired / t.usedIn) * 100)}
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
