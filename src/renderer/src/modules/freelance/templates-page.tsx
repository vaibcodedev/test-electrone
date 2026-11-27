import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowRight, Copy, MessageSquareQuote, Plus } from 'lucide-react'
import {
  isBuiltinSituation,
  PURPOSE_LABEL,
  purposeFits,
  situationLabel,
  TEMPLATE_DIRECTIONS,
  TEMPLATE_PURPOSES,
  TEMPLATE_SITUATIONS,
  templateInputSchema,
  templateVersions,
  type MessageTemplate,
  type TemplateDirection,
  type TemplatePatch,
  type TemplatePurpose,
  type TemplateVersion
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
  SearchInput,
  Segmented
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
import { templateVariables, variableLabel } from './g2-labels'
import { TemplateFillDialog } from './template-fill-dialog'
import { ImportButton } from '@/components/common/import-dialog'
import { DisabledHint } from '@/components/common/disabled-hint'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { bindMenu } from '@/features/record-menu/model'
import { templateMenu } from './template-menu'
import { TagDot } from '@/components/common/tags'
import { PURPOSE_COLOR, PurposeBadge } from './purpose-badge'
import { SituationCombobox } from './situation-combobox'
import {
  nextVersionName,
  removeVersionPatch,
  TemplateVersionsBar,
  versionNames
} from './template-versions'

const TPL_L = limitsOf(templateInputSchema)
const PURPOSE_OPTIONS = TEMPLATE_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABEL[p] }))
/** «Усі» of the direction switch: in the URL it is no `purpose` at all. */
const ALL_DIRECTIONS = 'all'

/** «Для чого» in the record: the coloured label while reading, a Select in «Редагувати». */
function PurposeField({
  value,
  onChange
}: {
  value: TemplatePurpose
  onChange: (purpose: TemplatePurpose) => void
}): ReactElement {
  const readOnly = useReadOnly()
  return readOnly ? (
    <PurposeBadge purpose={value} />
  ) : (
    <EnumSelect options={PURPOSE_OPTIONS} value={value} onChange={onChange} ariaLabel="Для чого" />
  )
}

/**
 * «Скопіювати»: asks for the {variables}, shows the filled text and copies it. Soft, not lime: the page's
 * one lime action is «+ Шаблон» in the header. A plain button opens the dialog (no DialogTrigger asChild:
 * it would replace the button's data-slot).
 */
function CopyTemplateButton({
  template,
  version
}: {
  template: CopySource
  /** The version shown in the record: the dialog starts on it. */
  version: number
}): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="soft" size="sm" onClick={() => setOpen(true)}>
        <Copy /> Скопіювати
      </Button>
      <CopyTemplateDialog
        template={template}
        version={version}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

type CopySource = Pick<MessageTemplate, 'id' | 'title' | 'body' | 'bodyName' | 'versions'>

/** Where the copy dialog starts: the asked version when it has text, else the first one that has. */
function firstWithText(t: CopySource, preferred = 0): number {
  const all = templateVersions(t)
  if (all[preferred]?.body.trim()) return preferred
  return Math.max(
    0,
    all.findIndex((v) => v.body.trim())
  )
}

