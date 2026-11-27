import { useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Dumbbell, MessageCircleQuestion, Plus } from 'lucide-react'
import {
  QUESTION_CATEGORIES,
  questionInputSchema,
  type InterviewQuestion,
  type QuestionCategory,
  type QuestionPatch,
  type QuestionGroup
} from '@shared/domain/jobs'
import { DRAFT_TITLES } from '@shared/entity-types'
import { api } from '@/lib/api'
import { useApi, useApiMutation, useInfiniteApi, useInPlaceApi } from '@/lib/query'
import { RecordLoadError } from '@/components/common/record-load-error'
import { useDebounced } from '@/hooks/use-debounced'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDateTime, fmtDay, easeLabel } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { EmptyState, Field, FilterBar, FilterChips, NoResults, Page, PageBody, PageHeader, SearchInput, Segmented } from '@/components/common/page'
import { DetailPane, EntityAside, ListItem, MasterDetail, SectionLabel, useOpenParam } from '@/components/common/master-detail'
import { Combobox } from '@/components/common/combobox'
import { MarkdownField } from '@/components/common/markdown'
import { TagFilter } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { VirtualList } from '@/components/common/virtual-list'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'
import { StatCell } from '@/components/common/stat-tile'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useDetailMode, useReadOnly } from '@/components/common/detail-mode-context'
import { EditHintText } from '@/components/common/detail-mode'
import { daysWord, DIFFICULTY_LABEL, LANG_LABEL, QUESTION_CATEGORY_LABEL, QUESTION_GROUP_LABEL } from './labels'
import { QuestionCategoryFilter, QuestionCategoryPicker } from './question-category'
import { ApplicationCombobox, CompanyCombobox } from './j1-fields'
import { bindMenu } from '@/features/record-menu/model'
import { questionMenu } from './menus'

const LIMITS = limitsOf(questionInputSchema)
/** Draft titles: an untouched new question is discarded on close; the first one is what «Питання» creates. */
const DRAFTS: readonly string[] = DRAFT_TITLES.question ?? []

type Form = Pick<InterviewQuestion, 'question' | 'answer' | 'category' | 'topic' | 'lang' | 'difficulty' | 'companyId' | 'applicationId'>

const toForm = (q: InterviewQuestion): Form => ({
  question: q.question,
  answer: q.answer,
  category: q.category,
  topic: q.topic,
  lang: q.lang,
  difficulty: q.difficulty,
  companyId: q.companyId,
  applicationId: q.applicationId
})

/** Never practised = not «due» yet: a new question used to say «Пора повторити» while its body said «Ще не тренували». */
const isFresh = (q: InterviewQuestion): boolean => q.repetitions === 0 && q.lapses === 0

