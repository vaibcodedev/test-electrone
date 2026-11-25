import { useMemo, useState, type ReactElement } from 'react'
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
import { EmptyState, Field, FilterChips, Page, PageBody, PageHeader, SearchInput, Segmented } from '@/components/common/page'
import { DetailPane, EntityAside, InlineTitle, ListItem, MasterDetail, SectionLabel, useOpenParam } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { TagFilter } from '@/components/common/tags'
import { VirtualList } from '@/components/common/virtual-list'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'
import { StatCell } from '@/components/common/stat-tile'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { daysWord, DIFFICULTY_LABEL, LANG_LABEL, QUESTION_CATEGORY_LABEL } from './labels'
import { QuestionCategoryFilter, QuestionCategoryPicker } from './question-category'
import { TopicPicker } from './j2-topic-picker'
import { ApplicationCombobox, CompanyCombobox } from './j1-fields'

const LIMITS = limitsOf(questionInputSchema)

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

/** Spaced-repetition state; a question never practised shows its first date, not default numbers. */
function ReviewStats({ question }: { question: InterviewQuestion }): ReactElement {
  const fresh = question.repetitions === 0 && question.lapses === 0
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Повторення</SectionLabel>
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
        {!fresh && (
          <>
            <StatCell label="Поспіль без помилок" value={String(question.repetitions)} hint="Скільки разів поспіль ви відповіли без помилки." />
            <StatCell label="Не вдалося" value={String(question.lapses)} hint="Скільки разів відповідь не вдалася і питання повернулося на початок." />
            <div className="col-span-2 grid">
              <StatCell
                label="Дається"
                value={easeLabel(question.ease)}
                hint="Наскільки легко дається питання за вашими оцінками. Чим важче, тим частіше воно трапляється."
              />
            </div>
          </>
        )}
      </div>
      {fresh && (
        <p className="text-caption text-muted-foreground">Ще не тренували — питання з’явиться в тренажері {fmtDay(question.dueAt)}.</p>
      )}
    </section>
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
      headerExtra={<Badge variant={due ? 'success' : 'soft'}>{due ? 'Пора повторити' : `Повтор ${fmtDay(question.dueAt)}`}</Badge>}
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
        <InlineTitle value={form.question} onChange={(v) => set('question', v)} placeholder="Питання" maxLength={LIMITS.question} />
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

  const add = (): void => {
    create.mutate(
      { question: 'Нове питання', category: category ?? (group === 'nontechnical' ? 'behavioral' : 'technical'), topic: topic ?? '' },
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
        <div className="flex flex-wrap items-center gap-2">
          <QuestionCategoryFilter
            group={group}
            category={category}
            onChange={(next) => {
              setGroup(next.group)
              setCategory(next.category)
            }}
            counts={Object.fromEntries(QUESTION_CATEGORIES.map((c) => [c, all.filter((q) => q.category === c).length]))}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Питання або відповідь" className="w-64" />
          </div>
        </div>
        {topics.length > 0 && (
          <FilterChips
            size="xs"
            allLabel="Усі теми"
            value={topic}
            onChange={setTopic}
            options={topics.map((t) => ({ value: t, label: t }))}
          />
        )}
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
                !isLoading && (
                  <EmptyState
                    icon={MessageCircleQuestion}
                    title={all.length ? 'Нічого не знайдено' : 'Банк питань порожній'}
                    hint="Додайте питання, яке поставили на співбесіді, і свою відповідь на нього."
                    action={
                      <Button variant="subtle" onClick={add}>
                        Додати питання
                      </Button>
                    }
                  />
                )
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
                            <Badge variant={active ? 'ink' : 'success'} className={cn(active && 'bg-ink-foreground/12')}>
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