/** «Скопіювати шаблон»: the gaps filled in, then the text goes to the clipboard and counts as copied. */
function CopyTemplateDialog({
  template,
  version = 0,
  open,
  onOpenChange
}: {
  template: CopySource
  /** Version to start on (the dialog switches between all of them). */
  version?: number
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
      versions={templateVersions(template)}
      initialVersion={firstWithText(template, version)}
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

  // Text versions: the one shown here is local (nothing global is remembered). Edits of different versions in
  // quick succession build on the latest list sent, not on a copy the server has not answered yet.
  const all = templateVersions(t)
  const [shown, setShown] = useState(0)
  const active = Math.min(shown, all.length - 1)
  const latest = useRef<TemplateVersion[]>(t.versions ?? [])
  useEffect(() => {
    latest.current = t.versions ?? []
  }, [t.versions])
  const saveVersions = (versions: TemplateVersion[]): void => {
    latest.current = versions
    save({ versions })
  }
  const setVersion = (i: number, v: Partial<TemplateVersion>): void => {
    if (i === 0) save(v.name !== undefined ? { bodyName: v.name } : { body: v.body ?? '' })
    else saveVersions(latest.current.map((x, k) => (k === i - 1 ? { ...x, ...v } : x)))
  }
  const current = all[active]
  const anyText = all.some((v) => v.body.trim())

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
        anyText ? (
          <CopyTemplateButton template={t} version={active} />
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
          {/* No value: a main from before the field (dev not restarted) — no empty block. */}
          {t.purpose && (
            <Block label="Для чого">
              <PurposeField value={t.purpose} onChange={(purpose) => save({ purpose })} />
            </Block>
          )}
          <Block label="Ситуація" htmlFor={`situation-${t.id}`}>
            <SituationCombobox
              id={`situation-${t.id}`}
              value={t.situation}
              maxLength={TPL_L.situation}
              onChange={(situation) => save({ situation })}
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
        <TemplateVersionsBar
          all={all}
          active={active}
          onActive={setShown}
          onRename={(i, name) => setVersion(i, { name })}
          onAdd={() => {
            saveVersions([...latest.current, { name: nextVersionName(all), body: '' }])
            setShown(all.length)
          }}
          onRemove={(i) => {
            const patch = removeVersionPatch(all, i)
            latest.current = patch.versions as TemplateVersion[]
            save(patch)
            setShown(Math.max(0, i - 1))
          }}
        />
        <TextareaBlock
          // One field per version: switching shows that version's own text and saves into it.
          key={`${active}/${all.length}`}
          label={isTalk ? 'Моя відповідь' : 'Текст'}
          hint={
            <span data-edit-only>
              Змінні у фігурних дужках — {'{client}'}, {'{deadline}'} — заповнюються під час
              копіювання.
            </span>
          }
          value={current.body}
          maxLength={TPL_L.body}
          onSave={(body) => setVersion(active, { body })}
          placeholder="Hi {client}, …"
          className="min-h-48 text-lead leading-relaxed"
        />
        <TemplateVariables body={current.body} />
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
  // In the URL: other pages link to «?purpose=jobs&situation=follow_up» and the like.
  const [params, setParams] = useSearchParams()
  const rawPurpose = params.get('purpose')
  const direction = TEMPLATE_DIRECTIONS.find((d) => d === rawPurpose)
  // A built-in key or the person's own situation, as stored.
  const situation = params.get('situation')?.trim() || undefined
  const setFilter = (next: { purpose?: TemplateDirection | null; situation?: string | null }): void =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        for (const [key, v] of Object.entries(next)) {
          if (v === undefined) continue
          if (v) p.set(key, v)
          else p.delete(key)
        }
        return p
      },
      { replace: true }
    )
  const setSituation = (v: string | undefined): void => setFilter({ situation: v ?? null })
  const [search, setSearch] = useState('')
  const term = useDebounced(search.trim())
  // Full list feeds the counters and the open template; the column pages from the server.
  const { data: all = [] } = useApi('templates', 'list', {})
  const list = useInfiniteApi('templates', 'list', {
    situation,
    purpose: direction,
    search: term || undefined
  })
  const create = useApiMutation('templates', 'create', { onSuccess: (t) => setOpen(t.id) })
  const current = all.find((t) => t.id === open)
  // Under a direction a new template is of it; otherwise main derives it from the situation.
  const add = (): void =>
    create.mutate({
      title: 'Новий шаблон',
      situation: situation ?? (direction === 'jobs' ? 'cover_letter' : 'proposal'),
      purpose: direction
    })
  const filtered = !!search.trim() || !!situation || !!direction
  const filterHint = [
    search.trim() && `За запитом «${search.trim()}»`,
    situation && `у ситуації «${situationLabel(situation)}»`,
    direction && `у напрямку «${PURPOSE_LABEL[direction]}»`
  ]
    .filter(Boolean)
    .join(' ')

  // «Скопіювати…» from a row's menu: one dialog for the page (the menu is gone by the time it opens). The
  // template is kept after closing, so the dialog fades out with its text.
  const [copying, setCopying] = useState<MessageTemplate | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  /** Templates per situation under a direction («Будь-де» ones count in both). */
  const countIn = (d: TemplateDirection | undefined): Map<string, number> => {
    const m = new Map<string, number>()
    for (const t of all)
      if (!d || purposeFits(t.purpose, d)) m.set(t.situation, (m.get(t.situation) ?? 0) + 1)
    return m
  }
  const counts = countIn(direction)
  // Built-in situations in their order, then the person's own ones alphabetically; the chosen one always stays.
  const own = [...new Set(all.map((t) => t.situation).filter((s) => !isBuiltinSituation(s)))].sort(
    (a, b) => a.localeCompare(b, 'uk')
  )
  const situationOptions = [
    ...new Set<string>([...TEMPLATE_SITUATIONS, ...own, ...(situation ? [situation] : [])])
  ].map((s) => ({ value: s, label: situationLabel(s), count: counts.get(s) ?? 0 }))
  // Templates without «Для чого» come only from a main older than the field (dev before a restart): it ignores the
  // direction too, so the switch would show zeros and filter nothing — it is not offered then.
  const directions = all.some((t) => t.purpose)
  const directionCount = (d: TemplateDirection): number =>
    all.filter((t) => purposeFits(t.purpose, d)).length
  // A situation with no templates in the new direction goes with it: its chip would not be offered there.
  const setDirection = (d: TemplateDirection | undefined): void =>
    setFilter({
      purpose: d ?? null,
      situation: situation && !countIn(d).get(situation) ? null : undefined
    })

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
        {(all.length > 0 || search || situation || direction) && (
          <FilterBar
            // Two steps, two rows: first for what, then the situation chips of that direction.
            chips={
              (directions || direction) && (
                <Segmented
                  label="Для чого"
                  value={direction ?? ALL_DIRECTIONS}
                  onChange={(v) =>
                    setDirection(v === ALL_DIRECTIONS ? undefined : (v as TemplateDirection))
                  }
                  options={[
                    { value: ALL_DIRECTIONS, label: 'Усі', count: all.length },
                    ...TEMPLATE_DIRECTIONS.map((d) => ({
                      value: d,
                      label: (
                        <>
                          <TagDot color={PURPOSE_COLOR[d]} />
                          {PURPOSE_LABEL[d]}
                        </>
                      ),
                      count: directionCount(d)
                    }))
                  ]}
                />
              )
            }
            secondary={
              <FilterChips
                label="Ситуація"
                allLabel="Усі ситуації"
                value={situation}
                onChange={setSituation}
                options={situationOptions}
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
                      setFilter({ purpose: null, situation: null })
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
                      <div className="mt-1.5 flex min-w-0 items-center gap-2">
                        <PurposeBadge purpose={t.purpose} onInk={t.id === open} />
                        {/* With a situation filter on, the situation would only repeat the chip. */}
                        {!situation && (
                          <ItemDescription className="min-w-0 truncate text-meta">
                            {situationLabel(t.situation)}
                          </ItemDescription>
                        )}
                        {/* Several text versions: their names, compact («Українська · English»). */}
                        {versionNames(templateVersions(t)) && (
                          <ItemDescription
                            className="min-w-0 truncate text-meta"
                            title={versionNames(templateVersions(t)) ?? undefined}
                          >
                            {versionNames(templateVersions(t))}
                          </ItemDescription>
                        )}
                      </div>
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