/** Spaced-repetition state; a question never practised gets one phrase — the tiles mean something after a review. */
function ReviewStats({ question }: { question: InterviewQuestion }): ReactElement {
  const fresh = isFresh(question)
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Повторення</SectionLabel>
      {fresh ? (
        <p className="text-body leading-relaxed text-muted-foreground">
          Ще не тренували — питання з’явиться в тренажері {fmtDay(question.dueAt)}.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <StatCell
            label="Наступне повторення"
            value={fmtDay(question.dueAt) || '—'}
            hint={`Коли питання знову з’явиться в тренажері: ${fmtDateTime(question.dueAt)}.`}
          />
          <StatCell
            label="Пауза"
            value={question.intervalDays < 1 ? 'менше дня' : daysWord(Math.round(question.intervalDays))}
            hint="Скільки днів між повтореннями зараз. Відповіли — пауза росте, не змогли — знову коротка."
          />
          <StatCell label="Поспіль без помилок" value={String(question.repetitions)} hint="Скільки разів поспіль ви відповіли без помилки." />
          <StatCell label="Помилок" value={String(question.lapses)} hint="Скільки разів відповідь не вдалася і питання повернулося на початок." />
          <div className="col-span-2 grid">
            <StatCell
              label="Дається"
              value={easeLabel(question.ease)}
              hint="Наскільки легко дається питання за вашими оцінками. Чим важче, тим частіше воно трапляється."
            />
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * The question itself: a heading while reading, a multi-line field while editing — in the same type, so «E»
 * doesn't make the text jump. Not InlineTitle: it clamps to 4 lines and folds line breaks, and questions
 * (with code, from a JSON import) are up to 5000 characters over several lines. Rendered inside DetailPane,
 * so it reads the pane's mode.
 */
function QuestionText({ value, onChange }: { value: string; onChange: (value: string) => void }): ReactElement {
  const readOnly = useReadOnly()
  const { fresh } = useDetailMode()
  const id = useId()
  const field = useRef<HTMLTextAreaElement>(null)
  const focused = useRef(false)
  // A new question opens focused (without scrolling the pane), its draft title selected to be typed over.
  useEffect(() => {
    if (!fresh || readOnly || focused.current || !field.current) return
    focused.current = true
    field.current.focus({ preventScroll: true })
    if (DRAFTS.includes(value)) field.current.select()
  }, [fresh, readOnly, value])
  const empty = !value.trim()
  if (readOnly)
    return <h2 className="font-display py-1 text-headline leading-[1.1] whitespace-pre-line wrap-anywhere">{value || 'Питання'}</h2>
  return (
    <Field
      label="Питання"
      htmlFor={id}
      count={{ length: value.length, max: LIMITS.question }}
      error={empty ? 'Впишіть питання — порожнє не збережеться' : undefined}
    >
      <Textarea
        ref={field}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={LIMITS.question}
        placeholder="Яке питання поставили?"
        aria-invalid={empty || undefined}
        className="font-display text-headline leading-[1.1]"
      />
    </Field>
  )
}

function ReviewBadge({ question: q }: { question: InterviewQuestion }): ReactElement {
  const [now] = useState(() => Date.now())
  if (isFresh(q)) return <Badge variant="soft">Нове</Badge>
  // Due asks for action (info), it isn't a success (docs/design-system.md → Бейджи).
  if (q.dueAt <= now) return <Badge variant="info">Пора повторити</Badge>
  return <Badge variant="soft">Повторення {fmtDay(q.dueAt)}</Badge>
}

/**
 * «Мова відповіді» / «Складність»: while reading — the same two columns as «Категорія / Тема» above, so the
 * values line up; while editing three segments don't fit half of a 38%-wide pane, so they wrap.
 * Inside DetailPane: QuestionDetail itself sits above the mode provider.
 */
function LangDifficultyRow({ children }: { children: ReactNode }): ReactElement {
  const readOnly = useReadOnly()
  return <div className={readOnly ? 'grid grid-cols-2 gap-4' : 'flex flex-wrap gap-x-6 gap-y-4'}>{children}</div>
}

function QuestionDetail({ question, topics, onClose }: { question: InterviewQuestion; topics: string[]; onClose: () => void }): ReactElement {
  const update = useApiMutation('jobs', 'updateQuestion')
  const remove = useApiMutation('jobs', 'removeQuestion', { successMessage: 'Питання переміщено в кошик' })
  const initial = useMemo(() => toForm(question), [question])
  const [form, setForm] = useAutosave<Form>(initial, (next) => {
    if (!next.question.trim()) return
    update.mutate({ id: question.id, patch: next as QuestionPatch })
  })
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => setForm({ ...form, [key]: value })
  const entity = { type: 'question' as const, id: question.id }

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => remove.mutate(question.id)}
      headerExtra={<ReviewBadge question={question} />}
      emptyHint={
        <>
          Відповіді ще немає. <EditHintText action="дописати" />
        </>
      }
      aside={
        <EntityAside
          entity={entity}
          tags={question.tags}
          onTagsChange={(tagIds) => update.mutate({ id: question.id, patch: { tagIds } })}
          createdAt={question.createdAt}
          updatedAt={question.updatedAt}
          files={false}
        >
          <ReviewStats question={question} />
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        <QuestionText value={form.question} onChange={(v) => set('question', v)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Категорія">
            <QuestionCategoryPicker value={form.category} onChange={(c) => set('category', c)} />
          </Field>
          <Field label="Тема">
            <Combobox
              value={form.topic || null}
              // The current topic too: a just-created one isn't in `topics` until the refetch.
              options={[...new Set([...topics, form.topic].filter(Boolean))].map((t) => ({ value: t, label: t }))}
              onChange={(v) => set('topic', v ?? '')}
              creatable
              onCreate={(t) => set('topic', t)}
              clearable
              clearLabel="Без теми"
              placeholder="Виберіть або введіть тему"
              searchPlaceholder="Знайти або створити…"
              emptyText="Тем поки немає"
              maxLength={LIMITS.topic}
            />
          </Field>
        </div>
        <LangDifficultyRow>
          <Field label="Мова відповіді" className="w-auto">
            <Segmented
              size="sm"
              className="w-fit!"
              value={form.lang}
              onChange={(v) => set('lang', v)}
              options={(['ru', 'uk', 'en'] as const).map((l) => ({ value: l, label: LANG_LABEL[l] }))}
            />
          </Field>
          <Field label="Складність" className="w-auto">
            <Segmented
              size="sm"
              className="w-fit!"
              value={String(form.difficulty) as '1' | '2' | '3'}
              onChange={(v) => set('difficulty', Number(v))}
              options={(['1', '2', '3'] as const).map((d) => ({ value: d, label: DIFFICULTY_LABEL[Number(d)] }))}
            />
          </Field>
        </LangDifficultyRow>
        <MarkdownField
          label="Моя найкраща відповідь"
          value={form.answer}
          onChange={(v) => set('answer', v)}
          placeholder="Структура: суть → приклад із досвіду → результат. Можна англійською."
          maxLength={LIMITS.answer}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Питали в компанії">
            <CompanyCombobox
              value={{ companyId: form.companyId, companyName: '' }}
              onChange={({ companyId }) => set('companyId', companyId)}
              allowText={false}
              showLink={false}
            />
          </Field>
          <Field label="На співбесіді за вакансією">
            <ApplicationCombobox value={form.applicationId} onChange={(id) => set('applicationId', id)} />
          </Field>
        </div>
      </div>
    </DetailPane>
  )
}

/** Interview question bank: technical and soft questions with my best answers + SRS practice. */
export function QuestionsPage(): ReactElement {
  const navigate = useNavigate()
  const [open, setOpen] = useOpenParam()
  const [category, setCategory] = useState<QuestionCategory | undefined>()
  const [group, setGroup] = useState<QuestionGroup | undefined>()
  const [topic, setTopic] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)
  const term = useDebounced(search.trim())
  const [now] = useState(() => Date.now())
  const base = { search: term || undefined, tagId, favorite: favorite || undefined }
  // Chip counters come from the server (GROUP BY), not from loading the whole bank.
  const { data: rawCounts, isLoading } = useApi('jobs', 'questionCounts', base)
  // A category with no questions is missing from the server's GROUP BY: 0, so its chip hides.
  const counts = Object.fromEntries(QUESTION_CATEGORIES.map((c) => [c, rawCounts?.[c] ?? 0])) as Record<QuestionCategory, number>
  const total = QUESTION_CATEGORIES.reduce((n, c) => n + counts[c], 0)
  const list = useInfiniteApi('jobs', 'questions', { ...base, group, category, topic })
  const { data: topics = [] } = useApi('jobs', 'topics')
  const { data: due = [] } = useApi('jobs', 'practiceQueue', { limit: 200 })
  const create = useApiMutation('jobs', 'createQuestion')

  // The open question is loaded on its own: an edit that drops it out of the search/tag filter must not close it.
  const openRecord = useInPlaceApi('jobs', 'question', open ?? '', { enabled: !!open })
  const current = openRecord.data

  // What is really narrowing the list, for the «Нічого не знайдено» hint.
  const filters = [
    search.trim() && `за запитом «${search.trim()}»`,
    topic && `у темі «${topic}»`,
    category ? `у категорії «${QUESTION_CATEGORY_LABEL[category]}»` : group && `у групі «${QUESTION_GROUP_LABEL[group]}»`,
    tagId && 'з вибраною міткою',
    favorite && 'серед обраних'
  ].filter((f): f is string => !!f)
  const resetFilters = (): void => {
    setGroup(undefined)
    setCategory(undefined)
    setTopic(undefined)
    setTagId(undefined)
    setFavorite(false)
    setSearch('')
  }

  // An empty bank has one action — add a question; with a search that matched nothing the header stays put.
  const emptyBank = !isLoading && !total && !term && !tagId && !favorite

  const add = (): void => {
    create.mutate(
      { question: DRAFTS[0], category: category ?? (group === 'nontechnical' ? 'behavioral' : 'technical'), topic: topic ?? '' },
      { onSuccess: (q) => setOpen(q.id) }
    )
  }

  return (
    <Page>
      <PageHeader
        title="Підготовка до співбесід"
        subtitle="Записуйте питання з реальних співбесід і свої найкращі відповіді — тренажер нагадає повторити."
        actions={
          <>
            {/* The whole filtered bank, fetched on click — not just the pages loaded so far. */}
            {!emptyBank && (
              <CopyJsonButton
                what="Питання"
                disabled={!total}
                getData={async () =>
                  (await api.jobs.questions({ ...base, group, category, topic })).map((q) => ({
                    question: q.question,
                    answer: q.answer,
                    category: q.category,
                    topic: q.topic,
                    difficulty: q.difficulty,
                    lang: q.lang
                  }))
                }
              />
            )}
            <ImportButton kind="question" onImported={(id) => id && setOpen(id)} />
            {/* Never a dead end: with nothing due it starts extra practice right away. */}
            {!emptyBank && (
              <Button
                variant="soft"
                disabled={!total}
                onClick={() => navigate(due.length ? '/jobs/questions/practice' : '/jobs/questions/practice?extra=1')}
              >
                <Dumbbell /> Тренування
                {due.length > 0 && <Badge variant="soft">{due.length}</Badge>}
              </Button>
            )}
            {/* Lime = the N key: «N» creates a question here. */}
            <Button variant="lime" onClick={add}>
              <Plus /> Питання
            </Button>
          </>
        }
      >
        <FilterBar
          emptyBase={!search && !filters.length && list.showEmpty && !list.items.length}
          chips={
            // An empty bank has nothing to filter by: no «Усі» chip over the empty state.
            (total > 0 || term || tagId || favorite) && (
              <QuestionCategoryFilter
                group={group}
                category={category}
                onChange={(next) => {
                  setGroup(next.group)
                  setCategory(next.category)
                }}
                counts={counts}
              />
            )
          }
          trailing={
            <>
              <FavoriteFilter type="question" value={favorite} onChange={setFavorite} />
              <TagFilter value={tagId} onChange={setTagId} />
              <SearchInput value={search} onChange={setSearch} placeholder="Питання або відповідь" />
            </>
          }
          secondary={
            topics.length > 0 && (
              <FilterChips
                tone="neutral"
                label="Тема"
                allLabel="Усі теми"
                value={topic}
                onChange={setTopic}
                options={topics.map((t) => ({ value: t, label: t }))}
              />
            )
          }
        />
      </PageHeader>
      <PageBody className="flex min-h-0">
        <MasterDetail
          listSize="38%"
          list={
            <VirtualList
              className="pr-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(q) => q.id}
              estimateSize={72}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading &&
                !isLoading &&
                (filters.length ? (
                  <NoResults icon={MessageCircleQuestion} hint={`Питань ${filters.join(' і ')} немає.`} onReset={resetFilters} />
                ) : (
                  <EmptyState
                    icon={MessageCircleQuestion}
                    title="Питань поки немає"
                    hint="Додайте питання, яке поставили на співбесіді, і свою відповідь на нього."
                    cta={{ label: 'Додати питання', icon: Plus, onClick: add }}
                  />
                ))
              }
              renderItem={(q) => {
                // A never-practised question isn't «due»: the badge would sit on almost every row.
                const isDue = q.dueAt <= now && !isFresh(q)
                const active = q.id === open
                // Only what the filter doesn't already say: topic, category without a filter, a non-default language.
                const meta = [
                  q.topic,
                  !group && !category ? QUESTION_CATEGORY_LABEL[q.category] : '',
                  q.lang !== 'uk' ? LANG_LABEL[q.lang] : ''
                ]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <ListItem
                    active={active}
                    onClick={() => setOpen(active ? null : q.id)}
                    menu={bindMenu(questionMenu, q, { onOpen: () => setOpen(q.id) })}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-1.5">
                        <div className="line-clamp-2 min-w-0 text-body font-medium">{q.question}</div>
                        <FavoriteMark entity={{ type: 'question', id: q.id }} onInk={active} className="mt-0.5" />
                      </div>
                      {(!q.answer.trim() || isDue) && (
                        <div className="flex shrink-0 gap-1">
                          {/* On the ink row the badges take the TagList tint (docs/design-system.md → Метки). */}
                          {!q.answer.trim() && (
                            <Badge variant={active ? 'ink' : 'warn'} className={cn(active && 'bg-ink-foreground/12')}>
                              без відповіді
                            </Badge>
                          )}
                          {isDue && (
                            <Badge variant={active ? 'ink' : 'info'} className={cn(active && 'bg-ink-foreground/12')}>
                              повторити
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {meta && <div className={cn('mt-1 truncate text-meta', active ? 'text-ink-muted' : 'text-muted-foreground')}>{meta}</div>}
                  </ListItem>
                )
              }}
            />
          }
          detail={
            openRecord.failed ? (
              <RecordLoadError pane onRetry={openRecord.retry} onClose={() => setOpen(null)} />
            ) : current && current.id === open ? (
              <QuestionDetail key={current.id} question={current} topics={topics} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
