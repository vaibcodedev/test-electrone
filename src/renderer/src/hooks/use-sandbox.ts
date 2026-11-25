import type { UseQueryResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { SandboxInfo } from '@shared/domain/sandbox'
import { flushAndSettle, useApi, useApiMutation } from '@/lib/query'
import { plural } from '@/lib/format'

const RECORD_FORMS: [string, string, string] = ['запис', 'записи', 'записів']

/** Texts of the «Перейти» / «Вийти» confirms: one source for the settings section and the sidebar plate. */
export function switchConfirmText(info: SandboxInfo | undefined): {
  title: string
  description: string
} {
  const scripts =
    info && info.runningScripts > 0 ? ' Запущені скрипти в «Розробці» буде зупинено.' : ''
  if (info?.profile === 'sandbox') {
    return {
      title: 'Вийти з тестового режиму?',
      description: `Vault перезапуститься з вашими основними даними. Тестові лишаться тут — до них можна повернутися.${scripts}`
    }
  }
  return {
    title: 'Перейти в тестовий режим?',
    description: `${
      info?.exists
        ? 'Vault перезапуститься з тестовими даними, які ви створили раніше. Ваші дані не зміняться.'
        : 'Vault перезапуститься з новою тестовою базою. Усе, що ви там створите, у ваші дані не потрапить.'
    }${scripts}`
  }
}

/**
 * «Тестовий режим»: state from main and the actions. Every relaunch first saves the pending autosaves
 * (flushAndSettle): a failed save stops it, so no edit is lost on the way.
 */
export interface SandboxState {
  info: UseQueryResult<SandboxInfo>
  /** Main → sandbox or sandbox → main, by the current profile. */
  switchProfile: () => void
  /** Sandbox only: relaunch with a fresh test database. */
  resetSandbox: () => void
  /** Main only: delete the test folder now (nothing to save first: it is not open). */
  clearSandbox: () => void
  fillDemo: () => void
  filling: boolean
  clearing: boolean
  switching: boolean
}

export function useSandbox(): SandboxState {
  const info = useApi('sandbox', 'info')
  const enter = useApiMutation('sandbox', 'enter')
  const exit = useApiMutation('sandbox', 'exit')
  const clear = useApiMutation('sandbox', 'clear')
  const fillDemo = useApiMutation('sandbox', 'fillDemo', {
    onSuccess: ({ created }) =>
      toast.success(`Демо-дані додано: ${created} ${plural(created, RECORD_FORMS)}`)
  })

  const relaunch = async (action: 'switch' | 'reset'): Promise<void> => {
    const { failed } = await flushAndSettle()
    if (failed > 0) {
      toast.error('Не всі зміни збережено — перевірте відкриті записи й спробуйте ще раз')
      return
    }
    if (action === 'reset') clear.mutate(undefined)
    else if (info.data?.profile === 'sandbox') exit.mutate(undefined)
    else enter.mutate(undefined)
  }

  return {
    info,
    switchProfile: () => void relaunch('switch'),
    resetSandbox: () => void relaunch('reset'),
    clearSandbox: () =>
      clear.mutate(undefined, { onSuccess: () => toast.success('Тестові дані очищено') }),
    fillDemo: () => fillDemo.mutate(undefined),
    filling: fillDemo.isPending,
    clearing: clear.isPending,
    switching: enter.isPending || exit.isPending
  }
}
