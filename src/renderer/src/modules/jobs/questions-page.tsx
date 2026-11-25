import { useId, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { Dumbbell, MessageCircleQuestion, Plus } from 'lucide-react'
import {
  groupOf,
  QUESTION_CATEGORIES,
  questionInputSchema,
  type InterviewQuestion,
  type QuestionCategory,
  type QuestionPatch,
  type QuestionGroup
} from '@shared/domain/jobs'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDateTime, fmtDay, easeLabel } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { EmptyState, Field, FilterBar, FilterChips, NoResults, Page, PageBody, PageHeader, SearchInput, Segmented } from '@/components/common/page'
import { DetailPane, EntityAside, InlineTitle, ListItem, MasterDetail, SectionLabel, useOpenParam } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { TagFilter } from '@/components/common/tags'
import { VirtualList } from '@/components/common/virtual-list'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'
import { StatCell } from '@/components/common/stat-tile'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useDetailMode, useReadOnly } from '@/components/common/detail-mode-context'
import { daysWord, DIFFICULTY_LABEL, LANG_LABEL, QUESTION_CATEGORY_LABEL, QUESTION_GROUP_LABEL } from './labels'
import { QuestionCategoryFilter, QuestionCategoryPicker } from './question-category'
import { TopicPicker } from './j2-topic-picker'
import { ApplicationCombobox, CompanyCombobox } from './j1-fields'

const LIMITS = limitsOf(questionInputSchema)
/** The draft title (DRAFT_TITLES.question): an untouched new question is discarded on close. */
const NEW_QUESTION = 'Нове питання'

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

