import { create } from 'zustand'
import type { Application, ApplicationStatus, StageKind } from '@shared/domain/jobs'
import { AddStageDialog } from './stage-section'

type Scheduling = Pick<Application, 'id' | 'title' | 'company' | 'nextStage' | 'stageCount'>

/**
 * Status «Співбесіда» / «Тестове» without a matching planned stage means there's nothing in the calendar.
 * Interview needs a dated non-test stage; test needs a test-task stage.
 */
export function needsSchedule(a: Pick<Application, 'nextStage'>, status: ApplicationStatus): boolean {
  const next = a.nextStage
  if (status === 'interview') return !next || next.kind === 'test_task' || next.at === null
  if (status === 'test') return !next || next.kind !== 'test_task'
  return false
}

interface ScheduleRequest {
  applicationId: string
  kind: StageKind
  title: string
  context: string
}

const useScheduleStore = create<{ request: ScheduleRequest | null; close: () => void }>((set) => ({
  request: null,
  close: () => set({ request: null })
}))

/** Opens «Запланувати співбесіду / тестове» for a vacancy (rendered by <ScheduleStageHost/>). */
export function askToSchedule(a: Scheduling, status: ApplicationStatus): void {
  const test = status === 'test'
  // A vacancy that already had a stage most likely goes to the technical round next.
  const kind: StageKind = test ? 'test_task' : a.stageCount > 0 ? 'technical' : 'screening'
  useScheduleStore.setState({
    request: {
      applicationId: a.id,
      kind,
      title: test ? 'Тестове завдання' : 'Запланувати співбесіду',
      context: [a.title, a.company].filter(Boolean).join(' · ')
    }
  })
}

/** Call after a status change (board drag, editor select…): prompts only when the calendar has nothing. */
export function promptAfterStatusChange(a: Scheduling, status: ApplicationStatus): void {
  if (needsSchedule(a, status)) askToSchedule(a, status)
}

/** Mount once per page that can change vacancy statuses. */
export function ScheduleStageHost() {
  const request = useScheduleStore((s) => s.request)
  const close = useScheduleStore((s) => s.close)
  return (
    <AddStageDialog
      applicationId={request?.applicationId ?? ''}
      open={!!request}
      onOpenChange={(o) => !o && close()}
      defaultKind={request?.kind ?? 'screening'}
      title={request?.title}
      context={request?.context}
      cancelLabel="Пізніше"
    />
  )
}
