import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Plus } from 'lucide-react'
import { QUESTION_CATEGORIES, questionInputSchema, type InterviewQuestion, type QuestionCategory } from '@shared/domain/jobs'
import { limitsOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { SectionLabel } from '@/components/common/master-detail'
import { Field, Kbd } from '@/components/common/page'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { Choice } from '../crm/parts'
import { QUESTION_CATEGORY_LABEL } from './labels'

const QUESTION_MAX = limitsOf(questionInputSchema).question

/**
 * «Які питання ставили»: questions asked at this vacancy/company, with a quick add (edit mode only)
 * that files them into the shared question bank (with company and vacancy prefilled).
 */
export function AskedQuestions({
  questions,
  applicationId,
  companyId,
  title = 'Які питання ставили'
}: {
  questions: InterviewQuestion[]
  applicationId?: string
  companyId: string | null
  title?: string
}) {
  const navigate = useNavigate()
  const readOnly = useReadOnly()
  const fieldId = useId()
  const [text, setText] = useState('')
  const [category, setCategory] = useState<QuestionCategory>('technical')
  const create = useApiMutation('jobs', 'createQuestion', {
    successMessage: 'Питання в банку — допишіть відповідь',
    onSuccess: () => setText('')
  })
  const submit = (): void => {
    if (!text.trim() || create.isPending) return
    create.mutate({ question: text.trim(), category, applicationId: applicationId ?? null, companyId })
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel
        action={
          // soft: the section sits on card (sheet, pane), where subtle has no fill; → is an in-app move.
          <Button variant="soft" size="xs" onClick={() => navigate('/jobs/questions')}>
            Банк питань <ArrowRight />
          </Button>
        }
      >
        {title}
      </SectionLabel>
      {questions.length === 0 && readOnly && (
        <p className="text-body leading-relaxed text-muted-foreground">Питань ще не записали — додайте їх у режимі правки (E).</p>
      )}
      {questions.length > 0 && (
        <ItemGroup className="gap-1">
          {questions.map((q) => (
            <Item key={q.id} asChild size="xs" variant="muted" className="cursor-pointer">
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
          ))}
        </ItemGroup>
      )}
      <div data-edit-only className="flex flex-col gap-2">
        <Field
          label="Нове питання"
          htmlFor={fieldId}
          hint={
            <>
              <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> — додати в банк
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
          <Choice
            size="sm"
            value={category}
            onChange={(v) => v && setCategory(v)}
            options={QUESTION_CATEGORIES.map((c) => ({ value: c, label: QUESTION_CATEGORY_LABEL[c] }))}
            className="w-44"
          />
          <div className="flex-1" />
          <Button size="sm" variant="soft" disabled={!text.trim() || create.isPending} onClick={submit}>
            <Plus /> У банк питань
          </Button>
        </div>
      </div>
    </section>
  )
}
