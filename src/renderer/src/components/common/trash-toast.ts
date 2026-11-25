import { toast } from 'sonner'
import type { EntityRef } from '@shared/domain/common'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'

/**
 * «<Що> переміщено в кошик» with «Скасувати»: a missed click on the trash comes back right in the toast, not only
 * through the «Кошик» page. For a module's `remove` onSuccess in place of a plain toast.success.
 */
export function toastTrashed(message: string, entity: EntityRef): void {
  const ref = { type: entity.type, id: entity.id }
  toast.success(message, {
    action: {
      label: 'Скасувати',
      onClick: () =>
        void api.trash.restore(ref).then(invalidateAll, (e) => {
          toast.error('Не вдалося повернути запис. Відновіть його на сторінці «Кошик».')
          reportError(e, 'trash-toast:restore')
        })
    }
  })
}
