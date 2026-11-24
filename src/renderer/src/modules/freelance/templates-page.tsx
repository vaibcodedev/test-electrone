import { useMemo, useState } from 'react'
import { ArrowRight, Copy, MessageSquareQuote, Plus } from 'lucide-react'
import {
  TEMPLATE_SITUATIONS,
  type MessageTemplate,
  type TemplatePatch,
  type TemplateSituation
} from '@shared/domain/freelance'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
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
  AutoTextarea,
  AutoTitle,
  Block,
  EditorStack,
  EnumSelect,
  InputField,
  useEscapeToClose
} from '../claude/editor-kit'
import { fillTemplate, pct, SITUATION_LABEL, templateVariables } from './g2-labels'

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
    await copyText(filled, 'Шаблон скопирован')
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
              ? 'Заполните переменные — пустые останутся в фигурных скобках.'
              : 'Переменных нет, текст скопируется как есть.'}
          </DialogDescription>
        </DialogHeader>
        {vars.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {vars.map((v, i) => (
              <Field key={v} className="gap-1.5">
                <FieldLabel htmlFor={`var-${v}`}>{v}</FieldLabel>
                <Input
                  id={`var-${v}`}
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
          <FieldLabel>Получится</FieldLabel>
          <Textarea
            readOnly
            value={filled}
            className="max-h-72 min-h-32 text-[13px] leading-relaxed"
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button variant="lime" onClick={() => void doCopy()}>
            <Copy /> Скопировать
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
      {t.usedIn > 0 && <Badge variant="soft">в откликах: {t.usedIn}</Badge>}
      {t.usedIn > 0 && (
        <Badge variant="info">
          ответы {t.replied} · {pct((t.replied / t.usedIn) * 100)}
        </Badge>
      )}
      {t.usedIn > 0 && (
        <Badge variant="success">
          контракты {t.hired} · {pct((t.hired / t.usedIn) * 100)}
        </Badge>
      )}
      {t.copyCount > 0 && <Badge variant="outline">скопирован {t.copyCount}×</Badge>}
    </div>
  )
}

function TemplateDetail({ t, onClose }: { t: MessageTemplate; onClose: () => void }) {
  const update = useApiMutation('templates', 'update')
  const remove = useApiMutation('templates', 'remove', { successMessage: 'Перемещено в корзину' })
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
              <Copy /> Копировать
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
          <Block label="Ситуация">
            <EnumSelect
              options={SITUATION_OPTIONS}
              value={t.situation}
              onChange={(situation) => save({ situation })}
              ariaLabel="Ситуация"
            />
          </Block>
          <InputField
            label="Тип задачи"
            value={t.niche}
            onSave={(niche) => save({ niche })}
            placeholder="Next.js, вёрстка, боты…"
          />
          <StatBadges t={t} />
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle
          value={t.title}
          onSave={(title) => save({ title })}
          placeholder="Название шаблона"
        />
        <Block label={isTalk ? 'Фраза клиента' : 'Когда использовать'}>
          <AutoTextarea
            value={t.trigger}
            onSave={(trigger) => save({ trigger })}
            placeholder={isTalk ? 'How are you doing?' : 'Например: клиент спросил сроки'}
          />
        </Block>
        <Block
          label={isTalk ? 'Мой ответ' : 'Текст'}
          hint="Переменные в фигурных скобках — {client}, {deadline} — заполняются при копировании."
        >
          <AutoTextarea
            value={t.body}
            onSave={(body) => save({ body })}
            placeholder="Hi {client}, …"
            className="min-h-48 text-[14px] leading-relaxed"
          />
        </Block>
        <Block label="Заметка для себя">
          <AutoTextarea
            value={t.note}
            onSave={(note) => save({ note })}
            placeholder="Что означает, когда не стоит использовать"
          />
        </Block>
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
        title="Шаблоны"
        subtitle="Готовые ответы по ситуациям. Отмечайте шаблон в отклике — статистика покажет, какой приводит к контрактам."
        actions={
          <Button
            variant="lime"
            onClick={() =>
              create.mutate({ title: 'Новый шаблон', situation: situation ?? 'proposal' })
            }
          >
            <Plus /> Шаблон
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Все"
            value={situation}
            onChange={setSituation}
            options={SITUATION_OPTIONS.map((o) => ({ ...o, count: counts[o.value] ?? 0 }))}
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Искать в шаблонах"
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
                    title={search ? 'Ничего не нашлось' : 'Шаблонов пока нет'}
                    hint="Сохраните удачный отклик или ответ клиенту, чтобы не писать его заново."
                  />
                )
              }
              renderItem={(t) => (
                <ListItem active={t.id === open} onClick={() => setOpen(t.id)}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] opacity-60">
                        {SITUATION_LABEL[t.situation]}
                      </div>
                      <div className="truncate text-[13.5px] font-medium">{t.title}</div>
                      {t.situation === 'small_talk' ? (
                        <div className="mt-1 flex items-center gap-1.5 text-[12px] opacity-70">
                          <span className="truncate">{t.trigger || '—'}</span>
                          <ArrowRight className="size-3 shrink-0" />
                          <span className="truncate">{t.body || '—'}</span>
                        </div>
                      ) : (
                        <div className="mt-1 line-clamp-2 text-[12px] opacity-70">{t.body}</div>
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
