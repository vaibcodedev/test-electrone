import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Dumbbell, MessageCircleQuestion, Plus } from 'lucide-react'
import { QUESTION_CATEGORIES, questionInputSchema, type InterviewQuestion, type QuestionCategory, type QuestionPatch, type QuestionGroup } from '@shared/domain/jobs'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDateTime, fmtDay, easeLabel } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput, Segmented } from '@/components/common/page'
import { DetailPane, EntityAside, ListItem, MasterDetail, SectionLabel, useOpenParam } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { TagFilter } from '@/components/common/tags'
import { VirtualList } from '@/components/common/virtual-list'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DIFFICULTY_LABEL, LANG_LABEL, QUESTION_CATEGORY_LABEL } from './j2-labels'
import { QuestionCategoryFilter, QuestionCategoryPicker } from './question-category'
import { TopicPicker } from './j2-topic-picker'
import { CopyJsonButton, ImportButton } from '@/components/common/import-dialog'
import { StatCell } from '@/components/common/stat-tile'

const NONE = '__none__'
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

function QuestionDetail({ question, topics, onClose }: { question: InterviewQuestion; topics: string[]; onClose: () => void }) {
  const update = useApiMutation('jobs', 'updateQuestion')
  const remove = useApiMutation('jobs', 'removeQuestion', { successMessage: 'Питання переміщено в кошик' })
  const { data: companies = [] } = useApi('jobs', 'companies')
  const { data: applications = [] } = useApi('jobs', 'list')
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
      headerExtra={<Badge variant={due ? 'lime' : 'soft'}>{due ? 'час повторити' : `повтор ${fmtDay(question.dueAt)}`}</Badge>}
      aside={
        <EntityAside
          entity={entity}
          tags={question.tags}
          onTagsChange={(tagIds) => update.mutate({ id: question.id, patch: { tagIds } })}
          createdAt={question.createdAt}
          updatedAt={question.updatedAt}
          files={false}
        >
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
                value={question.intervalDays < 1 ? 'менше дня' : `${Math.round(question.intervalDays)} дн.`}
                hint="Скільки днів між повторами зараз. Відповіли — пауза росте, не змогли — знову коротка."
              />
              <StatCell label="Відповів поспіль" value={String(question.repetitions)} hint="Скільки разів поспіль ви відповіли без помилки." />
              <StatCell label="Не зміг" value={String(question.lapses)} hint="Скільки разів відповідь не вдалася і питання повернулося на початок." />
              <StatCell
                label="Дається"
                value={easeLabel(question.ease)}
                hint="Наскільки легко дається питання за вашими оцінками. Чим важче, тим частіше воно трапляється."
              />
            </div>
          </section>
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        <Textarea
          value={form.question}
          onChange={(e) => set('question', e.target.value)}
          placeholder="Питання"
          aria-label="Питання"
          maxLength={LIMITS.question}
          className="font-display min-h-0 rounded-none border-0 bg-transparent p-0 text-headline leading-tight shadow-none focus-visible:bg-transparent focus-visible:ring-0"
        />
        <div className="grid grid-cols-2 gap-4">
          <Field className="gap-2">
            <FieldLabel>Категорія</FieldLabel>
            <QuestionCategoryPicker value={form.category} onChange={(c) => set('category', c)} />
          </Field>
          <Field className="gap-2">
            <FieldLabel>Тема</FieldLabel>
            <TopicPicker value={form.topic} options={topics} onChange={(v) => set('topic', v)} />
          </Field>
          <Field className="gap-2">
            <FieldLabel>Мова відповіді</FieldLabel>
            <Segmented
              className="w-fit!"
              value={form.lang}
              onChange={(v) => set('lang', v)}
              options={(['ru', 'uk', 'en'] as const).map((l) => ({ value: l, label: LANG_LABEL[l] }))}
            />
          </Field>
          <Field className="gap-2">
            <FieldLabel>Складність</FieldLabel>
            <Segmented
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
          <Field className="gap-2">
            <FieldLabel>Питали в компанії</FieldLabel>
            <Select value={form.companyId ?? NONE} onValueChange={(v) => set('companyId', v === NONE ? null : v)}>
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Не вказано</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="gap-2">
            <FieldLabel>На співбесіді за вакансією</FieldLabel>
            <Select value={form.applicationId ?? NONE} onValueChange={(v) => set('applicationId', v === NONE ? null : v)}>
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Не вказано</SelectItem>
                {applications.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                    {a.company ? ` — ${a.company}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
  // Full list only feeds the category counters and the open question; the column pages from the server.
  const { data: all = [], isLoading } = useApi('jobs', 'questions', base)
  const list = useInfiniteApi('jobs', 'questions', { ...base, group, category, topic })
  const { data: topics = [] } = useApi('jobs', 'topics')
  const { data: due = [] } = useApi('jobs', 'practiceQueue', { limit: 200 })
  const create = useApiMutation('jobs', 'createQuestion')

  const current = all.find((q) => q.id === open) ?? null

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
            <CopyJsonButton
              what="Питання"
              disabled={!list.items.length}
              getData={() =>
                list.items.map((q) => ({ question: q.question, answer: q.answer, category: q.category, topic: q.topic, difficulty: q.difficulty, lang: q.lang }))
              }
            />
            <ImportButton kind="question" onImported={(id) => id && setOpen(id)} />
            <Button variant="soft" onClick={add}>
              <Plus /> Питання
            </Button>
            {/* Never a dead end: with nothing due it starts extra practice right away. */}
            <Button
              variant="lime"
              disabled={!all.length}
              onClick={() => navigate(due.length ? '/jobs/questions/practice' : '/jobs/questions/practice?extra=1')}
            >
              <Dumbbell /> Тренування{due.length ? ` (${due.length})` : ''}
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
                    action={<Button onClick={add}>Додати питання</Button>}
                  />
                )
              }
              renderItem={(q) => {
                const isDue = q.dueAt <= Date.now()
                const active = q.id === open
                return (
                  <ListItem active={active} onClick={() => setOpen(active ? null : q.id)}>
                    <div className="line-clamp-2 text-body font-medium">{q.question}</div>
                    <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-meta ${active ? 'text-ink-muted' : 'text-muted-foreground'}`}>
                      <span>{QUESTION_CATEGORY_LABEL[q.category]}</span>
                      {q.topic && <span>· {q.topic}</span>}
                      <span>· {LANG_LABEL[q.lang]}</span>
                      {!q.answer.trim() && <span className={active ? 'text-ink-accent' : 'text-warn'}>· без відповіді</span>}
                      {isDue && <span className={active ? 'text-ink-accent' : 'text-success'}>· повторити</span>}
                    </div>
                  </ListItem>
                )
              }}
            />
          }
          detail={current ? <QuestionDetail key={current.id} question={current} topics={topics} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
