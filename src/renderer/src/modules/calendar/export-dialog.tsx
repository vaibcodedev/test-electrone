import { useId, useState } from 'react'
import { toast } from 'sonner'
import { ICS_SOURCES, type IcsSource } from '@shared/domain/calendar'
import { useApiMutation } from '@/lib/query'
import { plural } from '@/lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@/components/ui/field'
import { SubmitButton } from '@/components/common/submit-button'
import { freshOnOpen } from '@/components/common/fresh-on-open'

const SOURCES: Record<IcsSource, { label: string; hint: string }> = {
  event: { label: 'Мої події', hint: 'Усі, з повторенням і нагадуваннями' },
  card: { label: 'Дедлайни карток', hint: 'Картки дошок, які ще не в «Готово»' },
  money: { label: 'Оплати й підписки', hint: 'Очікувані оплати проєктів і списання підписок' },
  project: { label: 'Дедлайни проєктів', hint: 'Незавершені проєкти клієнтів' },
  jobs: { label: 'Співбесіди й «Нагадати про себе»', hint: 'Етапи вакансій і дати нагадувань' },
  credential: {
    label: 'Терміни доступів',
    hint: 'Коли спливає API-ключ і коли продовжити домен — без паролів'
  }
}

function ExportIcsDialogForm({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [picked, setPicked] = useState<IcsSource[]>([...ICS_SOURCES])
  const exportIcs = useApiMutation('events', 'exportIcs', {
    onSuccess: (res) => {
      // null — the save dialog was cancelled: the export dialog stays for another try.
      if (!res) return
      toast.success(
        `Календар збережено: ${res.count} ${plural(res.count, ['подія', 'події', 'подій'])}`,
        { description: res.path }
      )
      onOpenChange(false)
    }
  })
  const id = useId()
  const toggle = (s: IcsSource, on: boolean): void =>
    setPicked((p) =>
      on ? ICS_SOURCES.filter((x) => x === s || p.includes(x)) : p.filter((x) => x !== s)
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl p-6 sm:max-w-120">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">Експорт календаря</DialogTitle>
          <DialogDescription>
            Файл .ics відкриває будь-який календар: Google, Apple, Outlook. Це знімок на цю мить —
            нові зміни у Vault самі туди не потраплять, для оновлення експортуйте ще раз.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!picked.length || exportIcs.isPending) return
            exportIcs.mutate({ sources: picked })
          }}
        >
          <FieldSet>
            <FieldLegend variant="label" className="mb-1">
              Що додати
            </FieldLegend>
            <FieldGroup data-slot="checkbox-group" className="gap-3">
              {ICS_SOURCES.map((s) => (
                <Field key={s} orientation="horizontal">
                  <Checkbox
                    id={`${id}-${s}`}
                    checked={picked.includes(s)}
                    onCheckedChange={(on) => toggle(s, on === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={`${id}-${s}`} className="font-normal">
                      {SOURCES[s].label}
                    </FieldLabel>
                    <FieldDescription>{SOURCES[s].hint}</FieldDescription>
                  </FieldContent>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
          <p className="text-caption text-muted-foreground">
            Дати з інших розділів — від місяця тому до року вперед, без уже виконаних.
          </p>
          <DialogFooter className="gap-2">
            <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <SubmitButton
              variant="lime"
              reason={picked.length ? undefined : 'Виберіть, що додати у файл'}
              pending={exportIcs.isPending}
            >
              Зберегти файл
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** «Експорт у .ics» on the Calendar page: what goes into the .ics file, then main's save dialog. Opens with everything on. */
export const ExportIcsDialog = freshOnOpen(ExportIcsDialogForm)