/** Spaced-repetition state; a question never practised gets one phrase — the tiles mean something after a review. */
function ReviewStats({ question }: { question: InterviewQuestion }): ReactElement {
  const fresh = question.repetitions === 0 && question.lapses === 0
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
            label="Повторити"
            value={fmtDay(question.dueAt) || '—'}
            hint={`Коли питання знову з’явиться в тренажері: ${fmtDateTime(question.dueAt)}.`}
          />
          <StatCell
            label="Пауза"
            value={question.intervalDays < 1 ? 'менше дня' : daysWord(Math.round(question.intervalDays))}
            hint="Скільки днів між повторами зараз. Відповіли — пауза росте, не змогли — знову коротка."
          />
          <StatCell label="Поспіль без помилок" value={String(question.repetitions)} hint="Скільки разів поспіль ви відповіли без помилки." />
          <StatCell label="Не вдалося" value={String(question.lapses)} hint="Скільки разів відповідь не вдалася і питання повернулося на початок." />
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
 * The question itself: a heading while reading, a multi-line field while editing. Not InlineTitle in edit
 * mode — it folds line breaks into spaces and blocks Enter, and questions (with code, from a JSON import) are
 * up to 5000 characters over several lines. Rendered inside DetailPane, so it reads the pane's mode.
 */
function QuestionText({ value, onChange }: { value: string; onChange: (value: string) => void }): ReactElement {
  const readOnly = useReadOnly()
  const { fresh } = useDetailMode()
  const id = useId()
  if (readOnly) return <InlineTitle value={value} onChange={onChange} placeholder="Питання" maxLength={LIMITS.question} />
  return (
    <Field label="Питання" htmlFor={id} count={{ length: value.length, max: LIMITS.question }}>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // A new question opens with «Нове питання» selected, to be typed over at once.
        onFocus={(e) => fresh && value === NEW_QUESTION && e.currentTarget.select()}
        autoFocus={fresh}
        maxLength={LIMITS.question}
        placeholder="Яке питання поставили?"
        className="font-display text-heading"
      />
    </Field>
  )
}

function QuestionDetail({ question, topics, onClose }: { question: InterviewQuestion; topics: string[]; onClose: () => void }) {
  const update = useApiMutation('jobs', 'updateQuestion')
  const remove = useApiMutation('jobs', 'removeQuestion', { successMessage: 'Питання переміщено в кошик' })
  const initial = useMemo(() => toForm(question), [question])
  const [form, setForm] = useAutosave<Form>(initial, (next) => {
    if (!next.question.trim()) return
    update.mutate({ id: question.id, patch: next as QuestionPatch })
  })
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => setForm({ ...form, [key]: value })
  const entity = { type: 'question' as const, id: question.id }
  const due = question.dueAt <= Date.now()

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(question.id)
        onClose()
      }}
      // Due asks for action (info), it isn't a success (docs/design-system.md → Бейджи).
      headerExtra={<Badge variant={due ? 'info' : 'soft'}>{due ? 'Пора повторити' : `Повтор ${fmtDay(question.dueAt)}`}</Badge>}
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
            <TopicPicker value={form.topic} options={topics} onChange={(v) => set('topic', v)} maxLength={LIMITS.topic} />
          </Field>
        </div>
        {/* Own row: three segments don't fit half of a 38%-wide pane. */}
        <div className="flex flex-wrap gap-x-6 gap-y-4">
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
        </div>
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
export function QuestionsPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useOpenParam()
  const [category, setCategory] = useState<QuestionCategory | undefined>()
  const [group, setGroup] = useState<QuestionGroup | undefined>()
  const [topic, setTopic] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const term = useDebounced(search.trim())
  const base = { search: term || undefined, tagId }
  // Full list feeds the category counters and «Копіювати як JSON»; the column pages from the server.
  const { data: all = [], isLoading } = useApi('jobs', 'questions', base)
  const list = useInfiniteApi('jobs', 'questions', { ...base, group, category, topic })
  const { data: topics = [] } = useApi('jobs', 'topics')
  const { data: due = [] } = useApi('jobs', 'practiceQueue', { limit: 200 })
  const create = useApiMutation('jobs', 'createQuestion')

  // The open question is loaded on its own: an edit that drops it out of the search/tag filter must not close it.
  const { data: current } = useApi('jobs', 'question', open ?? '', { enabled: !!open })

  // What is really narrowing the list, for the «Нічого не знайдено» hint.
  const filters = [
    search.trim() && `за запитом «${search.trim()}»`,
    topic && `у темі «${topic}»`,
    category ? `у категорії «${QUESTION_CATEGORY_LABEL[category]}»` : group && `у групі «${QUESTION_GROUP_LABEL[group]}»`,
    tagId && 'з вибраною міткою'
  ].filter((f): f is string => !!f)
  const resetFilters = (): void => {
    setGroup(undefined)
    setCategory(undefined)
    setTopic(undefined)
    setTagId(undefined)
    setSearch('')
  }

  const add = (): void => {
    create.mutate(
      { question: NEW_QUESTION, category: category ?? (group === 'nontechnical' ? 'behavioral' : 'technical'), topic: topic ?? '' },
      { onSuccess: (q) => setOpen(q.id) }
    )
  }

  return (
    <Page>
      <PageHeader
        title="Питання до співбесіди"
        subtitle="Записуйте питання з реальних співбесід і свої найкращі відповіді — тренажер нагадає повторити."
        actions={
          <>
            {/* The whole filtered bank, not just the pages loaded so far. */}
            <CopyJsonButton
              what="Питання"
              disabled={!all.length}
              getData={() =>
                all
                  .filter((q) => (!group || groupOf(q.category) === group) && (!category || q.category === category) && (!topic || q.topic === topic))
                  .map((q) => ({ question: q.question, answer: q.answer, category: q.category, topic: q.topic, difficulty: q.difficulty, lang: q.lang }))
              }
            />
            <ImportButton kind="question" onImported={(id) => id && setOpen(id)} />
            {/* Never a dead end: with nothing due it starts extra practice right away. */}
            <Button
              variant="soft"
              disabled={!all.length}
              onClick={() => navigate(due.length ? '/jobs/questions/practice' : '/jobs/questions/practice?extra=1')}
            >
              <Dumbbell /> Тренування
              {due.length > 0 && <Badge variant="soft">{due.length}</Badge>}
            </Button>
            {/* Lime = the N key: «N» creates a question here. */}
            <Button variant="lime" onClick={add}>
              <Plus /> Питання
            </Button>
          </>
        }
      >
        <FilterBar
          chips={
            // An empty bank has nothing to filter by: no «Усі» chip over the empty state.
            (all.length > 0 || term || tagId) && (
              <QuestionCategoryFilter
                group={group}
                category={category}
                onChange={(next) => {
                  setGroup(next.group)
                  setCategory(next.category)
                }}
                counts={Object.fromEntries(QUESTION_CATEGORIES.map((c) => [c, all.filter((q) => q.category === c).length]))}
              />
            )
          }
          trailing={
            <>
              <TagFilter value={tagId} onChange={setTagId} />
              <SearchInput value={search} onChange={setSearch} placeholder="Питання або відповідь" className="w-72" />
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
                    title="Банк питань порожній"
                    hint="Додайте питання, яке поставили на співбесіді, і свою відповідь на нього."
                    cta={{ label: 'Додати питання', icon: Plus, onClick: add }}
                  />
                ))
              }
              renderItem={(q) => {
                const isDue = q.dueAt <= Date.now()
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
                  <ListItem active={active} onClick={() => setOpen(active ? null : q.id)}>
                    <div className="flex items-start gap-2">
                      <div className="line-clamp-2 min-w-0 flex-1 text-body font-medium">{q.question}</div>
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
          detail={current && current.id === open ? <QuestionDetail key={current.id} question={current} topics={topics} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
