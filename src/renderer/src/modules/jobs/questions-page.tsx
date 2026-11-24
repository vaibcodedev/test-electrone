import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Dumbbell, MessageCircleQuestion, Plus } from 'lucide-react'
import {
  QUESTION_CATEGORIES,
  type InterviewQuestion,
  type QuestionCategory,
  type QuestionPatch
} from '@shared/domain/jobs'
import { useApi, useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDay } from '@/lib/format'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput, Segmented } from '@/components/common/page'
import { DetailPane, EntityAside, ListItem, MasterDetail, SectionLabel, useOpenParam } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { TagFilter } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DIFFICULTY_LABEL, LANG_LABEL, QUESTION_CATEGORY_LABEL } from './j2-labels'
import { TopicPicker } from './j2-topic-picker'

const NONE = '__none__'

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-0.5 rounded-2xl px-3 py-2.5">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="text-[14px] font-medium tabular-nums">{value}</div>
    </Card>
  )
}

function QuestionDetail({ question, topics, onClose }: { question: InterviewQuestion; topics: string[]; onClose: () => void }) {
  const update = useApiMutation('jobs', 'updateQuestion')
  const remove = useApiMutation('jobs', 'removeQuestion', { successMessage: 'Вопрос в корзине' })
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
      headerExtra={<Badge variant={due ? 'lime' : 'soft'}>{due ? 'пора повторить' : `повтор ${fmtDay(question.dueAt)}`}</Badge>}
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
            <SectionLabel>Повторение</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Повторений" value={String(question.repetitions)} />
              <Stat label="Забывал" value={String(question.lapses)} />
              <Stat label="Интервал" value={`${Math.round(question.intervalDays)} дн.`} />
              <Stat label="Лёгкость" value={question.ease.toFixed(2)} />
            </div>
          </section>
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        <Textarea
          value={form.question}
          onChange={(e) => set('question', e.target.value)}
          placeholder="Вопрос"
          aria-label="Вопрос"
          className="font-display min-h-0 rounded-none border-0 bg-transparent p-0 text-[24px] leading-tight shadow-none focus-visible:bg-transparent focus-visible:ring-0"
        />
        <div className="grid grid-cols-2 gap-4">
          <Field className="gap-2">
            <FieldLabel>Категория</FieldLabel>
            <Select value={form.category} onValueChange={(v) => set('category', v as QuestionCategory)}>
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {QUESTION_CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="gap-2">
            <FieldLabel>Тема</FieldLabel>
            <TopicPicker value={form.topic} options={topics} onChange={(v) => set('topic', v)} />
          </Field>
          <Field className="gap-2">
            <FieldLabel>Язык ответа</FieldLabel>
            <Segmented
              value={form.lang}
              onChange={(v) => set('lang', v)}
              options={(['ru', 'uk', 'en'] as const).map((l) => ({ value: l, label: LANG_LABEL[l] }))}
            />
          </Field>
          <Field className="gap-2">
            <FieldLabel>Сложность</FieldLabel>
            <Segmented
              value={String(form.difficulty) as '1' | '2' | '3'}
              onChange={(v) => set('difficulty', Number(v))}
              options={(['1', '2', '3'] as const).map((d) => ({ value: d, label: DIFFICULTY_LABEL[Number(d)] }))}
            />
          </Field>
        </div>
        <MarkdownField
          label="Мой лучший ответ"
          value={form.answer}
          onChange={(v) => set('answer', v)}
          placeholder="Структура: суть → пример из опыта → результат. Можно на английском."
        />
        <div className="grid grid-cols-2 gap-4">
          <Field className="gap-2">
            <FieldLabel>Спрашивали в компании</FieldLabel>
            <Select value={form.companyId ?? NONE} onValueChange={(v) => set('companyId', v === NONE ? null : v)}>
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Не указано</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="gap-2">
            <FieldLabel>На собеседовании по вакансии</FieldLabel>
            <Select value={form.applicationId ?? NONE} onValueChange={(v) => set('applicationId', v === NONE ? null : v)}>
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Не указано</SelectItem>
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
  const [topic, setTopic] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const { data: all = [] } = useApi('jobs', 'questions', { search: search.trim() || undefined, tagId })
  const { data: topics = [] } = useApi('jobs', 'topics')
  const { data: due = [] } = useApi('jobs', 'practiceQueue', { limit: 200 })
  const create = useApiMutation('jobs', 'createQuestion')

  const list = all.filter((q) => (!category || q.category === category) && (!topic || q.topic === topic))
  const current = all.find((q) => q.id === open) ?? null

  const add = (): void => {
    create.mutate(
      { question: 'Новый вопрос', category: category ?? 'technical', topic: topic ?? '' },
      { onSuccess: (q) => setOpen(q.id) }
    )
  }

  return (
    <Page>
      <PageHeader
        title="Вопросы к собеседованию"
        subtitle="Записывай вопросы с реальных собеседований и свои лучшие ответы — тренажёр напомнит повторить."
        actions={
          <>
            <Button variant="soft" onClick={add}>
              <Plus /> Вопрос
            </Button>
            <Button variant="lime" disabled={!due.length} onClick={() => navigate('/jobs/questions/practice')}>
              <Dumbbell /> Тренировка{due.length ? ` (${due.length})` : ''}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Все"
            value={category}
            onChange={setCategory}
            options={QUESTION_CATEGORIES.map((c) => ({
              value: c,
              label: QUESTION_CATEGORY_LABEL[c],
              count: all.filter((q) => q.category === c).length
            }))}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Вопрос или ответ" className="w-64" />
          </div>
        </div>
        {topics.length > 0 && (
          <FilterChips
            size="xs"
            allLabel="Все темы"
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
            list.length === 0 ? (
              <EmptyState
                icon={MessageCircleQuestion}
                title={all.length ? 'Ничего не найдено' : 'Банк вопросов пуст'}
                hint="Добавь вопрос, который задали на собеседовании, и свой ответ на него."
                action={<Button onClick={add}>Добавить вопрос</Button>}
              />
            ) : (
              <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-1">
                {list.map((q) => {
                  const isDue = q.dueAt <= Date.now()
                  const active = q.id === open
                  return (
                    <ListItem key={q.id} active={active} onClick={() => setOpen(active ? null : q.id)}>
                      <div className="line-clamp-2 text-[13.5px] font-medium">{q.question}</div>
                      <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] ${active ? 'text-ink-muted' : 'text-muted-foreground'}`}>
                        <span>{QUESTION_CATEGORY_LABEL[q.category]}</span>
                        {q.topic && <span>· {q.topic}</span>}
                        <span>· {LANG_LABEL[q.lang]}</span>
                        {!q.answer.trim() && <span className={active ? 'text-ink-accent' : 'text-warn'}>· без ответа</span>}
                        {isDue && <span className={active ? 'text-ink-accent' : 'text-success'}>· повторить</span>}
                      </div>
                    </ListItem>
                  )
                })}
              </div>
            )
          }
          detail={current ? <QuestionDetail key={current.id} question={current} topics={topics} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
