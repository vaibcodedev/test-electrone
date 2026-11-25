import type { ReactElement } from 'react'
import { FlaskConical, LogOut, Sparkles } from 'lucide-react'
import { fmtBytes } from '@/lib/format'
import { isSandbox } from '@/lib/profile'
import { switchConfirmText, useSandbox } from '@/hooks/use-sandbox'
import { Confirm } from '@/components/common/confirm'
import { CardEmptyText } from '@/components/common/list-card'
import { RowSkeleton } from '@/components/common/page-skeleton'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { SettingsRow, SettingsSection } from './section'

const DEV_ENTER =
  'У режимі розробки перезапуск не працює: закрийте Vault і запустіть npm run dev -- -- --vault-sandbox'
const DEV_EXIT = 'У режимі розробки перезапуск не працює: закрийте Vault і запустіть npm run dev'

/**
 * Налаштування → «Тестовий режим» (#sandbox). The card renders at once, so /settings#sandbox scrolls to it while
 * the state loads. Logic lives in useSandbox; this is markup only. No lime: settings have no main action.
 */
export function SandboxSection(): ReactElement {
  const s = useSandbox()
  const info = s.info.data
  const confirm = switchConfirmText(info)

  let body: ReactElement
  if (!info && s.info.isError) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <CardEmptyText>Не вдалося завантажити.</CardEmptyText>
        <Button variant="subtle" size="sm" onClick={() => void s.info.refetch()}>
          Повторити
        </Button>
      </div>
    )
  } else if (!info) {
    body = (
      <div className="flex flex-col gap-2" aria-busy>
        <RowSkeleton height={56} />
        <RowSkeleton height={56} />
      </div>
    )
  } else if (info.profile === 'main') {
    body = (
      <>
        <SettingsRow
          label="Перейти в тестовий режим"
          hint={
            info.canSwitch
              ? 'Vault перезапуститься з окремими даними. Повернутися — кнопкою «Вийти з тестового режиму».'
              : DEV_ENTER
          }
        >
          {info.canSwitch ? (
            <Confirm
              tone="default"
              title={confirm.title}
              description={confirm.description}
              confirmLabel="Перезапустити"
              onConfirm={s.switchProfile}
            >
              <Button variant="subtle" size="sm" disabled={s.switching}>
                <FlaskConical /> Перейти в тестовий режим
              </Button>
            </Confirm>
          ) : (
            <Button variant="subtle" size="sm" disabled>
              <FlaskConical /> Перейти в тестовий режим
            </Button>
          )}
        </SettingsRow>
        <SettingsRow
          label="Тестові дані"
          hint={
            info.exists
              ? `${info.dir} · ${info.sizeBytes === null ? 'рахуємо розмір…' : fmtBytes(info.sizeBytes)}`
              : 'Ще не створено'
          }
        >
          <Confirm
            title="Очистити тестові дані?"
            description="Тестова база, файли й бекапи видаляться. Відновити не можна. Ваші основні дані не зміняться."
            confirmLabel="Очистити"
            onConfirm={s.clearSandbox}
          >
            <Button variant="outline" size="sm" disabled={!info.exists || s.clearing}>
              Очистити тестові дані
            </Button>
          </Confirm>
        </SettingsRow>
      </>
    )
  } else {
    body = (
      <>
        <SettingsRow
          label="Вийти з тестового режиму"
          hint={
            info.canSwitch
              ? 'Vault перезапуститься з вашими даними. Тестові збережуться до наступного разу.'
              : DEV_EXIT
          }
        >
          {info.canSwitch ? (
            <Confirm
              tone="default"
              title={confirm.title}
              description={confirm.description}
              confirmLabel="Перезапустити"
              onConfirm={s.switchProfile}
            >
              <Button variant="subtle" size="sm" disabled={s.switching}>
                <LogOut /> Вийти з тестового режиму
              </Button>
            </Confirm>
          ) : (
            <Button variant="subtle" size="sm" disabled>
              <LogOut /> Вийти з тестового режиму
            </Button>
          )}
        </SettingsRow>
        <SettingsRow
          label="Заповнити демо-даними"
          hint={
            info.demoFilled
              ? 'Демо-дані вже додано'
              : 'Приклади в усіх розділах: ідеї з дошкою, сніпети, бібліотеки, клієнт із проєктом, відгуки, вакансії, слова, події.'
          }
        >
          <Button
            variant="outline"
            size="sm"
            disabled={info.demoFilled || s.filling}
            onClick={s.fillDemo}
          >
            {s.filling ? <Spinner /> : <Sparkles />} Заповнити
          </Button>
        </SettingsRow>
        <SettingsRow
          label="Очистити тестові дані"
          hint={info.canSwitch ? 'Почати з порожньої бази. Vault перезапуститься.' : DEV_ENTER}
        >
          <Confirm
            title="Очистити тестові дані?"
            description="Тестова база, файли й бекапи видаляться, Vault перезапуститься з новою тестовою базою. Відновити не можна. Ваші основні дані не зміняться."
            confirmLabel="Очистити й перезапустити"
            onConfirm={s.resetSandbox}
          >
            <Button variant="outline" size="sm" disabled={!info.canSwitch || s.clearing}>
              Очистити тестові дані
            </Button>
          </Confirm>
        </SettingsRow>
        {info.mainBackupsDir && (
          <p className="text-caption text-muted-foreground wrap-anywhere">
            Перевірити на копії своїх даних: Бекап → «Відновити з файлу» і виберіть бекап у папці{' '}
            {info.mainBackupsDir}. Паролі з «Доступів» тут не розшифруються — їхній ключ прив’язаний до
            основного Vault.
          </p>
        )}
      </>
    )
  }

  return (
    <SettingsSection
      id="sandbox"
      title="Тестовий режим"
      hint={
        isSandbox
          ? 'Зараз відкрито тестові дані. Ваша основна база закрита й не змінюється.'
          : 'Окремий Vault для експериментів: своя база, файли, бекапи й налаштування. Поки він відкритий, ваші дані закриті й не змінюються.'
      }
    >
      {body}
    </SettingsSection>
  )
}
