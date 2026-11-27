import { useId, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Plus } from 'lucide-react'
import { QUESTION_CATEGORIES, questionInputSchema, type InterviewQuestion, type QuestionCategory } from '@shared/domain/jobs'
import { limitsOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { SectionLabel } from '@/components/common/master-detail'
import { Field, Kbd } from '@/components/common/page'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { presenceProps, usePresenceList } from '@/hooks/use-presence-list'
import { Choice } from '@/components/common/choice'
import { QUESTION_CATEGORY_LABEL } from './labels'

const QUESTION_MAX = limitsOf(questionInputSchema).question
const questionKey = (q: InterviewQuestion): string => q.id

/**
 * «Які питання ставили»: questions asked at this vacancy/company, with a quick add (edit mode only)
 * that files them into the shared question bank (with company and vacancy prefilled). Draws its own
 * separator above, so an empty list in view mode leaves nothing behind (no empty sections while reading).
 * `more` — the company's questions page from the server, 30 at a time.
 */
export function AskedQuestions({
  questions,
  applicationId,
  companyId,
  title = 'Які питання ставили',
  more
}: {
  questions: InterviewQuestion[]
  applicationId?: string
  companyId: string | null
  title?: string
  more?: { hasMore: boolean; loadingMore: boolean; loadMore: () => void }
}): ReactElement | null {
  const navigate = useNavigate()
  const readOnly = useReadOnly()
  const fieldId = useId()
  const categoryId = useId()
  const [text, setText] = useState('')
  const [category, setCategory] = useState<QuestionCategory>('technical')
  const create = useApiMutation('jobs', 'createQuestion', {
    successMessage: 'Питання збережено — допишіть відповідь',
    onSuccess: () => setText('')
  })
  // `questions` is query data (stable between renders), as usePresenceList needs.
  const rows = usePresenceList(questions, questionKey)
  const submit = (): void => {
    if (!text.trim() || create.isPending) return
    create.mutate({ question: text.trim(), category, applicationId: applicationId ?? null, companyId })
  }
  if (readOnly && questions.length === 0) return null
  return (
    <>
    <Separator className="my-6" />
    <section className="flex flex-col gap-3">
      <SectionLabel
        action={
          // → is an in-app move.
          <Button variant="outline" size="xs" onClick={() => navigate('/jobs/questions')}>
            Усі питання <ArrowRight />
          </Button>
        }
      >
        {title}
      </SectionLabel>
      {questions.length > 0 && (
        // A new question and the next page («Показати ще») unfold in place; the 4px between rows is inside each
        // row (pb-1), so nothing jumps while a row unfolds.
        <ItemGroup className="-mb-1">
          {rows.map(({ key, item: q, ...state }) => (
            <div key={key} {...presenceProps({ key, item: q, ...state })}>
              <div className="pb-1">
                <Item asChild size="xs" variant="muted" className="cursor-pointer">
                  <button type="button" className="w-full text-left" onClick={() => navigate(`/jobs/questions?open=${q.id}`)}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="line-clamp-2 w-full font-normal">{q.question}</ItemTitle>
                      <ItemDescription className="text-meta">
                        {q.answer.trim() ? 'є відповідь' : 'відповідь ще не записана'}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Badge variant="soft">{QUESTION_CATEGORY_LABEL[q.category]}</Badge>
                    </ItemActions>
                  </button>
                </Item>
              </div>
            </div>
          ))}
        </ItemGroup>
      )}
      {more?.hasMore && (
        <Button variant="soft" size="xs" className="self-start" disabled={more.loadingMore} onClick={more.loadMore}>
          Показати ще
        </Button>
      )}
      <div data-edit-only className="flex flex-col gap-2">
        <Field
          label="Нове питання"
          htmlFor={fieldId}
          hint={
            <>
              <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> — додати питання
            </>
          }
        >
        <Textarea
          id={fieldId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={QUESTION_MAX}
          placeholder="Питання, яке поставили…"
          className="min-h-12"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              submit()
            }
          }}
        />
        </Field>
        <div className="flex items-center gap-2">
          <Label htmlFor={categoryId} className="sr-only">
            Категорія питання
          </Label>
          <Choice
            id={categoryId}
            size="sm"
            value={category}
            onChange={(v) => v && setCategory(v)}
            options={QUESTION_CATEGORIES.map((c) => ({ value: c, label: QUESTION_CATEGORY_LABEL[c] }))}
            className="w-44"
          />
          <div className="flex-1" />
          <Button size="sm" variant="soft" disabled={!text.trim() || create.isPending} onClick={submit}>
            <Plus /> Додати питання
          </Button>
        </div>
      </div>
    </section>
    </>
  )
}
